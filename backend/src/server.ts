
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
    res.json({
      status: "OK",
      message: "Database connected successfully!",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({
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

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error retrieving movies:", error);

    res.status(500).json({
      error: "Failed to retrieve movies",
    });
  }
});

// Showtimes API - FR-002
app.get("/api/movies/:movieId/showtimes", async (req, res) => {
  const movieId = Number(req.params.movieId);

  // Validate movie ID
  if (!Number.isInteger(movieId) || movieId <= 0) {
    return res.status(400).json({
      error: "Invalid movie ID",
    });
  }

  try {
    // Check whether the movie exists
    const movieResult = await pool.query(
      "SELECT movie_id FROM movies WHERE movie_id = $1",
      [movieId]
    );

    if (movieResult.rows.length === 0) {
      return res.status(404).json({
        error: "Movie not found",
      });
    }

    // Retrieve scheduled showtimes with room and cinema information
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

  // Validate showtime ID
  if (!Number.isInteger(showtimeId) || showtimeId <= 0) {
    return res.status(400).json({
      error: "Invalid showtime ID",
    });
  }

  try {
    // Retrieve showtime and its screening room
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
      return res.status(404).json({
        error: "Showtime not found",
      });
    }

    const showtime = showtimeResult.rows[0];

    // Retrieve all seats belonging to the room
    const seatsResult = await pool.query(
      `SELECT
          seat_id,
          row_label,
          seat_number,
          is_accessible
       FROM seats
       WHERE room_id = $1
       ORDER BY row_label, seat_number`,
      [showtime.room_id]
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

// Start server
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
