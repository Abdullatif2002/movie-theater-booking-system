import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import {
  authenticateToken,
  AuthUser,
} from "../middleware/auth";

const router = Router();

// Staff and Admin Login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      error: "Email and password are required.",
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error("JWT_SECRET is not configured.");

    return res.status(500).json({
      error: "Authentication service is not configured.",
    });
  }

  try {
    const result = await pool.query(
      `SELECT user_id, full_name, email, password_hash, role
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }
    const user = result.rows[0];

    if (!["staff", "admin"].includes(user.role)) {
      return res.status(403).json({
        error: "Access denied. Staff or Admin account required.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const token = jwt.sign(
      {
        email: user.email,
        role: user.role,
      },
      secret!,
      {
        subject: String(user.user_id),
        expiresIn: "8h",
      }
    );

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      error: "Unable to process login.",
    });
  }
});

// Get authenticated user profile
router.get(
  "/me",
  authenticateToken,
  (_req: Request, res: Response) => {
    const user = res.locals.authUser as AuthUser;

    return res.status(200).json({
      user: {
        user_id: user.userId,
        email: user.email,
        role: user.role,
      },
    });
  }
);

export default router;