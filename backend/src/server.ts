
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import { pool } from "./db";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOLD_MINUTES = 31;

const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// --------------------------------------------------
// Helper functions
// --------------------------------------------------

function getStripeClient(): Stripe {
  if (!stripe) {
    throw new Error("Stripe is not configured. Check STRIPE_SECRET_KEY.");
  }

  return stripe;
}

// Expired pending bookings release their seats.
// Booking records remain in the database for history.
async function releaseExpiredBookings(): Promise<void> {
  await pool.query(`
    WITH expired_bookings AS (
      UPDATE bookings
      SET status = 'expired'
      WHERE status = 'pending_payment'
        AND expires_at <= NOW()
      RETURNING booking_id
    )
    DELETE FROM booking_seats
    WHERE booking_id IN (
      SELECT booking_id FROM expired_bookings
    )
  `);
}

// --------------------------------------------------
// Stripe Webhook
// IMPORTANT: This route must be before express.json()
// --------------------------------------------------

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];

    if (!stripe || !webhookSecret || !signature) {
      return res.status(400).send("Stripe webhook configuration is missing.");
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret
      );
    } catch (error) {
      console.error("Stripe signature verification failed:", error);
      return res.status(400).send("Invalid webhook signature.");
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = Number(session.metadata?.bookingId);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(200).json({ received: true });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Insert event only once. Duplicate Stripe events are ignored.
      const eventResult = await client.query(
        `INSERT INTO stripe_webhook_events (event_id, event_type)
         VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [event.id, event.type]
      );

      if (eventResult.rows.length === 0) {
        await client.query("COMMIT");

        return res.status(200).json({
          received: true,
          duplicate: true,
        });
      }

      const bookingResult = await client.query(
        `SELECT
            booking_id,
            status,
            total_amount_cents,
            currency,
            stripe_checkout_session_id
         FROM bookings
         WHERE booking_id = $1
         FOR UPDATE`,
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        await client.query("COMMIT");
        return res.status(200).json({ received: true });
      }

      const booking = bookingResult.rows[0];

      // Successful Checkout payment
      if (
        event.type === "checkout.session.completed" &&
        session.payment_status === "paid"
      ) {
        const expectedAmount = Number(booking.total_amount_cents);
        const actualAmount = session.amount_total;

        const correctCurrency =
          session.currency === String(booking.currency).toLowerCase();

        const correctSession =
          booking.stripe_checkout_session_id === session.id;

        if (booking.status === "pending_payment") {
          if (
            !correctSession ||
            actualAmount !== expectedAmount ||
            !correctCurrency
          ) {
            // Roll back the event record too, so Stripe can retry.
            throw new Error(
              `Payment verification mismatch for booking ${bookingId}`
            );
          }

          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;

          await client.query(
            `UPDATE bookings
             SET status = 'paid',
                 paid_at = NOW(),
                 stripe_payment_intent_id = $1
             WHERE booking_id = $2
               AND status = 'pending_payment'`,
            [paymentIntentId, bookingId]
          );
        }
      }

      // Checkout session expired
      if (event.type === "checkout.session.expired") {
        if (
          booking.status === "pending_payment" &&
          booking.stripe_checkout_session_id === session.id
        ) {
          await client.query(
            `DELETE FROM booking_seats
             WHERE booking_id = $1`,
            [bookingId]
          );

          await client.query(
            `UPDATE bookings
             SET status = 'expired'
             WHERE booking_id = $1
               AND status = 'pending_payment'`,
            [bookingId]
          );
        }
      }

      await client.query("COMMIT");

      return res.status(200).json({ received: true });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Stripe webhook processing error:", error);

      return res.status(500).json({
        error: "Webhook processing failed.",
      });
    } finally {
      client.release();
    }
  }
);

// --------------------------------------------------
// Normal middleware (after Stripe webhook)
// --------------------------------------------------

app.use(cors());
app.use(express.json());

// --------------------------------------------------
// Database connection test
// --------------------------------------------------

app.get("/api/db-test", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    return res.json({
      status: "OK",
      message: "Database connected successfully!",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database connection error:", error);

    return res.status(500).json({
      status: "ERROR",
      message: "Database connection failed",
    });
  }
});

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  return res.json({
    status: "OK",
    message: "Movie Theater Booking API is running!",
  });
});

// --------------------------------------------------
// Movie Listing API - FR-001
// --------------------------------------------------

app.get("/api/movies", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          movie_id,
          title,
          description,
          duration,
          poster_image
       FROM movies
       ORDER BY movie_id`
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error retrieving movies:", error);

    return res.status(500).json({
      error: "Failed to retrieve movies",
    });
  }
});

// --------------------------------------------------
// Showtimes API - FR-002
// --------------------------------------------------

app.get("/api/movies/:movieId/showtimes", async (req, res) => {
  const movieId = Number(req.params.movieId);

  if (!Number.isInteger(movieId) || movieId <= 0) {
    return res.status(400).json({ error: "Invalid movie ID" });
  }

  try {
    const movieResult = await pool.query(
      "SELECT movie_id FROM movies WHERE movie_id = $1",
      [movieId]
    );

    if (movieResult.rows.length === 0) {
      return res.status(404).json({ error: "Movie not found" });
    }

    const result = await pool.query(
      `SELECT
          st.showtime_id,
          st.movie_id,
          st.room_id,
          st.screening_time,
          st.status,
          sr.room_name,
          sr.capacity,
          c.cinema_id,
          c.name AS cinema_name,
          c.location AS cinema_location
       FROM showtimes st
       JOIN screening_rooms sr ON st.room_id = sr.room_id
       JOIN cinemas c ON sr.cinema_id = c.cinema_id
       WHERE st.movie_id = $1
         AND st.status = 'scheduled'
         AND st.screening_time > NOW()
       ORDER BY st.screening_time`,
      [movieId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error retrieving showtimes:", error);

    return res.status(500).json({
      error: "Failed to retrieve showtimes",
    });
  }
});

// --------------------------------------------------
// Ticket Prices API
// --------------------------------------------------

app.get("/api/showtimes/:showtimeId/ticket-prices", async (req, res) => {
  const showtimeId = Number(req.params.showtimeId);

  if (!Number.isInteger(showtimeId) || showtimeId <= 0) {
    return res.status(400).json({ error: "Invalid showtime ID." });
  }

  try {
    const showtimeResult = await pool.query(
      "SELECT showtime_id FROM showtimes WHERE showtime_id = $1",
      [showtimeId]
    );

    if (showtimeResult.rows.length === 0) {
      return res.status(404).json({ error: "Showtime not found." });
    }

    const result = await pool.query(
      `SELECT
          tt.ticket_type_code,
          tt.display_name,
          COALESCE(stp.price_cents, tt.price_cents) AS price_cents,
          tt.currency,
          tt.discount_percent
       FROM ticket_types tt
       LEFT JOIN showtime_ticket_prices stp
         ON stp.ticket_type_code = tt.ticket_type_code
         AND stp.showtime_id = $1
       WHERE tt.active = TRUE
       ORDER BY tt.ticket_type_code`,
      [showtimeId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Ticket price error:", error);

    return res.status(500).json({
      error: "Failed to load ticket prices.",
    });
  }
});

// --------------------------------------------------
// Seat Layout API - FR-003
// --------------------------------------------------

app.get("/api/showtimes/:showtimeId/seats", async (req, res) => {
  const showtimeId = Number(req.params.showtimeId);

  if (!Number.isInteger(showtimeId) || showtimeId <= 0) {
    return res.status(400).json({ error: "Invalid showtime ID" });
  }

  try {
    await releaseExpiredBookings();

    const showtimeResult = await pool.query(
      `SELECT
          st.showtime_id,
          st.movie_id,
          st.screening_time,
          st.status,
          sr.room_id,
          sr.room_name,
          sr.capacity,
          c.cinema_id,
          c.name AS cinema_name,
          c.location AS cinema_location
       FROM showtimes st
       JOIN screening_rooms sr ON st.room_id = sr.room_id
       JOIN cinemas c ON sr.cinema_id = c.cinema_id
       WHERE st.showtime_id = $1`,
      [showtimeId]
    );

    if (showtimeResult.rows.length === 0) {
      return res.status(404).json({ error: "Showtime not found" });
    }

    const showtime = showtimeResult.rows[0];

    const seatsResult = await pool.query(
      `SELECT
          s.seat_id,
          s.row_label,
          s.seat_number,
          s.is_accessible,
          EXISTS (
            SELECT 1
            FROM booking_seats bs
            JOIN bookings b ON b.booking_id = bs.booking_id
            WHERE bs.seat_id = s.seat_id
              AND bs.showtime_id = $2
              AND (
                b.status = 'paid'
                OR (
                  b.status = 'pending_payment'
                  AND b.expires_at > NOW()
                )
              )
          ) AS is_booked
       FROM seats s
       WHERE s.room_id = $1
       ORDER BY s.row_label, s.seat_number`,
      [showtime.room_id, showtimeId]
    );

    return res.status(200).json({
      showtime: {
        showtime_id: showtime.showtime_id,
        movie_id: showtime.movie_id,
        screening_time: showtime.screening_time,
        status: showtime.status,
      },
      cinema: {
        cinema_id: showtime.cinema_id,
        name: showtime.cinema_name,
        location: showtime.cinema_location,
      },
      room: {
        room_id: showtime.room_id,
        room_name: showtime.room_name,
        capacity: showtime.capacity,
      },
      seats: seatsResult.rows,
    });
  } catch (error) {
    console.error("Error retrieving seat layout:", error);

    return res.status(500).json({
      error: "Failed to retrieve seat layout",
    });
  }
});

// --------------------------------------------------
// Create pending booking and Stripe Checkout - FR-005
// --------------------------------------------------

app.post("/api/checkout-sessions", async (req, res) => {
  const { user_id, showtime_id, tickets } = req.body;

  if (
    !Number.isInteger(user_id) ||
    user_id <= 0 ||
    !Number.isInteger(showtime_id) ||
    showtime_id <= 0 ||
    !Array.isArray(tickets) ||
    tickets.length === 0 ||
    !tickets.every(
      (ticket: any) =>
        Number.isInteger(ticket.seat_id) &&
        ticket.seat_id > 0 &&
        ["adult", "child", "accessible"].includes(ticket.ticket_type_code)
    )
  ) {
    return res.status(400).json({
      error: "Valid user, showtime and ticket selections are required.",
    });
  }

  const seatIds: number[] = tickets.map(
    (ticket: { seat_id: number }) => ticket.seat_id
  );

  if (new Set(seatIds).size !== seatIds.length) {
    return res.status(400).json({
      error: "Duplicate seat IDs are not allowed.",
    });
  }

  if (!process.env.CLIENT_URL) {
    return res.status(500).json({
      error: "CLIENT_URL is not configured.",
    });
  }

  if (!stripe) {
    return res.status(500).json({
      error: "Stripe is not configured.",
    });
  }

  const stripeClient = getStripeClient();
  const client = await pool.connect();

  let transactionStarted = false;
  let bookingId: number | undefined;
  let stripeSessionId: string | undefined;

  try {
    await releaseExpiredBookings();

    await client.query("BEGIN");
    transactionStarted = true;

    // Check user
    const userResult = await client.query(
      `SELECT user_id, full_name, email
       FROM users
       WHERE user_id = $1`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      throw Object.assign(new Error("User not found."), {
        status: 404,
      });
    }

    const user = userResult.rows[0];

    // Lock showtime to prevent concurrent booking conflicts
    const showtimeResult = await client.query(
      `SELECT
          showtime_id,
          room_id,
          status,
          screening_time
       FROM showtimes
       WHERE showtime_id = $1
       FOR UPDATE`,
      [showtime_id]
    );

    if (showtimeResult.rows.length === 0) {
      throw Object.assign(new Error("Showtime not found."), {
        status: 404,
      });
    }

    const showtime = showtimeResult.rows[0];

    if (
      showtime.status !== "scheduled" ||
      new Date(showtime.screening_time).getTime() <= Date.now()
    ) {
      throw Object.assign(
        new Error("This showtime is no longer available for booking."),
        { status: 409 }
      );
    }

    // Verify seats belong to this room
    const seatResult = await client.query(
      `SELECT seat_id
       FROM seats
       WHERE room_id = $1
         AND seat_id = ANY($2::int[])
       FOR UPDATE`,
      [showtime.room_id, seatIds]
    );

    if (seatResult.rows.length !== seatIds.length) {
      throw Object.assign(
        new Error("One or more seats are invalid for this showtime."),
        { status: 400 }
      );
    }

    // Check active bookings and active payment holds
    const bookedResult = await client.query(
      `SELECT bs.seat_id
       FROM booking_seats bs
       JOIN bookings b ON b.booking_id = bs.booking_id
       WHERE bs.showtime_id = $1
         AND bs.seat_id = ANY($2::int[])
         AND (
           b.status = 'paid'
           OR (
             b.status = 'pending_payment'
             AND b.expires_at > NOW()
           )
         )`,
      [showtime_id, seatIds]
    );

    if (bookedResult.rows.length > 0) {
      throw Object.assign(
        new Error("One or more selected seats are no longer available."),
        { status: 409 }
      );
    }

    // Load authoritative prices from database
    const priceResult = await client.query(
      `SELECT
          tt.ticket_type_code,
          COALESCE(stp.price_cents, tt.price_cents) AS price_cents,
          tt.currency
       FROM ticket_types tt
       LEFT JOIN showtime_ticket_prices stp
         ON stp.ticket_type_code = tt.ticket_type_code
         AND stp.showtime_id = $1
       WHERE tt.active = TRUE`,
      [showtime_id]
    );

    const prices = new Map<
      string,
      { price: number; currency: string }
    >();

    for (const row of priceResult.rows as {
      ticket_type_code: string;
      price_cents: number | string;
      currency: string;
    }[]) {
      prices.set(row.ticket_type_code, {
        price: Number(row.price_cents),
        currency: row.currency,
      });
    }

    let totalAmount = 0;

    const ticketLines: {
      seat_id: number;
      ticket_type_code: string;
      unit_price_cents: number;
    }[] = [];

    for (const ticket of tickets as {
      seat_id: number;
      ticket_type_code: string;
    }[]) {
      const price = prices.get(ticket.ticket_type_code);

      if (
        !price ||
        price.currency !== "EUR" ||
        !Number.isSafeInteger(price.price) ||
        price.price <= 0
      ) {
        throw Object.assign(
          new Error("Invalid ticket type or ticket price."),
          { status: 400 }
        );
      }

      totalAmount += price.price;

      ticketLines.push({
        seat_id: ticket.seat_id,
        ticket_type_code: ticket.ticket_type_code,
        unit_price_cents: price.price,
      });
    }

    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
      throw Object.assign(new Error("Invalid booking total."), {
        status: 400,
      });
    }

    // Create pending booking with seat hold
    const bookingResult = await client.query(
      `INSERT INTO bookings
         (user_id, showtime_id, status, total_amount_cents,
          currency, expires_at)
       VALUES
         ($1, $2, 'pending_payment', $3, 'EUR',
          NOW() + ($4 * INTERVAL '1 minute'))
       RETURNING booking_id`,
      [user_id, showtime_id, totalAmount, HOLD_MINUTES]
    );

    bookingId = Number(bookingResult.rows[0].booking_id);

    // Save selected seats and ticket prices
    for (const ticket of ticketLines) {
      await client.query(
        `INSERT INTO booking_seats
           (booking_id, showtime_id, seat_id,
            ticket_type_code, unit_price_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          bookingId,
          showtime_id,
          ticket.seat_id,
          ticket.ticket_type_code,
          ticket.unit_price_cents,
        ]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    // Group identical ticket types for Stripe Checkout
    const grouped = new Map<
      string,
      { quantity: number; unitPrice: number }
    >();

    for (const ticket of ticketLines) {
      const existing = grouped.get(ticket.ticket_type_code);

      if (existing) {
        existing.quantity += 1;
      } else {
        grouped.set(ticket.ticket_type_code, {
          quantity: 1,
          unitPrice: ticket.unit_price_cents,
        });
      }
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      Array.from(grouped.entries()).map(([type, item]) => ({
        quantity: item.quantity,
        price_data: {
          currency: "eur",
          unit_amount: item.unitPrice,
          product_data: {
            name:
              type === "child"
                ? "Child ticket (under 16)"
                : type === "accessible"
                  ? "Accessible ticket"
                  : "Adult ticket",
          },
        },
      }));

    // Create Stripe Checkout Session
    const session = await stripeClient.checkout.sessions.create(
      {
        mode: "payment",
        line_items: lineItems,
        customer_email: user.email ?? undefined,
        metadata: {
          bookingId: String(bookingId),
          showtimeId: String(showtime_id),
        },
        expires_at:
          Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60,
        success_url:
          `${process.env.CLIENT_URL}/booking-confirmation/${bookingId}` +
          "?payment=processing&session_id={CHECKOUT_SESSION_ID}",
        cancel_url:
          `${process.env.CLIENT_URL}/booking-summary/${showtime_id}` +
          "?payment=cancelled",
      },
      {
        idempotencyKey: `cinemax-booking-${bookingId}`,
      }
    );

    stripeSessionId = session.id;

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    // Save Checkout Session ID
    await pool.query(
      `UPDATE bookings
       SET stripe_checkout_session_id = $1
       WHERE booking_id = $2
         AND status = 'pending_payment'`,
      [session.id, bookingId]
    );

    return res.status(201).json({
      message: "Pending booking created. Continue to Stripe Checkout.",
      booking_id: bookingId,
      checkout_url: session.url,
      total_amount_cents: totalAmount,
      currency: "EUR",
      expires_in_minutes: HOLD_MINUTES,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }

    // Expire any created Checkout Session if later processing failed
    if (stripeSessionId) {
      try {
        await stripeClient.checkout.sessions.expire(stripeSessionId);
      } catch (expireError) {
        console.error("Could not expire Stripe session:", expireError);
      }
    }

    // Release seats if Checkout could not be started
    if (bookingId) {
      try {
        await pool.query(
          `DELETE FROM booking_seats
           WHERE booking_id = $1`,
          [bookingId]
        );

        await pool.query(
          `UPDATE bookings
           SET status = 'failed'
           WHERE booking_id = $1
             AND status = 'pending_payment'`,
          [bookingId]
        );
      } catch (cleanupError) {
        console.error("Booking cleanup error:", cleanupError);
      }
    }

    const apiError = error as {
      status?: number;
      code?: string;
      message?: string;
    };

    if (apiError.status) {
      return res.status(apiError.status).json({
        error: apiError.message,
      });
    }

    if (apiError.code === "23505") {
      return res.status(409).json({
        error: "One or more selected seats are no longer available.",
      });
    }

    console.error("Checkout creation error:", error);

    return res.status(500).json({
      error: "Unable to start Stripe Checkout.",
    });
  } finally {
    client.release();
  }
});

// --------------------------------------------------
// Booking Details API - FR-005
// --------------------------------------------------

app.get("/api/bookings/:bookingId", async (req, res) => {
  const bookingId = Number(req.params.bookingId);

  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({
      error: "Invalid booking ID.",
    });
  }

  try {
    await releaseExpiredBookings();

    const bookingResult = await pool.query(
      `SELECT
          b.booking_id,
          b.user_id,
          b.showtime_id,
          b.created_at,
          b.status AS payment_status,
          b.total_amount_cents,
          b.currency,
          b.paid_at,
          b.expires_at,
          u.full_name,
          u.email,
          m.title AS movie_title,
          st.screening_time,
          st.status AS showtime_status,
          c.name AS cinema_name,
          c.location AS cinema_location,
          sr.room_name
       FROM bookings b
       JOIN users u ON b.user_id = u.user_id
       JOIN showtimes st ON b.showtime_id = st.showtime_id
       JOIN movies m ON st.movie_id = m.movie_id
       JOIN screening_rooms sr ON st.room_id = sr.room_id
       JOIN cinemas c ON sr.cinema_id = c.cinema_id
       WHERE b.booking_id = $1`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        error: "Booking not found.",
      });
    }

    const seatsResult = await pool.query(
      `SELECT
          s.seat_id,
          s.row_label,
          s.seat_number,
          s.is_accessible,
          bs.ticket_type_code,
          bs.unit_price_cents
       FROM booking_seats bs
       JOIN seats s ON bs.seat_id = s.seat_id
       WHERE bs.booking_id = $1
       ORDER BY s.row_label, s.seat_number`,
      [bookingId]
    );

    return res.status(200).json({
      booking: bookingResult.rows[0],
      seats: seatsResult.rows,
    });
  } catch (error) {
    console.error("Booking retrieval error:", error);

    return res.status(500).json({
      error: "Failed to retrieve booking details.",
    });
  }
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
