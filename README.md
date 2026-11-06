# Movie Theater Booking System

A web-based movie theater booking system designed to provide customers with an easy way to browse movies and, in future stages, book movie tickets. The system will also include management features for theater staff and administrators.

## Project Overview

The goal of this project is to develop a movie theater booking system with a user-friendly interface and backend functionality.

Customers will be able to browse movies, explore showtimes, select seats, and make reservations. Staff and administrators will have tools to manage movies, showtimes, and theater operations.

## Main Features

- Browse available movies
- View movie titles, descriptions, posters, and durations
- Search movies by title
- Responsive navigation and movie browsing interface
- Explore showtimes for different theaters
- Interactive seat selection and seat availability
- Prevent double booking of the same seat
- Ticket reservation and payment workflow
- Admin and staff management features
- Accessible seating options
- Corporate private screening requests

## Current Development Progress

The project is currently under development.

### Frontend Movie Browsing Interface

The initial frontend movie browsing interface has been developed using React and TypeScript.

Completed frontend work so far:

- Created a navigation bar.
- Added a welcome hero section.
- Created reusable movie card components.
- Added six sample movies with poster images, titles, descriptions, and durations.
- Implemented movie search by title.
- Added a "No movies found" message when there are no matching results.
- Created a dark cinema-style design with red accents.
- Added responsive CSS layouts for different screen sizes.
- Added a backend health check to test the frontend and backend connection.

**Note:** Movie information currently uses temporary sample data. Integration with the actual movie listing API is a planned next step.

## Technology Stack

| Technology | Purpose |
|---|---|
| React | Frontend development |
| TypeScript | Frontend programming language |
| CSS | Styling and responsive design |
| Node.js | Backend runtime |
| Express.js | Backend framework |
| PostgreSQL | Database |
| Cypress | End-to-end testing |
| Git and GitHub | Version control and collaboration |
| Azure | Planned deployment platform |

## User Roles

- **Customer:** Browse movies, explore showtimes, select seats, and book tickets.
- **Staff:** Manage theater operations and assist customers.
- **Administrator:** Manage movies, theaters, users, and system information.

## Project Structure

The project is organized into frontend and backend parts.

```text
movie-theater-booking-system/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── Hero.tsx
│   │   │   └── MovieCard.tsx
│   │   │
│   │   ├── data/
│   │   │   └── movie.ts
│   │   │
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.tsx
│   │
│   └── package.json
│
└── README.md
```

*The structure above shows the current frontend files; backend files and additional features will be added as development continues.*

## Running the Frontend

1. Clone the repository:

```bash
git clone https://github.com/Abdullatif2002/movie-theater-booking-system.git
```

2. Open the project folder:

```bash
cd movie-theater-booking-system
```

3. Open the frontend folder:

```bash
cd frontend
```

4. Install dependencies:

```bash
npm install
```

5. Start the development server:

```bash
npm run dev
```

6. Open the local URL shown in the terminal, usually:

```text
http://localhost:5173
```

## Team

Team members and their responsibilities will be added here.

## Project Status

**In Development**

The initial frontend movie browsing interface is implemented. Backend integration, movie showtimes, seat selection, reservations, payments, and administrative functionality are planned for future development.

## Note

This project is being developed as part of a course group project. Features and technical decisions may be updated based on team discussions and course requirements.