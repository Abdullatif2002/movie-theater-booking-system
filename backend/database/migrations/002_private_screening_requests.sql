BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_private_screening_requests_status
    ON private_screening_requests(status);

CREATE INDEX IF NOT EXISTS idx_private_screening_requests_created_at
    ON private_screening_requests(created_at DESC);

COMMIT;
