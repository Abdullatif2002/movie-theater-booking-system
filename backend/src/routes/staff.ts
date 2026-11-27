
import { Router, Request, Response } from "express";
import { pool } from "../db";
import {
  authenticateToken,
  requireRole,
} from "../middleware/auth";
import {
  listPrivateScreeningRequests,
  getPrivateScreeningRequestById,
  updatePrivateScreeningRequestStatus,
} from "./privateScreenings";

const router = Router();

// All routes in this file require Staff or Admin authentication
router.use(authenticateToken, requireRole("staff", "admin"));

// GET /api/staff/reservations
// List reservations with search, filters and pagination
router.get(
  "/reservations",
  async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(
        50,
        Math.max(1, Number(req.query.limit) || 10)
      );
      const offset = (page - 1) * limit;

      const search =
        typeof req.query.search === "string"
          ? req.query.search.trim()
          : "";

      const status =
        typeof req.query.status === "string"
          ? req.query.status.trim()
          : "";

      const allowedStatuses = [
        "pending_payment",
        "paid",
        "expired",
        "failed",
      ];

      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid reservation status.",
        });
      }

      const conditions: string[] = [];
      const values: (string | number)[] = [];

      if (search) {
        values.push(`%${search}%`);

        conditions.push(`
          (
            u.full_name ILIKE $${values.length}
            OR u.email ILIKE $${values.length}
            OR b.booking_id::TEXT ILIKE $${values.length}
          )
        `);
      }

      if (status) {
        values.push(status);
        conditions.push(`b.status = $${values.length}`);
      }

      const whereClause =
        conditions.length > 0
          ? `WHERE ${conditions.join(" AND ")}`
          : "";

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total
         FROM bookings b
         JOIN users u ON u.user_id = b.user_id
         ${whereClause}`,
        values
      );

      const total = Number(countResult.rows[0].total);

      const result = await pool.query(
        `SELECT
            b.booking_id,
            b.user_id,
            u.full_name AS customer_name,
            u.email AS customer_email,
            b.showtime_id,
            m.title AS movie_title,
            st.screening_time,
            c.name AS cinema_name,
            sr.room_name,
            b.status AS payment_status,
            b.total_amount_cents,
            b.currency,
            b.created_at,
            b.paid_at,
            COUNT(bs.booking_seat_id)::INTEGER AS ticket_count
         FROM bookings b
         JOIN users u ON u.user_id = b.user_id
         JOIN showtimes st ON st.showtime_id = b.showtime_id
         JOIN movies m ON m.movie_id = st.movie_id
         JOIN screening_rooms sr ON sr.room_id = st.room_id
         JOIN cinemas c ON c.cinema_id = sr.cinema_id
         LEFT JOIN booking_seats bs
           ON bs.booking_id = b.booking_id
         ${whereClause}
         GROUP BY
            b.booking_id,
            u.user_id,
            u.full_name,
            u.email,
            m.title,
            st.screening_time,
            c.name,
            sr.room_name
         ORDER BY b.created_at DESC
         LIMIT $${values.length + 1}
         OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      );

      return res.status(200).json({
        reservations: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Reservation list error:", error);

      return res.status(500).json({
        error: "Failed to retrieve reservations.",
      });
    }
  }
);

// GET /api/staff/reservations/:bookingId
// View complete reservation details
router.get(
  "/reservations/:bookingId",
  async (req: Request, res: Response) => {
    const bookingId = Number(req.params.bookingId);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({
        error: "Invalid booking ID.",
      });
    }

    try {
      const bookingResult = await pool.query(
        `SELECT
            b.booking_id,
            b.user_id,
            u.full_name AS customer_name,
            u.email AS customer_email,
            b.showtime_id,
            m.title AS movie_title,
            m.duration AS movie_duration,
            st.screening_time,
            st.status AS showtime_status,
            c.cinema_id,
            c.name AS cinema_name,
            c.location AS cinema_location,
            sr.room_id,
            sr.room_name,
            b.status AS payment_status,
            b.total_amount_cents,
            b.currency,
            b.created_at,
            b.expires_at,
            b.paid_at,
            b.stripe_checkout_session_id,
            b.stripe_payment_intent_id
         FROM bookings b
         JOIN users u ON u.user_id = b.user_id
         JOIN showtimes st ON st.showtime_id = b.showtime_id
         JOIN movies m ON m.movie_id = st.movie_id
         JOIN screening_rooms sr ON sr.room_id = st.room_id
         JOIN cinemas c ON c.cinema_id = sr.cinema_id
         WHERE b.booking_id = $1`,
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        return res.status(404).json({
          error: "Reservation not found.",
        });
      }

      const seatsResult = await pool.query(
        `SELECT
            s.seat_id,
            s.row_label,
            s.seat_number,
            s.is_accessible,
            bs.ticket_type_code,
            bs.unit_price_cents
         FROM booking_seats bs
         JOIN seats s ON s.seat_id = bs.seat_id
         WHERE bs.booking_id = $1
         ORDER BY s.row_label, s.seat_number`,
        [bookingId]
      );

      return res.status(200).json({
        reservation: bookingResult.rows[0],
        seats: seatsResult.rows,
      });
    } catch (error) {
      console.error("Reservation details error:", error);

      return res.status(500).json({
        error: "Failed to retrieve reservation details.",
      });
    }
  }
);

// GET /api/staff/private-screenings
// List submitted corporate private screening requests
router.get("/private-screenings", listPrivateScreeningRequests);
router.get("/private-screening-requests", listPrivateScreeningRequests);

// GET /api/staff/private-screenings/:requestId
// View details of a specific private screening request
router.get(
  "/private-screenings/:requestId",
  getPrivateScreeningRequestById
);
router.get(
  "/private-screening-requests/:requestId",
  getPrivateScreeningRequestById
);

// PATCH /api/staff/private-screenings/:requestId/status
// Update status of a private screening request
router.patch(
  "/private-screenings/:requestId/status",
  updatePrivateScreeningRequestStatus
);
router.patch(
  "/private-screening-requests/:requestId/status",
  updatePrivateScreeningRequestStatus
);

export default router;