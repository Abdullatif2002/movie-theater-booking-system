
import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticateToken, requireRole } from "../middleware/auth";

const router = Router();

// Only Admin can manage screening rooms
router.use(authenticateToken, requireRole("admin"));

// GET /api/rooms - Get all screening rooms
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
         r.room_id,
         r.cinema_id,
         r.room_name,
         r.capacity,
         c.name AS cinema_name,
         c.location AS cinema_location
       FROM screening_rooms r
       JOIN cinemas c ON c.cinema_id = r.cinema_id
       ORDER BY r.room_id ASC`
    );

    return res.status(200).json({
      rooms: result.rows,
      total: result.rowCount,
    });
  } catch (error) {
    console.error("Get rooms error:", error);
    return res.status(500).json({
      message: "Failed to retrieve screening rooms",
    });
  }
});

// POST /api/rooms - Create a screening room
router.post("/", async (req: Request, res: Response) => {
  try {
    const { cinema_id, room_name, capacity } = req.body;

    if (
      !Number.isInteger(Number(cinema_id)) ||
      Number(cinema_id) <= 0 ||
      typeof room_name !== "string" ||
      !room_name.trim() ||
      !Number.isInteger(Number(capacity)) ||
      Number(capacity) <= 0
    ) {
      return res.status(400).json({
        message: "Valid cinema_id, room_name and capacity are required",
      });
    }

    const cinema = await pool.query(
      "SELECT cinema_id FROM cinemas WHERE cinema_id = $1",
      [Number(cinema_id)]
    );

    if (cinema.rowCount === 0) {
      return res.status(404).json({
        message: "Cinema not found",
      });
    }

    const result = await pool.query(
      `INSERT INTO screening_rooms (cinema_id, room_name, capacity)
       VALUES ($1, $2, $3)
       RETURNING room_id, cinema_id, room_name, capacity`,
      [Number(cinema_id), room_name.trim(), Number(capacity)]
    );

    return res.status(201).json({
      message: "Screening room created successfully",
      room: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "A room with this name already exists in this cinema",
      });
    }

    console.error("Create room error:", error);
    return res.status(500).json({
      message: "Failed to create screening room",
    });
  }
});

// PATCH /api/rooms/:roomId - Update a screening room
router.patch("/:roomId", async (req: Request, res: Response) => {
  try {
    const roomId = Number(req.params.roomId);
    const { room_name, capacity } = req.body;

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({
        message: "Invalid room ID",
      });
    }

    if (room_name === undefined && capacity === undefined) {
      return res.status(400).json({
        message: "Provide room_name or capacity to update",
      });
    }

    if (
      (room_name !== undefined &&
        (typeof room_name !== "string" || !room_name.trim())) ||
      (capacity !== undefined &&
        (!Number.isInteger(Number(capacity)) || Number(capacity) <= 0))
    ) {
      return res.status(400).json({
        message: "Invalid room name or capacity",
      });
    }

    const result = await pool.query(
      `UPDATE screening_rooms
       SET room_name = COALESCE($1, room_name),
           capacity = COALESCE($2, capacity)
       WHERE room_id = $3
       RETURNING room_id, cinema_id, room_name, capacity`,
      [
        room_name === undefined ? null : room_name.trim(),
        capacity === undefined ? null : Number(capacity),
        roomId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Screening room not found",
      });
    }

    return res.status(200).json({
      message: "Screening room updated successfully",
      room: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "A room with this name already exists in this cinema",
      });
    }

    console.error("Update room error:", error);
    return res.status(500).json({
      message: "Failed to update screening room",
    });
  }
});

// DELETE /api/rooms/:roomId - Delete a screening room
router.delete("/:roomId", async (req: Request, res: Response) => {
  try {
    const roomId = Number(req.params.roomId);

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({
        message: "Invalid room ID",
      });
    }

    const result = await pool.query(
      `DELETE FROM screening_rooms
       WHERE room_id = $1
       RETURNING room_id, cinema_id, room_name, capacity`,
      [roomId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Screening room not found",
      });
    }

    return res.status(200).json({
      message: "Screening room deleted successfully",
      room: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === "23503") {
      return res.status(409).json({
        message:
          "Cannot delete this room because it has associated showtimes or bookings.",
      });
    }

    console.error("Delete room error:", error);
    return res.status(500).json({
      message: "Failed to delete screening room",
    });
  }
});

export default router;