import { Router, Request, Response } from "express";
import { pool } from "../db";
import {
  authenticateToken,
  requireRole,
} from "../middleware/auth";

const router = Router();

export const ALLOWED_SCREENING_REQUEST_STATUSES = [
  "pending",
  "reviewed",
  "approved",
  "rejected",
] as const;

export type ScreeningRequestStatus =
  (typeof ALLOWED_SCREENING_REQUEST_STATUSES)[number];

let tableEnsured = false;

export async function ensurePrivateScreeningTable(): Promise<void> {
  if (tableEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS private_screening_requests (
      request_id SERIAL PRIMARY KEY,
      organization_name VARCHAR(150) NOT NULL,
      contact_name VARCHAR(100) NOT NULL,
      contact_email VARCHAR(255) NOT NULL,
      contact_phone VARCHAR(50) NOT NULL DEFAULT '',
      preferred_datetime TIMESTAMP NOT NULL,
      estimated_attendees INTEGER NOT NULL CHECK (estimated_attendees > 0),
      additional_requirements TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT private_screening_requests_status_check
        CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected'))
    );
  `);

  tableEnsured = true;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/private-screenings
// Public endpoint for a company representative to submit a private screening request
router.post("/", async (req: Request, res: Response) => {
  try {
    await ensurePrivateScreeningTable();

    const {
      organization_name,
      contact_name,
      contact_email,
      contact_phone,
      contact_details,
      preferred_datetime,
      preferred_date,
      preferred_time,
      estimated_attendees,
      additional_requirements,
    } = req.body ?? {};

    // 1. Validate organization name
    if (
      typeof organization_name !== "string" ||
      !organization_name.trim()
    ) {
      return res.status(400).json({
        error: "Organization name is required.",
      });
    }

    if (organization_name.trim().length > 150) {
      return res.status(400).json({
        error: "Organization name cannot exceed 150 characters.",
      });
    }

    // 2. Validate contact details
    let resolvedContactName =
      typeof contact_name === "string" ? contact_name.trim() : "";
    let resolvedContactEmail =
      typeof contact_email === "string"
        ? contact_email.trim().toLowerCase()
        : "";
    let resolvedContactPhone =
      typeof contact_phone === "string" ? contact_phone.trim() : "";

    // Support fallback if contact_details was provided as a single string or object
    if (
      (!resolvedContactName || !resolvedContactEmail) &&
      contact_details
    ) {
      if (typeof contact_details === "string" && contact_details.trim()) {
        const raw = contact_details.trim();
        const emailMatch = raw.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
        if (emailMatch && !resolvedContactEmail) {
          resolvedContactEmail = emailMatch[0].toLowerCase();
        }
        if (!resolvedContactName) {
          resolvedContactName = raw.slice(0, 100);
        }
      } else if (typeof contact_details === "object") {
        if (
          !resolvedContactName &&
          typeof contact_details.name === "string"
        ) {
          resolvedContactName = contact_details.name.trim();
        }
        if (
          !resolvedContactEmail &&
          typeof contact_details.email === "string"
        ) {
          resolvedContactEmail = contact_details.email
            .trim()
            .toLowerCase();
        }
        if (
          !resolvedContactPhone &&
          typeof contact_details.phone === "string"
        ) {
          resolvedContactPhone = contact_details.phone.trim();
        }
      }
    }

    if (!resolvedContactName) {
      return res.status(400).json({
        error: "Contact representative name is required.",
      });
    }

    if (resolvedContactName.length > 100) {
      return res.status(400).json({
        error: "Contact name cannot exceed 100 characters.",
      });
    }

    if (!resolvedContactEmail || !isValidEmail(resolvedContactEmail)) {
      return res.status(400).json({
        error: "A valid contact email address is required.",
      });
    }

    if (resolvedContactPhone.length > 50) {
      return res.status(400).json({
        error: "Contact phone number cannot exceed 50 characters.",
      });
    }

    // 3. Validate preferred date and time
    let combinedDateTime = "";

    if (
      typeof preferred_datetime === "string" &&
      preferred_datetime.trim()
    ) {
      combinedDateTime = preferred_datetime.trim();
    } else if (
      typeof preferred_date === "string" &&
      preferred_date.trim() &&
      typeof preferred_time === "string" &&
      preferred_time.trim()
    ) {
      combinedDateTime = `${preferred_date.trim()}T${preferred_time.trim()}`;
    } else if (
      typeof preferred_date === "string" &&
      preferred_date.trim()
    ) {
      return res.status(400).json({
        error: "Preferred time is required alongside preferred date.",
      });
    }

    if (!combinedDateTime) {
      return res.status(400).json({
        error: "Preferred date and time are required.",
      });
    }

    const parsedTimestamp = Date.parse(combinedDateTime);

    if (Number.isNaN(parsedTimestamp)) {
      return res.status(400).json({
        error: "Please provide a valid preferred date and time.",
      });
    }

    const preferredDateObj = new Date(parsedTimestamp);

    if (preferredDateObj.getTime() <= Date.now()) {
      return res.status(400).json({
        error: "Preferred date and time must be in the future.",
      });
    }

    // 4. Validate estimated number of attendees
    const attendeesNum = Number(estimated_attendees);

    if (
      estimated_attendees === undefined ||
      estimated_attendees === null ||
      estimated_attendees === "" ||
      !Number.isInteger(attendeesNum) ||
      attendeesNum <= 0
    ) {
      return res.status(400).json({
        error:
          "Estimated number of attendees must be a positive whole number.",
      });
    }

    if (attendeesNum > 1000) {
      return res.status(400).json({
        error:
          "Estimated number of attendees cannot exceed 1,000 for a single screening request.",
      });
    }

    // 5. Validate additional requirements (optional)
    if (
      additional_requirements !== undefined &&
      additional_requirements !== null &&
      typeof additional_requirements !== "string"
    ) {
      return res.status(400).json({
        error: "Additional requirements must be a text value.",
      });
    }

    const cleanedRequirements =
      typeof additional_requirements === "string" &&
      additional_requirements.trim()
        ? additional_requirements.trim()
        : null;

    const result = await pool.query(
      `INSERT INTO private_screening_requests (
          organization_name,
          contact_name,
          contact_email,
          contact_phone,
          preferred_datetime,
          estimated_attendees,
          additional_requirements,
          status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING
          request_id,
          organization_name,
          contact_name,
          contact_email,
          contact_phone,
          preferred_datetime,
          estimated_attendees,
          additional_requirements,
          status,
          created_at`,
      [
        organization_name.trim(),
        resolvedContactName,
        resolvedContactEmail,
        resolvedContactPhone,
        preferredDateObj.toISOString(),
        attendeesNum,
        cleanedRequirements,
      ]
    );

    return res.status(201).json({
      message: "Private screening request submitted successfully.",
      request: result.rows[0],
    });
  } catch (error) {
    console.error("Create private screening request error:", error);

    return res.status(500).json({
      error: "Failed to submit private screening request.",
    });
  }
});

// Shared handlers for Staff/Admin access to submitted requests
export async function listPrivateScreeningRequests(
  req: Request,
  res: Response
) {
  try {
    await ensurePrivateScreeningTable();

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number(req.query.limit) || 20)
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

    if (
      status &&
      !ALLOWED_SCREENING_REQUEST_STATUSES.includes(
        status as ScreeningRequestStatus
      )
    ) {
      return res.status(400).json({
        error: "Invalid request status filter.",
      });
    }

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`
        (
          organization_name ILIKE $${values.length}
          OR contact_name ILIKE $${values.length}
          OR contact_email ILIKE $${values.length}
          OR contact_phone ILIKE $${values.length}
        )
      `);
    }

    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM private_screening_requests
       ${whereClause}`,
      values
    );

    const total = Number(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT
          request_id,
          organization_name,
          contact_name,
          contact_email,
          contact_phone,
          preferred_datetime,
          estimated_attendees,
          additional_requirements,
          status,
          created_at
       FROM private_screening_requests
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    return res.status(200).json({
      requests: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("List private screening requests error:", error);

    return res.status(500).json({
      error: "Failed to retrieve private screening requests.",
    });
  }
}

export async function getPrivateScreeningRequestById(
  req: Request,
  res: Response
) {
  const requestId = Number(req.params.requestId);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({
      error: "Invalid request ID.",
    });
  }

  try {
    await ensurePrivateScreeningTable();

    const result = await pool.query(
      `SELECT
          request_id,
          organization_name,
          contact_name,
          contact_email,
          contact_phone,
          preferred_datetime,
          estimated_attendees,
          additional_requirements,
          status,
          created_at
       FROM private_screening_requests
       WHERE request_id = $1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Private screening request not found.",
      });
    }

    return res.status(200).json({
      request: result.rows[0],
    });
  } catch (error) {
    console.error("Get private screening request error:", error);

    return res.status(500).json({
      error: "Failed to retrieve private screening request.",
    });
  }
}

export async function updatePrivateScreeningRequestStatus(
  req: Request,
  res: Response
) {
  const requestId = Number(req.params.requestId);
  const { status } = req.body ?? {};

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({
      error: "Invalid request ID.",
    });
  }

  if (
    typeof status !== "string" ||
    !ALLOWED_SCREENING_REQUEST_STATUSES.includes(
      status as ScreeningRequestStatus
    )
  ) {
    return res.status(400).json({
      error:
        "Valid status is required (pending, reviewed, approved, or rejected).",
    });
  }

  try {
    await ensurePrivateScreeningTable();

    const result = await pool.query(
      `UPDATE private_screening_requests
       SET status = $1
       WHERE request_id = $2
       RETURNING
          request_id,
          organization_name,
          contact_name,
          contact_email,
          contact_phone,
          preferred_datetime,
          estimated_attendees,
          additional_requirements,
          status,
          created_at`,
      [status, requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Private screening request not found.",
      });
    }

    return res.status(200).json({
      message: "Private screening request status updated.",
      request: result.rows[0],
    });
  } catch (error) {
    console.error("Update private screening request error:", error);

    return res.status(500).json({
      error: "Failed to update private screening request.",
    });
  }
}

// Authorized Staff and Admin routes on /api/private-screenings
router.get(
  "/",
  authenticateToken,
  requireRole("staff", "admin"),
  listPrivateScreeningRequests
);

router.get(
  "/:requestId",
  authenticateToken,
  requireRole("staff", "admin"),
  getPrivateScreeningRequestById
);

router.patch(
  "/:requestId/status",
  authenticateToken,
  requireRole("staff", "admin"),
  updatePrivateScreeningRequestStatus
);

export default router;
