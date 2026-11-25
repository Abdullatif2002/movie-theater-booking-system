
import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticateToken, requireRole } from "../middleware/auth";

const router = Router();

// Only Admin can manage cinemas
router.use(authenticateToken, requireRole("admin"));

// GET /api/cinemas - Get all cinemas
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT cinema_id, name, location
       FROM cinemas
       ORDER BY cinema_id ASC`
    );

    return res.status(200).json({
      cinemas: result.rows,
      total: result.rowCount,
    });
  } catch (error) {
    console.error("Get cinemas error:", error);
    return res.status(500).json({
      message: "Failed to retrieve cinemas",
    });
  }
});

// POST /api/cinemas - Create a cinema
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, location } = req.body;

    if (
      typeof name !== "string" ||
      typeof location !== "string" ||
      !name.trim() ||
      !location.trim()
    ) {
      return res.status(400).json({
        message: "Cinema name and location are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO cinemas (name, location)
       VALUES ($1, $2)
       RETURNING cinema_id, name, location`,
      [name.trim(), location.trim()]
    );

    return res.status(201).json({
      message: "Cinema created successfully",
      cinema: result.rows[0],
    });
  } catch (error) {
    console.error("Create cinema error:", error);
    return res.status(500).json({
      message: "Failed to create cinema",
    });
  }
});

// PATCH /api/cinemas/:cinemaId - Update a cinema
router.patch("/:cinemaId", async (req: Request, res: Response) => {
  try {
    const cinemaId = Number(req.params.cinemaId);

    if (!Number.isInteger(cinemaId) || cinemaId <= 0) {
      return res.status(400).json({
        message: "Invalid cinema ID",
      });
    }

    const { name, location } = req.body;

    if (name === undefined && location === undefined) {
      return res.status(400).json({
        message: "Provide at least one field to update",
      });
    }

    if (
      (name !== undefined &&
        (typeof name !== "string" || !name.trim())) ||
      (location !== undefined &&
        (typeof location !== "string" || !location.trim()))
    ) {
      return res.status(400).json({
        message: "Name and location must be non-empty strings",
      });
    }

    const existing = await pool.query(
      "SELECT cinema_id FROM cinemas WHERE cinema_id = $1",
      [cinemaId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({
        message: "Cinema not found",
      });
    }

    const result = await pool.query(
      `UPDATE cinemas
       SET name = COALESCE($1, name),
           location = COALESCE($2, location)
       WHERE cinema_id = $3
       RETURNING cinema_id, name, location`,
      [
        name === undefined ? null : name.trim(),
        location === undefined ? null : location.trim(),
        cinemaId,
      ]
    );

    return res.status(200).json({
      message: "Cinema updated successfully",
      cinema: result.rows[0],
    });
  } catch (error) {
    console.error("Update cinema error:", error);
    return res.status(500).json({
      message: "Failed to update cinema",
    });
  }
});

// DELETE /api/cinemas/:cinemaId - Delete a cinema
router.delete("/:cinemaId", async (req: Request, res: Response) => {
  try {
    const cinemaId = Number(req.params.cinemaId);

    if (!Number.isInteger(cinemaId) || cinemaId <= 0) {
      return res.status(400).json({
        message: "Invalid cinema ID",
      });
    }

    const result = await pool.query(
      `DELETE FROM cinemas
       WHERE cinema_id = $1
       RETURNING cinema_id, name, location`,
      [cinemaId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Cinema not found",
      });
    }

    return res.status(200).json({
      message: "Cinema deleted successfully",
      cinema: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === "23503") {
      return res.status(409).json({
        message:
          "Cannot delete this cinema because it has associated screening rooms.",
      });
    }

    console.error("Delete cinema error:", error);
    return res.status(500).json({
      message: "Failed to delete cinema",
    });
  }
});

export default router;