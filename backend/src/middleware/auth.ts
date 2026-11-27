import { RequestHandler } from "express";
import jwt from "jsonwebtoken";

export type UserRole = "customer" | "staff" | "admin";

export interface AuthUser {
  userId: number;
  email: string;
  role: UserRole;
}

// Verify JWT token
export const authenticateToken: RequestHandler = (
  req,
  res,
  next
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication token is required.",
    });
  }

  const token = authHeader.slice(7).trim();

if (!token) {
  return res.status(401).json({
    error: "Authentication token is required.",
  });
}
  const secret = process.env.JWT_SECRET || "cinemax_dev_jwt_secret_2026";

  if (!secret) {
    console.error("JWT_SECRET is not configured.");

    return res.status(500).json({
      error: "Authentication service is not configured.",
    });
  }

  try {
    const decoded = jwt.verify(token, secret!) as jwt.JwtPayload;

    const userId = Number(decoded.sub);
    const email = decoded.email;
    const role = decoded.role;

    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      typeof email !== "string" ||
      !["customer", "staff", "admin"].includes(role)
    ) {
      return res.status(401).json({
        error: "Invalid authentication token.",
      });
    }

    res.locals.authUser = {
      userId,
      email,
      role,
    } satisfies AuthUser;

    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired authentication token.",
    });
  }
};

// Check whether the authenticated user has permission
export const requireRole = (
  ...allowedRoles: UserRole[]
): RequestHandler => {
  return (_req, res, next) => {
    const authUser = res.locals.authUser as AuthUser | undefined;

    if (!authUser) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(authUser.role)) {
      return res.status(403).json({
        error: "You do not have permission to access this resource.",
      });
    }

    next();
  };
};