
import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticateToken, requireRole } from "../middleware/auth";

const router = Router();

// Only Admin can manage seating layouts
router.use(authenticateToken, requireRole("admin"));

// GET /api/seats/rooms/:roomId - Get all seats in a room
router.get("/rooms/:roomId", async (req: Request, res: Response) => {
  try {
    const roomId = Number(req.params.roomId);

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({ message: "Invalid room ID" });
    }

    const room = await pool.query(
      `SELECT room_id, room_name, capacity
       FROM screening_rooms
       WHERE room_id = $1`,
      [roomId]
    );

    if (room.rowCount === 0) {
      return res.status(404).json({ message: "Screening room not found" });
    }

    const result = await pool.query(
      `SELECT seat_id, room_id, row_label, seat_number, is_accessible
       FROM seats
       WHERE room_id = $1
       ORDER BY row_label ASC, seat_number ASC`,
      [roomId]
    );

    return res.status(200).json({
      room: room.rows[0],
      seats: result.rows,
      total: result.rowCount,
    });
  } catch (error) {
    console.error("Get seats error:", error);
    return res.status(500).json({
      message: "Failed to retrieve seats",
    });
  }
});

// POST /api/seats/rooms/:roomId - Create a seat
router.post("/rooms/:roomId", async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const roomId = Number(req.params.roomId);
    const { row_label, seat_number, is_accessible = false } = req.body;

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({ message: "Invalid room ID" });
    }

    if (
      typeof row_label !== "string" ||
      !row_label.trim() ||
      row_label.trim().length > 10 ||
      row_label.trim() === "13" ||
      !Number.isInteger(seat_number) ||
      seat_number <= 0 ||
      typeof is_accessible !== "boolean"
    ) {
      return res.status(400).json({
        message: "Valid row_label, seat_number and is_accessible are required",
      });
    }

    await client.query("BEGIN");

    const room = await client.query(
      `SELECT room_id, capacity
       FROM screening_rooms
       WHERE room_id = $1
       FOR UPDATE`,
      [roomId]
    );

    if (room.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Screening room not found",
      });
    }
    const duplicateSeat = await client.query(
  `SELECT seat_id
   FROM seats
   WHERE room_id = $1
     AND row_label = $2
     AND seat_number = $3`,
  [roomId, row_label.trim().toUpperCase(), seat_number]
);

if ((duplicateSeat.rowCount ?? 0) > 0) {
  await client.query("ROLLBACK");
  return res.status(409).json({
    message: "This seat position already exists in the room",
  });
}

    const countResult = await client.query(
      "SELECT COUNT(*)::int AS total FROM seats WHERE room_id = $1",
      [roomId]
    );

    if (countResult.rows[0].total >= room.rows[0].capacity) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Room seating capacity has been reached",
      });
    }

    const result = await client.query(
      `INSERT INTO seats (room_id, row_label, seat_number, is_accessible)
       VALUES ($1, $2, $3, $4)
       RETURNING seat_id, room_id, row_label, seat_number, is_accessible`,
      [roomId, row_label.trim().toUpperCase(), seat_number, is_accessible]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Seat created successfully",
      seat: result.rows[0],
    });
  } catch (error: any) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        message: "This seat position already exists in the room",
      });
    }

    console.error("Create seat error:", error);
    return res.status(500).json({
      message: "Failed to create seat",
    });
  } finally {
    client.release();
  }
});

// PATCH /api/seats/:seatId - Update a seat
router.patch("/:seatId", async (req: Request, res: Response) => {
  try {
    const seatId = Number(req.params.seatId);
    const { row_label, seat_number, is_accessible } = req.body;

    if (!Number.isInteger(seatId) || seatId <= 0) {
      return res.status(400).json({ message: "Invalid seat ID" });
    }

    if (
      row_label === undefined &&
      seat_number === undefined &&
      is_accessible === undefined
    ) {
      return res.status(400).json({
        message: "Provide at least one field to update",
      });
    }

    if (
      (row_label !== undefined &&
        (typeof row_label !== "string" ||
          !row_label.trim() ||
          row_label.trim().length > 10 ||
          row_label.trim() === "13")) ||
      (seat_number !== undefined &&
        (!Number.isInteger(seat_number) || seat_number <= 0)) ||
      (is_accessible !== undefined &&
        typeof is_accessible !== "boolean")
    ) {
      return res.status(400).json({
        message: "Invalid seat information",
      });
    }

    const result = await pool.query(
      `UPDATE seats
       SET row_label = COALESCE($1, row_label),
           seat_number = COALESCE($2, seat_number),
           is_accessible = COALESCE($3, is_accessible)
       WHERE seat_id = $4
       RETURNING seat_id, room_id, row_label, seat_number, is_accessible`,
      [
        row_label === undefined ? null : row_label.trim().toUpperCase(),
        seat_number === undefined ? null : seat_number,
        is_accessible === undefined ? null : is_accessible,
        seatId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Seat not found" });
    }

    return res.status(200).json({
      message: "Seat updated successfully",
      seat: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "This seat position already exists in the room",
      });
    }

    console.error("Update seat error:", error);
    return res.status(500).json({
      message: "Failed to update seat",
    });
  }
});

// DELETE /api/seats/:seatId - Delete a seat
router.delete("/:seatId", async (req: Request, res: Response) => {
  try {
    const seatId = Number(req.params.seatId);

    if (!Number.isInteger(seatId) || seatId <= 0) {
      return res.status(400).json({ message: "Invalid seat ID" });
    }

    const result = await pool.query(
      `DELETE FROM seats
       WHERE seat_id = $1
       RETURNING seat_id, room_id, row_label, seat_number`,
      [seatId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Seat not found" });
    }

    return res.status(200).json({
      message: "Seat deleted successfully",
      seat: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === "23503") {
      return res.status(409).json({
        message: "Cannot delete this seat because it has booking records",
      });
    }

    console.error("Delete seat error:", error);
    return res.status(500).json({
      message: "Failed to delete seat",
    });
  }
});

export default router;