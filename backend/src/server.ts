import authRoutes from "./routes/auth";
import staffRoutes from "./routes/staff";
import adminRoutes from "./routes/admin";
import cinemaRoutes from "./routes/cinemas";
import roomRoutes from "./routes/rooms";
import seatRoutes from "./routes/seats";
import showtimeRoutes from "./routes/showtimes";
import privateScreeningRoutes from "./routes/privateScreenings";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import type { Pool, PoolClient } from "pg";
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
async function releaseExpiredBookings(
  db: Pool | PoolClient = pool
): Promise<void> {
  await db.query(`
    WITH expired_bookings AS (
      UPDATE bookings
      SET status = 'expired'
      WHERE status = 'pending_payment'
        AND (
          expires_at <= NOW()
          OR created_at <= NOW() - INTERVAL '31 minutes'
        )
      RETURNING booking_id
    )
    DELETE FROM booking_seats
    WHERE booking_id IN (
      SELECT booking_id FROM expired_bookings
    )
  `);
}

let bookingSchemaEnsured = false;

async function ensureBookingSchemaSupport(): Promise<void> {
  if (bookingSchemaEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id SERIAL PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('customer', 'staff', 'admin')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS movies (
      movie_id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      duration INT NOT NULL CHECK (duration > 0),
      poster_image TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cinemas (
      cinema_id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      location VARCHAR(150) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS screening_rooms (
      room_id SERIAL PRIMARY KEY,
      cinema_id INT NOT NULL REFERENCES cinemas(cinema_id) ON DELETE RESTRICT,
      room_name VARCHAR(100) NOT NULL,
      capacity INT NOT NULL CHECK (capacity > 0),
      CONSTRAINT unique_room_name UNIQUE (cinema_id, room_name)
    );

    CREATE TABLE IF NOT EXISTS seats (
      seat_id SERIAL PRIMARY KEY,
      room_id INT NOT NULL REFERENCES screening_rooms(room_id) ON DELETE CASCADE,
      row_label VARCHAR(10) NOT NULL CHECK (row_label <> '13'),
      seat_number INT NOT NULL CHECK (seat_number > 0),
      is_accessible BOOLEAN NOT NULL DEFAULT FALSE,
      CONSTRAINT unique_seat_position UNIQUE (room_id, row_label, seat_number)
    );

    CREATE TABLE IF NOT EXISTS showtimes (
      showtime_id SERIAL PRIMARY KEY,
      movie_id INT NOT NULL REFERENCES movies(movie_id) ON DELETE RESTRICT,
      room_id INT NOT NULL REFERENCES screening_rooms(room_id) ON DELETE RESTRICT,
      screening_time TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'cancelled', 'completed')),
      CONSTRAINT check_showtime_room UNIQUE (showtime_id, room_id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      booking_id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      showtime_id INT NOT NULL REFERENCES showtimes(showtime_id) ON DELETE RESTRICT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_booking_showtime UNIQUE (booking_id, showtime_id)
    );

    CREATE TABLE IF NOT EXISTS booking_seats (
      booking_seat_id SERIAL PRIMARY KEY,
      booking_id INT NOT NULL,
      showtime_id INT NOT NULL,
      seat_id INT NOT NULL REFERENCES seats(seat_id) ON DELETE RESTRICT,
      CONSTRAINT fk_booking_seats_booking
        FOREIGN KEY (booking_id, showtime_id)
        REFERENCES bookings(booking_id, showtime_id)
        ON DELETE CASCADE,
      CONSTRAINT unique_reserved_seat_per_showtime
        UNIQUE (showtime_id, seat_id)
    );

    CREATE TABLE IF NOT EXISTS ticket_types (
      ticket_type_code VARCHAR(30) PRIMARY KEY,
      display_name VARCHAR(100) NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents > 0),
      currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
      discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE
    );

    INSERT INTO ticket_types
      (ticket_type_code, display_name, price_cents, currency, discount_percent)
    VALUES
      ('adult', 'Adult ticket', 1500, 'EUR', 0),
      ('child', 'Child ticket (under 16)', 1275, 'EUR', 15),
      ('accessible', 'Accessible ticket', 1275, 'EUR', 15)
    ON CONFLICT (ticket_type_code) DO NOTHING;

    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
      ADD COLUMN IF NOT EXISTS total_amount_cents INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '31 minutes'),
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
      ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

    ALTER TABLE booking_seats
      ADD COLUMN IF NOT EXISTS ticket_type_code VARCHAR(30) NOT NULL DEFAULT 'adult',
      ADD COLUMN IF NOT EXISTS unit_price_cents INTEGER NOT NULL DEFAULT 1500;

    CREATE TABLE IF NOT EXISTS showtime_ticket_prices (
      showtime_id INTEGER NOT NULL
        REFERENCES showtimes(showtime_id) ON DELETE CASCADE,
      ticket_type_code VARCHAR(30) NOT NULL
        REFERENCES ticket_types(ticket_type_code),
      price_cents INTEGER NOT NULL CHECK (price_cents > 0),
      PRIMARY KEY (showtime_id, ticket_type_code)
    );

    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id VARCHAR(255) PRIMARY KEY,
      event_type VARCHAR(255) NOT NULL,
      processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure unique constraint on (showtime_id, seat_id) exists to prevent duplicate seat bookings
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_reserved_seat_per_showtime'
          AND conrelid = 'booking_seats'::regclass
      ) THEN
        ALTER TABLE booking_seats
          ADD CONSTRAINT unique_reserved_seat_per_showtime
          UNIQUE (showtime_id, seat_id);
      END IF;
    END $$;
  `);

  // 1. Seed default movies if movies table is empty
  const moviesCount = await pool.query(
    "SELECT COUNT(*)::int AS count FROM movies"
  );
  if (moviesCount.rows[0].count === 0) {
    await pool.query(`
      INSERT INTO movies (title, description, duration, poster_image)
      VALUES
        ('The Last Signal', 'A mysterious signal from space changes everything for a group of scientists.', 125, '/images/posters/the-last-signal.png'),
        ('Midnight Run', 'A detective races against time to solve a dangerous mystery in the city.', 118, '/images/posters/midnight-run.png'),
        ('Beyond the Stars', 'An astronaut begins an unforgettable journey beyond the solar system.', 142, '/images/posters/beyond-the-stars.png'),
        ('The Hidden Kingdom', 'A young adventurer discovers a secret kingdom hidden deep in the forest.', 110, '/images/posters/hidden-kingdom.png'),
        ('Final Destination', 'A group of friends must face unexpected challenges after a strange event.', 132, '/images/posters/final-destination.png'),
        ('Lost in Time', 'A scientist discovers a way to travel through time but faces unexpected consequences.', 128, '/images/posters/lost-in-time.png')
    `);
  }

  // 2. Seed default cinemas if cinemas table is empty
  let cinemasResult = await pool.query(
    "SELECT cinema_id FROM cinemas ORDER BY cinema_id ASC"
  );
  if (cinemasResult.rows.length === 0) {
    cinemasResult = await pool.query(`
      INSERT INTO cinemas (name, location)
      VALUES
        ('CINEMAX Central', 'Helsinki City Center'),
        ('CINEMAX Oulu Plaza', 'Oulu Downtown')
      RETURNING cinema_id
    `);
  }

  // 3. Seed default screening rooms if screening_rooms table is empty
  let roomsResult = await pool.query(
    "SELECT room_id, capacity FROM screening_rooms ORDER BY room_id ASC"
  );
  if (roomsResult.rows.length === 0) {
    const primaryCinemaId = cinemasResult.rows[0].cinema_id;
    const secondaryCinemaId =
      cinemasResult.rows[1]?.cinema_id ?? primaryCinemaId;

    roomsResult = await pool.query(
      `INSERT INTO screening_rooms (cinema_id, room_name, capacity)
       VALUES
         ($1, 'Screen 1 · IMAX', 48),
         ($1, 'Screen 2 · Dolby Atmos', 48),
         ($2, 'Screen 1 · Premier', 48)
       RETURNING room_id, capacity`,
      [primaryCinemaId, secondaryCinemaId]
    );
  }

  // 4. Ensure every screening room has a full 48-seat layout (Rows A-F, Seats 1-8)
  await pool.query(`
    UPDATE screening_rooms
    SET capacity = GREATEST(capacity, 48)
  `);

  const rowLabels = ["A", "B", "C", "D", "E", "F"];
  for (const room of roomsResult.rows) {
    const seatCountResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM seats WHERE room_id = $1",
      [room.room_id]
    );

    if (seatCountResult.rows[0].count < 48) {
      for (const rowLabel of rowLabels) {
        for (let seatNum = 1; seatNum <= 8; seatNum++) {
          const isAccessible =
            (rowLabel === "A" && (seatNum <= 2 || seatNum >= 7)) ||
            (rowLabel === "B" && seatNum <= 2);

          await pool.query(
            `INSERT INTO seats (room_id, row_label, seat_number, is_accessible)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (room_id, row_label, seat_number) DO NOTHING`,
            [room.room_id, rowLabel, seatNum, isAccessible]
          );
        }
      }
    }
  }

  // 5. Move any past scheduled showtimes into the future so showtimes never appear empty
  await pool.query(`
    UPDATE showtimes
    SET screening_time = DATE_TRUNC('hour', NOW()) + INTERVAL '1 day' + ((showtime_id % 5) * INTERVAL '3 hours')
    WHERE status = 'scheduled'
      AND screening_time <= NOW()
  `);

  // 6. Ensure every movie has at least 2 upcoming scheduled showtimes
  const allMovies = await pool.query(
    "SELECT movie_id FROM movies ORDER BY movie_id ASC"
  );
  const allRooms = roomsResult.rows;

  if (allRooms.length > 0) {
    for (let i = 0; i < allMovies.rows.length; i++) {
      const movieId = allMovies.rows[i].movie_id;
      const upcomingShowtimes = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM showtimes
         WHERE movie_id = $1
           AND status = 'scheduled'
           AND screening_time > NOW()`,
        [movieId]
      );

      if (upcomingShowtimes.rows[0].count === 0) {
        const room1 = allRooms[i % allRooms.length].room_id;
        const room2 = allRooms[(i + 1) % allRooms.length].room_id;

        await pool.query(
          `INSERT INTO showtimes (movie_id, room_id, screening_time, status)
           VALUES
             ($1, $2, DATE_TRUNC('hour', NOW()) + INTERVAL '6 hours' + ($4 * INTERVAL '1 hour'), 'scheduled'),
             ($1, $3, DATE_TRUNC('hour', NOW()) + INTERVAL '1 day 4 hours' + ($4 * INTERVAL '1 hour'), 'scheduled')`,
          [movieId, room1, room2, i]
        );
      }
    }
  }

  bookingSchemaEnsured = true;
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
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cinemas", cinemaRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/seats", seatRoutes);
app.use("/api/management/showtimes", showtimeRoutes);
app.use("/api/private-screenings", privateScreeningRoutes);
app.use("/api/private-screening-requests", privateScreeningRoutes);

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
    await ensureBookingSchemaSupport();

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
    await ensureBookingSchemaSupport();

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
    await ensureBookingSchemaSupport();

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
    await ensureBookingSchemaSupport();
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

  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const client = await pool.connect();

  let transactionStarted = false;
  let bookingId: number | undefined;
  let stripeSessionId: string | undefined;

  try {
    await ensureBookingSchemaSupport();

    await client.query("BEGIN");
    transactionStarted = true;

    // Check user (or ensure a default customer exists for guest checkout)
    let userResult = await client.query(
      `SELECT user_id, full_name, email
       FROM users
       WHERE user_id = $1`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      userResult = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ('Cinema Customer', 'customer@cinemax.com', 'guest_placeholder_hash', 'customer')
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING user_id, full_name, email`
      );
    }

    const user = userResult.rows[0];
    const resolvedUserId = Number(user.user_id);

    // Lock showtime to serialize concurrent seat booking attempts for this screening
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

    // Atomically release any expired unpaid reservations while holding the showtime lock
    await releaseExpiredBookings(client);

    // Verify seats belong to this room and lock them in deterministic seat_id order
    const seatResult = await client.query(
      `SELECT seat_id, row_label, seat_number
       FROM seats
       WHERE room_id = $1
         AND seat_id = ANY($2::int[])
       ORDER BY seat_id ASC
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
      `SELECT bs.seat_id, s.row_label, s.seat_number
       FROM booking_seats bs
       JOIN bookings b ON b.booking_id = bs.booking_id
       JOIN seats s ON s.seat_id = bs.seat_id
       WHERE bs.showtime_id = $1
         AND bs.seat_id = ANY($2::int[])
         AND (
           b.status = 'paid'
           OR (
             b.status = 'pending_payment'
             AND b.expires_at > NOW()
           )
         )
       ORDER BY s.row_label, s.seat_number`,
      [showtime_id, seatIds]
    );

    if (bookedResult.rows.length > 0) {
      const seatLabels = bookedResult.rows
        .map(
          (row: { row_label: string; seat_number: number }) =>
            `${row.row_label}${row.seat_number}`
        )
        .join(", ");
      const unavailableSeatIds = bookedResult.rows.map(
        (row: { seat_id: number }) => Number(row.seat_id)
      );

      throw Object.assign(
        new Error(
          `One or more selected seats (${seatLabels}) are no longer available. Please choose another available seat.`
        ),
        {
          status: 409,
          unavailable_seat_ids: unavailableSeatIds,
        }
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
      [resolvedUserId, showtime_id, totalAmount, HOLD_MINUTES]
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

    // If Stripe is not configured in local development, redirect directly to the confirmation/hold page
    if (!stripe) {
      return res.status(201).json({
        message:
          "Reservation hold created. Complete payment before the reservation expires.",
        booking_id: bookingId,
        checkout_url: `${clientUrl}/booking-confirmation/${bookingId}?payment=hold`,
        total_amount_cents: totalAmount,
        currency: "EUR",
        expires_in_minutes: HOLD_MINUTES,
      });
    }

    const stripeClient = getStripeClient();

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
          `${clientUrl}/booking-confirmation/${bookingId}` +
          "?payment=processing&session_id={CHECKOUT_SESSION_ID}",
        cancel_url:
          `${clientUrl}/booking-summary/${showtime_id}` +
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
    if (stripeSessionId && stripe) {
      try {
        await stripe.checkout.sessions.expire(stripeSessionId);
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
      unavailable_seat_ids?: number[];
    };

    if (apiError.status) {
      return res.status(apiError.status).json({
        error: apiError.message,
        unavailable_seat_ids: apiError.unavailable_seat_ids,
      });
    }

    if (apiError.code === "23505") {
      return res.status(409).json({
        error:
          "One or more selected seats are no longer available. Another customer has already reserved them.",
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
// Direct Booking & Reservation Expiry Management APIs
// --------------------------------------------------

app.post("/api/bookings", async (req, res) => {
  const { user_id = 1, showtime_id, seat_ids, tickets } = req.body ?? {};

  const normalizedTickets = Array.isArray(tickets)
    ? tickets
    : Array.isArray(seat_ids)
      ? seat_ids.map((id: number) => ({
          seat_id: Number(id),
          ticket_type_code: "adult",
        }))
      : [];

  if (
    !Number.isInteger(Number(user_id)) ||
    Number(user_id) <= 0 ||
    !Number.isInteger(Number(showtime_id)) ||
    Number(showtime_id) <= 0 ||
    normalizedTickets.length === 0 ||
    !normalizedTickets.every(
      (t: any) =>
        Number.isInteger(t.seat_id) &&
        t.seat_id > 0 &&
        ["adult", "child", "accessible"].includes(
          t.ticket_type_code || "adult"
        )
    )
  ) {
    return res.status(400).json({
      error: "Valid user_id, showtime_id, and seat selections are required.",
    });
  }

  const seatIds: number[] = normalizedTickets.map(
    (t: { seat_id: number }) => t.seat_id
  );

  if (new Set(seatIds).size !== seatIds.length) {
    return res.status(400).json({
      error: "Duplicate seat IDs are not allowed in the same booking.",
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await ensureBookingSchemaSupport();

    await client.query("BEGIN");
    transactionStarted = true;

    let userResult = await client.query(
      `SELECT user_id, full_name, email
       FROM users
       WHERE user_id = $1`,
      [Number(user_id)]
    );

    if (userResult.rows.length === 0) {
      userResult = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ('Cinema Customer', 'customer@cinemax.com', 'guest_placeholder_hash', 'customer')
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING user_id, full_name, email`
      );
    }

    const resolvedUserId = Number(userResult.rows[0].user_id);

    const showtimeResult = await client.query(
      `SELECT showtime_id, room_id, status, screening_time
       FROM showtimes
       WHERE showtime_id = $1
       FOR UPDATE`,
      [Number(showtime_id)]
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

    // Release expired unpaid holds while holding the showtime lock
    await releaseExpiredBookings(client);

    const seatResult = await client.query(
      `SELECT seat_id, row_label, seat_number
       FROM seats
       WHERE room_id = $1
         AND seat_id = ANY($2::int[])
       ORDER BY seat_id ASC
       FOR UPDATE`,
      [showtime.room_id, seatIds]
    );

    if (seatResult.rows.length !== seatIds.length) {
      throw Object.assign(
        new Error("One or more seats are invalid for this showtime."),
        { status: 400 }
      );
    }

    const bookedResult = await client.query(
      `SELECT bs.seat_id, s.row_label, s.seat_number
       FROM booking_seats bs
       JOIN bookings b ON b.booking_id = bs.booking_id
       JOIN seats s ON s.seat_id = bs.seat_id
       WHERE bs.showtime_id = $1
         AND bs.seat_id = ANY($2::int[])
         AND (
           b.status = 'paid'
           OR (
             b.status = 'pending_payment'
             AND b.expires_at > NOW()
           )
         )
       ORDER BY s.row_label, s.seat_number`,
      [Number(showtime_id), seatIds]
    );

    if (bookedResult.rows.length > 0) {
      const seatLabels = bookedResult.rows
        .map(
          (row: { row_label: string; seat_number: number }) =>
            `${row.row_label}${row.seat_number}`
        )
        .join(", ");

      throw Object.assign(
        new Error(
          `One or more selected seats (${seatLabels}) are already booked for this screening.`
        ),
        {
          status: 409,
          unavailable_seat_ids: bookedResult.rows.map(
            (r: { seat_id: number }) => Number(r.seat_id)
          ),
        }
      );
    }

    const totalAmount = normalizedTickets.length * 1500;

    const bookingResult = await client.query(
      `INSERT INTO bookings
         (user_id, showtime_id, status, total_amount_cents, currency, expires_at)
       VALUES
         ($1, $2, 'pending_payment', $3, 'EUR', NOW() + ($4 * INTERVAL '1 minute'))
       RETURNING booking_id, user_id, showtime_id, status, total_amount_cents, currency, created_at, expires_at`,
      [resolvedUserId, Number(showtime_id), totalAmount, HOLD_MINUTES]
    );

    const booking = bookingResult.rows[0];

    for (const ticket of normalizedTickets) {
      await client.query(
        `INSERT INTO booking_seats
           (booking_id, showtime_id, seat_id, ticket_type_code, unit_price_cents)
         VALUES ($1, $2, $3, $4, 1500)`,
        [
          booking.booking_id,
          Number(showtime_id),
          ticket.seat_id,
          ticket.ticket_type_code || "adult",
        ]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      message: "Booking reservation created successfully.",
      booking_id: booking.booking_id,
      booking,
      seat_ids: seatIds,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    const apiError = error as {
      status?: number;
      code?: string;
      message?: string;
      unavailable_seat_ids?: number[];
    };

    if (apiError.status) {
      return res.status(apiError.status).json({
        error: apiError.message,
        unavailable_seat_ids: apiError.unavailable_seat_ids,
      });
    }

    if (apiError.code === "23505") {
      return res.status(409).json({
        error:
          "One or more selected seats are no longer available for this screening.",
      });
    }

    console.error("Direct booking error:", error);

    return res.status(500).json({
      error: "Failed to create booking.",
    });
  } finally {
    client.release();
  }
});

// Confirm payment for an active reservation hold (if not yet expired)
app.post("/api/bookings/:bookingId/confirm-payment", async (req, res) => {
  const bookingId = Number(req.params.bookingId);

  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking ID." });
  }

  const client = await pool.connect();

  try {
    await ensureBookingSchemaSupport();
    await client.query("BEGIN");

    await releaseExpiredBookings(client);

    const bookingResult = await client.query(
      `SELECT booking_id, status, expires_at
       FROM bookings
       WHERE booking_id = $1
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found." });
    }

    const booking = bookingResult.rows[0];

    if (booking.status === "paid") {
      await client.query("COMMIT");
      return res.status(200).json({
        message: "Booking is already confirmed and paid.",
        status: "paid",
      });
    }

    if (booking.status !== "pending_payment") {
      await client.query("COMMIT");
      return res.status(409).json({
        error:
          "This reservation has expired or was cancelled, and the seats have been released.",
      });
    }

    await client.query(
      `UPDATE bookings
       SET status = 'paid',
           paid_at = NOW()
       WHERE booking_id = $1`,
      [bookingId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Booking payment confirmed.",
      status: "paid",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Confirm payment error:", error);
    return res.status(500).json({
      error: "Failed to confirm booking payment.",
    });
  } finally {
    client.release();
  }
});

// Expire an unpaid reservation and release its seats immediately
app.post("/api/bookings/:bookingId/expire", async (req, res) => {
  const bookingId = Number(req.params.bookingId);

  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking ID." });
  }

  const client = await pool.connect();

  try {
    await ensureBookingSchemaSupport();
    await client.query("BEGIN");

    const bookingResult = await client.query(
      `SELECT booking_id, status
       FROM bookings
       WHERE booking_id = $1
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found." });
    }

    const booking = bookingResult.rows[0];

    if (booking.status === "paid") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Paid bookings cannot be expired as unpaid reservations.",
      });
    }

    await client.query(
      `DELETE FROM booking_seats
       WHERE booking_id = $1`,
      [bookingId]
    );

    await client.query(
      `UPDATE bookings
       SET status = 'expired',
           expires_at = NOW()
       WHERE booking_id = $1`,
      [bookingId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message:
        "Unpaid reservation expired and reserved seats have been released.",
      status: "expired",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Expire booking error:", error);
    return res.status(500).json({
      error: "Failed to expire reservation.",
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
    await ensureBookingSchemaSupport();
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
  ensureBookingSchemaSupport().catch((err) => {
    console.error("Initial schema/seed check failed:", err);
  });
});
