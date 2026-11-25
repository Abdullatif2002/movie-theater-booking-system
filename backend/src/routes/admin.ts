
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db";
import {
  authenticateToken,
  requireRole,
  AuthUser,
  UserRole,
} from "../middleware/auth";

const router = Router();

// Only authenticated Admin users can access these routes
router.use(authenticateToken, requireRole("admin"));

// GET /api/admin/users
// List users without exposing password hashes
router.get("/users", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT user_id, full_name, email, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    return res.status(200).json({
      users: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Admin user list error:", error);

    return res.status(500).json({
      error: "Failed to retrieve users.",
    });
  }
});

// POST /api/admin/users
// Create a new Staff account
router.post("/users", async (req: Request, res: Response) => {
  const { full_name, email, password } = req.body;

  if (
    typeof full_name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    !full_name.trim() ||
    !email.trim() ||
    password.length < 8
  ) {
    return res.status(400).json({
      error: "Valid name, email and password (minimum 8 characters) are required.",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({
      error: "Please provide a valid email address.",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'staff')
       RETURNING user_id, full_name, email, role, created_at`,
      [full_name.trim(), normalizedEmail, passwordHash]
    );

    return res.status(201).json({
      message: "Staff account created successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    const dbError = error as { code?: string };

    if (dbError.code === "23505") {
      return res.status(409).json({
        error: "An account with this email already exists.",
      });
    }

    console.error("Staff account creation error:", error);

    return res.status(500).json({
      error: "Failed to create Staff account.",
    });
  }
});

// PATCH /api/admin/users/:userId/role
// Change a user's role
router.patch(
  "/users/:userId/role",
  async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    const { role } = req.body;

    const allowedRoles: UserRole[] = [
      "customer",
      "staff",
      "admin",
    ];

    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      !allowedRoles.includes(role)
    ) {
      return res.status(400).json({
        error: "Valid user ID and role are required.",
      });
    }

    const currentUser = res.locals.authUser as AuthUser;

    if (currentUser.userId === userId) {
      return res.status(400).json({
        error: "You cannot change your own role.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Lock existing Admin rows before checking the last Admin
      const adminRows = await client.query(
        `SELECT user_id
         FROM users
         WHERE role = 'admin'
         FOR UPDATE`
      );

      const targetResult = await client.query(
        `SELECT user_id, role
         FROM users
         WHERE user_id = $1
         FOR UPDATE`,
        [userId]
      );

      if (targetResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "User not found.",
        });
      }

      const currentRole = targetResult.rows[0].role;

      if (currentRole === "admin" && role !== "admin") {
        if (adminRows.rows.length <= 1) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            error: "The last Admin account cannot be demoted.",
          });
        }
      }

      const result = await client.query(
        `UPDATE users
         SET role = $1
         WHERE user_id = $2
         RETURNING user_id, full_name, email, role, created_at`,
        [role, userId]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        message: "User role updated successfully.",
        user: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("User role update error:", error);

      return res.status(500).json({
        error: "Failed to update user role.",
      });
    } finally {
      client.release();
    }
  }
);

export default router;