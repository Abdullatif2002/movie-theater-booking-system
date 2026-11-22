
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

interface Seat {
  seat_id: number;
  row_label: string;
  seat_number: number;
  is_accessible: boolean;
  is_booked: boolean;
}

interface SeatResponse {
  showtime: {
    showtime_id: number;
    movie_id: number;
    screening_time: string;
    status: string;
  };
  cinema: {
    name: string;
    location: string;
  };
  room: {
    room_name: string;
  };
  seats: Seat[];
}

interface Movie {
  movie_id: number;
  title: string;
}

function BookingSummary() {
  const { showtimeId } = useParams<{ showtimeId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<SeatResponse | null>(null);
  const [movieTitle, setMovieTitle] = useState("");
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadBookingSummary = async () => {
      if (!showtimeId || !/^\d+$/.test(showtimeId)) {
        setError("Invalid showtime ID.");
        setLoading(false);
        return;
      }

      const storedSeats = sessionStorage.getItem(
        `selectedSeats-${showtimeId}`
      );

      if (!storedSeats) {
        setError("No seats selected. Please select your seats first.");
        setLoading(false);
        return;
      }

      let seatIds: number[];

      try {
        seatIds = JSON.parse(storedSeats);

        if (
          !Array.isArray(seatIds) ||
          seatIds.length === 0 ||
          !seatIds.every(
            (id) => Number.isInteger(id) && id > 0
          ) ||
          new Set(seatIds).size !== seatIds.length
        ) {
          throw new Error("Invalid seat selection.");
        }
      } catch {
        setError("Invalid seat selection. Please select seats again.");
        setLoading(false);
        return;
      }

      try {
        // Load seat and showtime information
        const response = await fetch(
          `http://localhost:3000/api/showtimes/${showtimeId}/seats`
        );

        if (!response.ok) {
          throw new Error("Unable to load booking information.");
        }

        const result: SeatResponse = await response.json();

        if (result.showtime.status !== "scheduled") {
          throw new Error("This showtime is not available.");
        }

        // Prevent past or already started screenings
        const screeningTime = new Date(
          result.showtime.screening_time
        ).getTime();

        if (
          !Number.isFinite(screeningTime) ||
          screeningTime <= Date.now()
        ) {
          throw new Error(
            "This screening has already started or passed. Please select a future showtime."
          );
        }

        // Load movie title
        const moviesResponse = await fetch(
          "http://localhost:3000/api/movies"
        );

        if (!moviesResponse.ok) {
          throw new Error("Unable to load movie information.");
        }

        const movies: Movie[] = await moviesResponse.json();

        const movie = movies.find(
          (item) => item.movie_id === result.showtime.movie_id
        );

        if (!movie) {
          throw new Error("Movie information not found.");
        }

        // Validate selected seats
        const chosenSeats = result.seats.filter((seat) =>
          seatIds.includes(seat.seat_id)
        );

        if (
          chosenSeats.length !== seatIds.length ||
          chosenSeats.some((seat) => seat.is_booked)
        ) {
          throw new Error(
            "One or more selected seats are no longer available. Please select again."
          );
        }

        setData(result);
        setMovieTitle(movie.title);
        setSelectedSeats(chosenSeats);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    };

    loadBookingSummary();
  }, [showtimeId]);

  const confirmBooking = async () => {
    if (!data || !showtimeId || submitting) return;

    try {
      setSubmitting(true);
      setError("");

      const response = await fetch(
        "http://localhost:3000/api/bookings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: 1,
            showtime_id: Number(showtimeId),
            seat_ids: selectedSeats.map((seat) => seat.seat_id),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to confirm booking."
        );
      }

      sessionStorage.removeItem(`selectedSeats-${showtimeId}`);

      navigate(
        `/booking-confirmation/${result.booking.booking_id}`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Booking failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d] text-white">
        <p className="animate-pulse text-zinc-400">
          Loading booking summary...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090d] px-5 text-center text-white">
        <h1 className="text-3xl font-black">Booking unavailable</h1>

        <p className="mt-3 text-zinc-400">{error}</p>

        <Link
          to={`/showtimes/${showtimeId}/seats`}
          className="mt-6 rounded-lg bg-red-600 px-6 py-3 font-semibold hover:bg-red-500"
        >
          Back to Seat Selection
        </Link>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-[#09090d] text-white">
      <header className="border-b border-white/10 bg-black/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Link to="/" className="text-2xl font-black">
            CINE<span className="text-red-500">MAX</span>
          </Link>

          <Link
            to={`/showtimes/${showtimeId}/seats`}
            className="text-sm text-zinc-400 hover:text-white"
          >
            ← Back to Seats
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
          CINEMAX · Checkout
        </p>

        <h1 className="mt-3 text-4xl font-black">
          Booking <span className="text-red-500">Summary</span>
        </h1>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#14141b] p-6">
          <h2 className="text-xl font-bold">Screening Details</h2>

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Movie</span>
              <span className="text-right font-semibold">
                {movieTitle}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Cinema</span>
              <span>{data.cinema.name}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Location</span>
              <span>{data.cinema.location}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Screen</span>
              <span>{data.room.room_name}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Date & Time</span>
              <span className="text-right">
                {new Date(
                  data.showtime.screening_time
                ).toLocaleString()}
              </span>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#14141b] p-6">
          <h2 className="text-xl font-bold">Selected Seats</h2>

          <div className="mt-5 space-y-3">
            {selectedSeats.map((seat) => (
              <div
                key={seat.seat_id}
                className="flex items-center justify-between rounded-lg bg-white/[0.04] p-4"
              >
                <span className="font-bold">
                  Row {seat.row_label} · Seat {seat.seat_number}
                </span>

                {seat.is_accessible && (
                  <span className="text-xs text-emerald-400">
                    Accessible
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 flex justify-between border-t border-white/10 pt-4">
            <span className="text-zinc-400">Total seats</span>
            <span className="font-bold">
              {selectedSeats.length}
            </span>
          </div>
        </section>

        <p className="mt-5 text-xs leading-6 text-zinc-500">
          This is a development booking flow using a test customer account.
          Ticket pricing and payment are not included.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={confirmBooking}
          disabled={submitting || selectedSeats.length === 0}
          className="mt-7 w-full rounded-xl bg-red-600 px-6 py-4 font-bold transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Confirming Booking..." : "Confirm Booking"}
        </button>
      </main>
    </div>
  );
}

export default BookingSummary;
