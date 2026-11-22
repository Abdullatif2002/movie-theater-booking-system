
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection test
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

// Health check API
app.get("/api/health", (_req, res) => {
  res.json({
    status: "OK",
    message: "Movie Theater Booking API is running!",
  });
});

// Movie Listing API - FR-001
app.get("/api/movies", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT movie_id, title, description, duration, poster_image
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

// Showtimes API - FR-002
// Only future scheduled showtimes are returned
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

// Seat Layout API - FR-003
app.get("/api/showtimes/:showtimeId/seats", async (req, res) => {
  const showtimeId = Number(req.params.showtimeId);

  if (!Number.isInteger(showtimeId) || showtimeId <= 0) {
    return res.status(400).json({ error: "Invalid showtime ID" });
  }

  try {
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

    // Retrieve seats and their actual booking status
    const seatsResult = await pool.query(
      `SELECT
          s.seat_id,
          s.row_label,
          s.seat_number,
          s.is_accessible,
          CASE
            WHEN bs.seat_id IS NOT NULL THEN TRUE
            ELSE FALSE
          END AS is_booked
       FROM seats s
       LEFT JOIN booking_seats bs
          ON bs.seat_id = s.seat_id
          AND bs.showtime_id = $2
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

// Create Booking API - FR-005
app.post("/api/bookings", async (req, res) => {
  const { user_id, showtime_id, seat_ids } = req.body;

  if (
    !Number.isInteger(user_id) ||
    user_id <= 0 ||
    !Number.isInteger(showtime_id) ||
    showtime_id <= 0 ||
    !Array.isArray(seat_ids) ||
    seat_ids.length === 0 ||
    !seat_ids.every(
      (id: unknown) => Number.isInteger(id) && Number(id) > 0
    ) ||
    new Set(seat_ids).size !== seat_ids.length
  ) {
    return res.status(400).json({
      error: "Valid user, showtime and unique seat IDs are required.",
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Check that the user exists
    const userResult = await client.query(
      "SELECT user_id FROM users WHERE user_id = $1",
      [user_id]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({ error: "User not found." });
    }

    // Lock the showtime row to prevent concurrent booking conflicts
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
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({ error: "Showtime not found." });
    }

    const showtime = showtimeResult.rows[0];

    // Check showtime status
    if (showtime.status !== "scheduled") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        error: "This showtime is not available for booking.",
      });
    }

    // Prevent booking for past or already started screenings
    const screeningTime = new Date(showtime.screening_time).getTime();

    if (
      !Number.isFinite(screeningTime) ||
      screeningTime <= Date.now()
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        error: "This screening has already started or passed. Booking is closed.",
      });
    }

    // Verify that all selected seats belong to this screening room
    const seatResult = await client.query(
      `SELECT seat_id
       FROM seats
       WHERE room_id = $1
         AND seat_id = ANY($2::int[])`,
      [showtime.room_id, seat_ids]
    );

    if (seatResult.rows.length !== seat_ids.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        error: "One or more selected seats are invalid for this showtime.",
      });
    }

    // Check whether any selected seat is already booked
    const bookedResult = await client.query(
      `SELECT seat_id
       FROM booking_seats
       WHERE showtime_id = $1
         AND seat_id = ANY($2::int[])`,
      [showtime_id, seat_ids]
    );

    if (bookedResult.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        error: "One or more selected seats are already booked.",
        booked_seats: bookedResult.rows.map((row) => row.seat_id),
      });
    }

    // Create the booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (user_id, showtime_id)
       VALUES ($1, $2)
       RETURNING booking_id, user_id, showtime_id, created_at`,
      [user_id, showtime_id]
    );

    const booking = bookingResult.rows[0];

    // Add selected seats to the booking
    for (const seatId of seat_ids as number[]) {
      await client.query(
        `INSERT INTO booking_seats (booking_id, showtime_id, seat_id)
         VALUES ($1, $2, $3)`,
        [booking.booking_id, showtime_id, seatId]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      message: "Booking created successfully.",
      booking,
      seat_ids,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    const pgError = error as { code?: string };

    if (pgError.code === "23505") {
      return res.status(409).json({
        error: "One or more selected seats are already booked.",
      });
    }

    console.error("Booking creation error:", error);

    return res.status(500).json({
      error: "Failed to create booking.",
    });
  } finally {
    client.release();
  }
});

// Get Booking Details API - FR-005
app.get("/api/bookings/:bookingId", async (req, res) => {
  const bookingId = Number(req.params.bookingId);

  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking ID." });
  }

  try {
    const bookingResult = await pool.query(
      `SELECT
          b.booking_id,
          b.user_id,
          b.showtime_id,
          b.created_at,
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
      return res.status(404).json({ error: "Booking not found." });
    }

    const seatsResult = await pool.query(
      `SELECT
          s.seat_id,
          s.row_label,
          s.seat_number,
          s.is_accessible
       FROM booking_seats bs
       JOIN seats s ON bs.seat_id = s.seat_id
       WHERE bs.booking_id = $1
         AND bs.showtime_id = $2
       ORDER BY s.row_label, s.seat_number`,
      [
        bookingId,
        bookingResult.rows[0].showtime_id,
      ]
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

// Start server
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
