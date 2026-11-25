
BEGIN;

-- 1. Ticket types used by the existing Stripe checkout API
CREATE TABLE IF NOT EXISTS ticket_types (
    ticket_type_code VARCHAR(30) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO ticket_types
    (ticket_type_code, display_name, price_cents, currency, discount_percent)
VALUES
    ('adult', 'Adult ticket', 1500, 'EUR', 0),
    ('child', 'Child ticket (under 16)', 1275, 'EUR', 15),
    ('accessible', 'Accessible ticket', 1275, 'EUR', 15)
ON CONFLICT (ticket_type_code) DO NOTHING;


-- 2. Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    booking_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    showtime_id INTEGER NOT NULL REFERENCES showtimes(showtime_id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
    total_amount_cents INTEGER NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '31 minutes'),
    paid_at TIMESTAMP,
    stripe_checkout_session_id TEXT,
    stripe_payment_intent_id TEXT,
    CONSTRAINT unique_booking_showtime UNIQUE (booking_id, showtime_id),
    CONSTRAINT bookings_status_check
        CHECK (status IN ('pending_payment', 'paid', 'expired', 'failed'))
);

-- Add Stripe columns safely if bookings already existed
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
    ADD COLUMN IF NOT EXISTS total_amount_cents INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '31 minutes'),
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Ensure the composite key needed by booking_seats exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_booking_showtime'
          AND conrelid = 'bookings'::regclass
    ) THEN
        ALTER TABLE bookings
            ADD CONSTRAINT unique_booking_showtime
            UNIQUE (booking_id, showtime_id);
    END IF;
END $$;

-- Ensure status values are valid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'bookings_status_check'
          AND conrelid = 'bookings'::regclass
    ) THEN
        ALTER TABLE bookings
            ADD CONSTRAINT bookings_status_check
            CHECK (status IN ('pending_payment', 'paid', 'expired', 'failed'));
    END IF;
END $$;


-- 3. Booking seats
CREATE TABLE IF NOT EXISTS booking_seats (
    booking_seat_id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL,
    showtime_id INTEGER NOT NULL,
    seat_id INTEGER NOT NULL,
    ticket_type_code VARCHAR(30) NOT NULL DEFAULT 'adult',
    unit_price_cents INTEGER NOT NULL DEFAULT 1500,

    CONSTRAINT fk_booking_seats_booking
        FOREIGN KEY (booking_id, showtime_id)
        REFERENCES bookings(booking_id, showtime_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_booking_seats_seat
        FOREIGN KEY (seat_id)
        REFERENCES seats(seat_id)
        ON DELETE RESTRICT,

    CONSTRAINT unique_reserved_seat_per_showtime
        UNIQUE (showtime_id, seat_id)
);

ALTER TABLE booking_seats
    ADD COLUMN IF NOT EXISTS ticket_type_code VARCHAR(30) NOT NULL DEFAULT 'adult',
    ADD COLUMN IF NOT EXISTS unit_price_cents INTEGER NOT NULL DEFAULT 1500;

-- Add ticket type relationship if it does not already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_booking_seats_ticket_type'
          AND conrelid = 'booking_seats'::regclass
    ) THEN
        ALTER TABLE booking_seats
            ADD CONSTRAINT fk_booking_seats_ticket_type
            FOREIGN KEY (ticket_type_code)
            REFERENCES ticket_types(ticket_type_code);
    END IF;
END $$;


-- 4. Showtime-specific ticket prices
CREATE TABLE IF NOT EXISTS showtime_ticket_prices (
    showtime_id INTEGER NOT NULL
        REFERENCES showtimes(showtime_id) ON DELETE CASCADE,
    ticket_type_code VARCHAR(30) NOT NULL
        REFERENCES ticket_types(ticket_type_code),
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    PRIMARY KEY (showtime_id, ticket_type_code)
);


-- 5. Stripe webhook event log (prevents duplicate event processing)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    event_id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(255) NOT NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- 6. Indexes for reservation queries
CREATE INDEX IF NOT EXISTS idx_bookings_user
    ON bookings(user_id);

CREATE INDEX IF NOT EXISTS idx_bookings_status
    ON bookings(status);

CREATE INDEX IF NOT EXISTS idx_bookings_created_at
    ON bookings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_showtime
    ON bookings(showtime_id);

CREATE INDEX IF NOT EXISTS idx_booking_seats_booking
    ON booking_seats(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_seats_showtime
    ON booking_seats(showtime_id);

COMMIT;