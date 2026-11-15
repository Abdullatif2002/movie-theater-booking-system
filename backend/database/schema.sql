-- 1. USERS TABLE
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,

    role VARCHAR(20) NOT NULL
        CHECK (role IN ('customer', 'staff', 'admin')),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- 2. MOVIES TABLE
CREATE TABLE movies (
    movie_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration INT NOT NULL CHECK (duration > 0),
    poster_image TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- 3. CINEMAS TABLE
CREATE TABLE cinemas (
    cinema_id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    location VARCHAR(150) NOT NULL
);


-- 4. SCREENING ROOMS TABLE
CREATE TABLE screening_rooms (
    room_id SERIAL PRIMARY KEY,

    cinema_id INT NOT NULL,
    room_name VARCHAR(100) NOT NULL,
    capacity INT NOT NULL CHECK (capacity > 0),

    CONSTRAINT fk_room_cinema
        FOREIGN KEY (cinema_id)
        REFERENCES cinemas(cinema_id)
        ON DELETE RESTRICT,

    CONSTRAINT unique_room_name
        UNIQUE (cinema_id, room_name)
);

-- 5. SEATS TABLE

CREATE TABLE seats (
    seat_id SERIAL PRIMARY KEY,

    room_id INT NOT NULL,
    row_label VARCHAR(10) NOT NULL,
    seat_number INT NOT NULL,

    is_accessible BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_seat_room
        FOREIGN KEY (room_id)
        REFERENCES screening_rooms(room_id)
        ON DELETE CASCADE,

    CONSTRAINT unique_seat_position
        UNIQUE (room_id, row_label, seat_number),

    CONSTRAINT check_seat_number
        CHECK (seat_number > 0),

    CONSTRAINT prevent_row_13
        CHECK (row_label <> '13')
);


-- 6. SHOWTIMES TABLE

CREATE TABLE showtimes (
    showtime_id SERIAL PRIMARY KEY,

    movie_id INT NOT NULL,
    room_id INT NOT NULL,

    screening_time TIMESTAMP NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (
            status IN (
                'scheduled',
                'cancelled',
                'completed'
            )
        ),

    CONSTRAINT fk_showtime_movie
        FOREIGN KEY (movie_id)
        REFERENCES movies(movie_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_showtime_room
        FOREIGN KEY (room_id)
        REFERENCES screening_rooms(room_id)
        ON DELETE RESTRICT,

    CONSTRAINT check_showtime_room
        UNIQUE (showtime_id, room_id)
);


-- INDEXES
CREATE INDEX idx_screening_rooms_cinema
ON screening_rooms(cinema_id);

CREATE INDEX idx_showtimes_movie
ON showtimes(movie_id);

CREATE INDEX idx_showtimes_room
ON showtimes(room_id);

CREATE INDEX idx_showtimes_screening_time
ON showtimes(screening_time);


-- 7. BOOKINGS TABLE
CREATE TABLE bookings (
    booking_id SERIAL PRIMARY KEY,

    user_id INT NOT NULL,
    showtime_id INT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_booking_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_booking_showtime
        FOREIGN KEY (showtime_id)
        REFERENCES showtimes(showtime_id)
        ON DELETE RESTRICT,

    -- Allows booking_seats to verify the booking's showtime
    CONSTRAINT unique_booking_showtime
        UNIQUE (booking_id, showtime_id)
);


-- 8. BOOKING SEATS TABLE
CREATE TABLE booking_seats (
    booking_seat_id SERIAL PRIMARY KEY,

    booking_id INT NOT NULL,
    showtime_id INT NOT NULL,
    seat_id INT NOT NULL,

    CONSTRAINT fk_booking_seats_booking
        FOREIGN KEY (booking_id, showtime_id)
        REFERENCES bookings(booking_id, showtime_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_booking_seats_seat
        FOREIGN KEY (seat_id)
        REFERENCES seats(seat_id)
        ON DELETE RESTRICT,

    -- A seat can only be booked once for a particular showtime
    CONSTRAINT unique_reserved_seat_per_showtime
        UNIQUE (showtime_id, seat_id)
);


-- INDEXES FOR BOOKING TABLES
CREATE INDEX idx_bookings_user
ON bookings(user_id);

CREATE INDEX idx_booking_seats_booking
ON booking_seats(booking_id);


