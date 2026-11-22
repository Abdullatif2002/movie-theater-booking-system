
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface Booking {
  booking_id: number;
  user_id: number;
  showtime_id: number;
  created_at: string;
  full_name: string;
  email: string;
  movie_title: string;
  screening_time: string;
  cinema_name: string;
  cinema_location: string;
  room_name: string;
}

interface BookingSeat {
  seat_id: number;
  row_label: string;
  seat_number: number;
  is_accessible: boolean;
}

interface BookingResponse {
  booking: Booking;
  seats: BookingSeat[];
}

function BookingConfirmation() {
  const { bookingId } = useParams<{ bookingId: string }>();

  const [data, setData] = useState<BookingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadBooking = async () => {
      if (!bookingId || !/^\d+$/.test(bookingId)) {
        setError("Invalid booking ID.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `http://localhost:3000/api/bookings/${bookingId}`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Unable to load booking.");
        }

        setData(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    };

    loadBooking();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d] text-white">
        Loading booking confirmation...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090d] px-5 text-center text-white">
        <h1 className="text-3xl font-black">Booking unavailable</h1>
        <p className="mt-3 text-zinc-400">
          {error || "Booking details not found."}
        </p>
        <Link
          to="/"
          className="mt-6 rounded-lg bg-red-600 px-6 py-3 font-semibold hover:bg-red-500"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const { booking, seats } = data;

  return (
    <div className="min-h-screen bg-[#09090d] text-white">
      <header className="border-b border-white/10 bg-black/40">
        <div className="mx-auto max-w-3xl px-5 py-5">
          <Link to="/" className="text-2xl font-black">
            CINE<span className="text-red-500">MAX</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <section className="rounded-2xl border border-emerald-500/20 bg-[#14141b] p-7 text-center sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-3xl text-emerald-400">
            ✓
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.3em] text-emerald-400">
            Booking successful
          </p>

          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Your booking is <span className="text-emerald-400">confirmed!</span>
          </h1>

          <p className="mt-3 text-sm text-zinc-400">
            Your booking details are shown below.
          </p>

          <div className="mt-7 rounded-xl bg-white/[0.04] p-5">
            <p className="text-sm text-zinc-400">Booking ID</p>
            <p className="mt-2 text-3xl font-black text-emerald-400">
              #{booking.booking_id}
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#14141b] p-6">
          <h2 className="text-xl font-bold">Booking Details</h2>

          <div className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Customer</span>
              <span>{booking.full_name}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Email</span>
              <span>{booking.email}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Movie</span>
              <span className="font-semibold">{booking.movie_title}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Cinema</span>
              <span>{booking.cinema_name}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Location</span>
              <span>{booking.cinema_location}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Screen</span>
              <span>{booking.room_name}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Screening</span>
              <span className="text-right">
                {new Date(booking.screening_time).toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">Booking date</span>
              <span>
                {new Date(booking.created_at).toLocaleString()}
              </span>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#14141b] p-6">
          <h2 className="text-xl font-bold">Your Seats</h2>

          <div className="mt-5 flex flex-wrap gap-3">
            {seats.map((seat) => (
              <div
                key={seat.seat_id}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-3"
              >
                <p className="text-xs text-zinc-400">
                  Row {seat.row_label}
                </p>
                <p className="text-xl font-black text-emerald-400">
                  {seat.seat_number}
                </p>
                {seat.is_accessible && (
                  <p className="text-xs text-emerald-300">
                    Accessible
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-6 text-zinc-500">
          Development booking confirmation. Payment and ticket pricing are
          not included in this version.
        </p>

        <Link
          to="/"
          className="mt-7 block w-full rounded-xl bg-red-600 px-6 py-4 text-center font-bold transition hover:bg-red-500"
        >
          Back to Home
        </Link>
      </main>
    </div>
  );
}

export default BookingConfirmation;
