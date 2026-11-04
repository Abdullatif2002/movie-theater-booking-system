
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

// Start server
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
