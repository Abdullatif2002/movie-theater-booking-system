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

-- INDEXES
CREATE INDEX idx_screening_rooms_cinema
ON screening_rooms(cinema_id);

