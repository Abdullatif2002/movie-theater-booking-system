
import { Router, Request, Response } from "express";
import { PoolClient } from "pg";
import { pool } from "../db";
import { authenticateToken, requireRole } from "../middleware/auth";

const router = Router();

// Staff and Admin can manage showtimes
router.use(authenticateToken, requireRole("staff", "admin"));

type ShowtimeInput = {
  movie_id?: number;
  room_id?: number;
  screening_time?: string;
};

function isValidDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(Date.parse(value))
  );
}

// Check whether a showtime overlaps with another scheduled showtime
async function hasScheduleConflict(
  client: PoolClient,
  roomId: number,
  movieId: number,
  screeningTime: string,
  excludeShowtimeId?: number
): Promise<boolean> {
  const movieResult = await client.query(
    `SELECT duration
     FROM movies
     WHERE movie_id = $1`,
    [movieId]
  );

  if (movieResult.rows.length === 0) {
    throw new Error("Movie not found.");
  }

  const targetDuration = Number(movieResult.rows[0].duration);

  const result = await client.query(
    `SELECT s.showtime_id
     FROM showtimes s
     JOIN movies m ON m.movie_id = s.movie_id
     WHERE s.room_id = $1
       AND s.status = 'scheduled'
       AND ($3::int IS NULL OR s.showtime_id <> $3)
       AND s.screening_time <
           ($2::timestamp + ($4::int * INTERVAL '1 minute'))
       AND
           (s.screening_time + (m.duration * INTERVAL '1 minute')) >
           $2::timestamp
     LIMIT 1`,
    [
      roomId,
      screeningTime,
      excludeShowtimeId ?? null,
      targetDuration
    ]
  );

  return (result.rowCount ?? 0) > 0;
}

// GET /api/management/showtimes
// Get all showtimes
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
         s.showtime_id,
         s.movie_id,
         m.title AS movie_title,
         m.duration,
         s.room_id,
         r.room_name,
         c.cinema_id,
         c.name AS cinema_name,
         s.screening_time,
         s.status
       FROM showtimes s
       JOIN movies m ON m.movie_id = s.movie_id
       JOIN screening_rooms r ON r.room_id = s.room_id
       JOIN cinemas c ON c.cinema_id = r.cinema_id
       ORDER BY s.screening_time ASC`
    );

    return res.status(200).json({
      showtimes: result.rows
    });
  } catch (error) {
    console.error("Get showtimes error:", error);

    return res.status(500).json({
      error: "Failed to retrieve showtimes"
    });
  }
});

// POST /api/management/showtimes
// Create a new showtime
router.post("/", async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { movie_id, room_id, screening_time } = req.body;

    if (
      !Number.isInteger(movie_id) ||
      movie_id <= 0 ||
      !Number.isInteger(room_id) ||
      room_id <= 0 ||
      !isValidDate(screening_time)
    ) {
      return res.status(400).json({
        message: "Valid movie_id, room_id and screening_time are required"
      });
    }

    await client.query("BEGIN");

    // Lock room to prevent concurrent overlapping showtimes
    const room = await client.query(
      `SELECT room_id
       FROM screening_rooms
       WHERE room_id = $1
       FOR UPDATE`,
      [room_id]
    );

    if (room.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Screening room not found"
      });
    }

    const movie = await client.query(
      `SELECT movie_id
       FROM movies
       WHERE movie_id = $1`,
      [movie_id]
    );

    if (movie.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Movie not found"
      });
    }

    const conflict = await hasScheduleConflict(
      client,
      room_id,
      movie_id,
      screening_time
    );

    if (conflict) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "This screening overlaps with another showtime in the room"
      });
    }

    const result = await client.query(
      `INSERT INTO showtimes
       (movie_id, room_id, screening_time, status)
       VALUES ($1, $2, $3, 'scheduled')
       RETURNING showtime_id, movie_id, room_id, screening_time, status`,
      [movie_id, room_id, screening_time]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Showtime created successfully",
      showtime: result.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Create showtime error:", error);

    return res.status(500).json({
      message: "Failed to create showtime"
    });

  } finally {
    client.release();
  }
});

// PATCH /api/management/showtimes/:showtimeId
// Update a showtime
router.patch("/:showtimeId", async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const showtimeId = Number(req.params.showtimeId);

    const { movie_id, room_id, screening_time } =
      req.body as ShowtimeInput;

    if (!Number.isInteger(showtimeId) || showtimeId <= 0) {
      return res.status(400).json({
        message: "Invalid showtime ID"
      });
    }

    if (
      (movie_id !== undefined &&
        (!Number.isInteger(movie_id) || movie_id <= 0)) ||
      (room_id !== undefined &&
        (!Number.isInteger(room_id) || room_id <= 0)) ||
      (screening_time !== undefined &&
        !isValidDate(screening_time))
    ) {
      return res.status(400).json({
        message: "Invalid showtime information"
      });
    }

    if (
      movie_id === undefined &&
      room_id === undefined &&
      screening_time === undefined
    ) {
      return res.status(400).json({
        message: "Provide at least one field to update"
      });
    }

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT showtime_id, movie_id, room_id, screening_time, status
       FROM showtimes
       WHERE showtime_id = $1
       FOR UPDATE`,
      [showtimeId]
    );

    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Showtime not found"
      });
    }

    const current = existing.rows[0];

    if (current.status !== "scheduled") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "Only scheduled showtimes can be updated"
      });
    }

    const newMovieId = movie_id ?? current.movie_id;
    const newRoomId = room_id ?? current.room_id;
    const newScreeningTime =
      screening_time ?? current.screening_time;

    // Prevent rescheduling showtimes with paid bookings
    const paidBookings = await client.query(
      `SELECT 1
       FROM bookings
       WHERE showtime_id = $1
         AND status = 'paid'
       LIMIT 1`,
      [showtimeId]
    );

    if (paidBookings.rowCount !== 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "Cannot reschedule a showtime that has paid bookings"
      });
    }

    // Lock target room
    const room = await client.query(
      `SELECT room_id
       FROM screening_rooms
       WHERE room_id = $1
       FOR UPDATE`,
      [newRoomId]
    );

    if (room.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Screening room not found"
      });
    }

    const movie = await client.query(
      `SELECT movie_id
       FROM movies
       WHERE movie_id = $1`,
      [newMovieId]
    );

    if (movie.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Movie not found"
      });
    }

    const conflict = await hasScheduleConflict(
      client,
      newRoomId,
      newMovieId,
      newScreeningTime,
      showtimeId
    );

    if (conflict) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "This screening overlaps with another showtime in the room"
      });
    }

    const result = await client.query(
      `UPDATE showtimes
       SET movie_id = $1,
           room_id = $2,
           screening_time = $3
       WHERE showtime_id = $4
       RETURNING showtime_id, movie_id, room_id, screening_time, status`,
      [newMovieId, newRoomId, newScreeningTime, showtimeId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Showtime updated successfully",
      showtime: result.rows[0]
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Update showtime error:", error);

    return res.status(500).json({
      message: "Failed to update showtime"
    });

  } finally {
    client.release();
  }
});

// PATCH /api/management/showtimes/:showtimeId/cancel
// Cancel a scheduled showtime
router.patch("/:showtimeId/cancel", async (req: Request, res: Response) => {
  try {
    const showtimeId = Number(req.params.showtimeId);

    if (!Number.isInteger(showtimeId) || showtimeId <= 0) {
      return res.status(400).json({
        message: "Invalid showtime ID"
      });
    }

    const result = await pool.query(
      `UPDATE showtimes
       SET status = 'cancelled'
       WHERE showtime_id = $1
         AND status = 'scheduled'
       RETURNING showtime_id, movie_id, room_id, screening_time, status`,
      [showtimeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Scheduled showtime not found"
      });
    }

    return res.status(200).json({
      message: "Showtime cancelled successfully",
      showtime: result.rows[0]
    });

  } catch (error) {
    console.error("Cancel showtime error:", error);

    return res.status(500).json({
      message: "Failed to cancel showtime"
    });
  }
});

// PATCH /api/management/showtimes/:showtimeId/complete
// Mark a scheduled showtime as completed
router.patch("/:showtimeId/complete", async (req: Request, res: Response) => {
  try {
    const showtimeId = Number(req.params.showtimeId);

    if (!Number.isInteger(showtimeId) || showtimeId <= 0) {
      return res.status(400).json({
        message: "Invalid showtime ID"
      });
    }

    const result = await pool.query(
      `UPDATE showtimes
       SET status = 'completed'
       WHERE showtime_id = $1
         AND status = 'scheduled'
       RETURNING showtime_id, movie_id, room_id, screening_time, status`,
      [showtimeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Scheduled showtime not found"
      });
    }

    return res.status(200).json({
      message: "Showtime marked as completed",
      showtime: result.rows[0]
    });

  } catch (error) {
    console.error("Complete showtime error:", error);

    return res.status(500).json({
      message: "Failed to complete showtime"
    });
  }
});

export default router;
