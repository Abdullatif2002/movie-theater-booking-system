
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface Seat {
  seat_id: number;
  row_label: string;
  seat_number: number;
  is_accessible: boolean;
}

interface SeatResponse {
  showtime: {
    showtime_id: number;
    movie_id: number;
    screening_time: string;
    status: string;
  };
  cinema: {
    cinema_id: number;
    name: string;
    location: string;
  };
  room: {
    room_id: number;
    room_name: string;
    capacity: number;
  };
  seats: Seat[];
}

function SeatSelection() {
  const { showtimeId } = useParams<{ showtimeId: string }>();

  const [data, setData] = useState<SeatResponse | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadSeats = async () => {
      if (!showtimeId || !/^\d+$/.test(showtimeId)) {
        setError("Invalid showtime ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `http://localhost:3000/api/showtimes/${showtimeId}/seats`
        );

        if (!response.ok) {
          throw new Error("Unable to load seat information.");
        }

        const result: SeatResponse = await response.json();

        setData(result);
        setSelectedSeats([]);
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

    loadSeats();
  }, [showtimeId]);

  const rows = useMemo(() => {
    if (!data) return [];

    return Array.from(
      new Set(data.seats.map((seat) => seat.row_label))
    ).sort();
  }, [data]);

  const toggleSeat = (seatId: number) => {
    setSelectedSeats((current) =>
      current.includes(seatId)
        ? current.filter((id) => id !== seatId)
        : [...current, seatId]
    );
  };

  const selectedSeatDetails = useMemo(() => {
    if (!data) return [];

    return data.seats
      .filter((seat) => selectedSeats.includes(seat.seat_id))
      .sort(
        (a, b) =>
          a.row_label.localeCompare(b.row_label) ||
          a.seat_number - b.seat_number
      );
  }, [data, selectedSeats]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d] text-white">
        <p className="animate-pulse text-lg text-zinc-400">
          Loading seat layout...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090d] px-5 text-center text-white">
        <h1 className="text-3xl font-black">Seats unavailable</h1>
        <p className="mt-3 text-zinc-400">
          {error || "Unable to find this showtime."}
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

  if (data.showtime.status !== "scheduled") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090d] px-5 text-center text-white">
        <h1 className="text-3xl font-black">Showtime unavailable</h1>
        <p className="mt-3 text-zinc-400">
          This screening is not currently available for seat selection.
        </p>
        <Link
          to={`/movies/${data.showtime.movie_id}`}
          className="mt-6 rounded-lg bg-red-600 px-6 py-3 font-semibold hover:bg-red-500"
        >
          Back to Movie
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090d] text-white">

      {/* Header */}
      <header className="border-b border-white/10 bg-black/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link to="/" className="text-2xl font-black">
            CINE<span className="text-red-500">MAX</span>
          </Link>

          <Link
            to={`/movies/${data.showtime.movie_id}`}
            className="text-sm font-semibold text-zinc-400 hover:text-white"
          >
            ← Back to Movie
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10">

        {/* Heading */}
        <div className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
            CINEMAX · Booking
          </p>

          <h1 className="mt-3 text-3xl font-black sm:text-5xl">
            Select Your <span className="text-red-500">Seats</span>
          </h1>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400">
            <span>{data.cinema.name}</span>
            <span>{data.room.room_name}</span>
            <span>
              {new Date(data.showtime.screening_time).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Seat Selection */}
        <section className="rounded-2xl border border-white/10 bg-[#14141b] p-4 sm:p-8">

          {/* Screen */}
          <div className="mx-auto mb-12 max-w-3xl">
            <div className="h-2 rounded-full bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_8px_25px_rgba(239,68,68,0.3)]" />
            <p className="mt-4 text-center text-xs font-bold uppercase tracking-[0.35em] text-zinc-500">
              Screen
            </p>
          </div>

          {/* Legend */}
          <div className="mb-10 flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded bg-slate-600" />
              Available
            </div>

            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded bg-red-600" />
              Selected
            </div>

            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded border border-emerald-400 bg-emerald-600" />
              Accessible
            </div>
          </div>

          {/* Seat Grid */}
          {rows.length === 0 ? (
            <p className="py-10 text-center text-zinc-400">
              No seats have been configured for this screening room.
            </p>
          ) : (
            <div className="mx-auto max-w-3xl space-y-3 overflow-x-auto pb-4">
              {rows.map((row) => (
                <div
                  key={row}
                  className="flex min-w-[420px] items-center justify-center gap-2 sm:gap-3"
                >
                  <span className="w-5 text-center text-sm font-bold text-zinc-400">
                    {row}
                  </span>

                  {data.seats
                    .filter((seat) => seat.row_label === row)
                    .sort((a, b) => a.seat_number - b.seat_number)
                    .map((seat) => {
                      const isSelected = selectedSeats.includes(
                        seat.seat_id
                      );

                      return (
                        <button
                          key={seat.seat_id}
                          type="button"
                          onClick={() => toggleSeat(seat.seat_id)}
                          aria-pressed={isSelected}
                          aria-label={`Row ${seat.row_label}, seat ${seat.seat_number}${seat.is_accessible ? ", accessible" : ""}`}
                          title={`Row ${seat.row_label}, Seat ${seat.seat_number}${seat.is_accessible ? " · Accessible" : ""}`}
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-t-lg rounded-b-sm text-[10px] font-bold transition hover:scale-110 sm:h-9 sm:w-9 ${
                            isSelected
                              ? "bg-red-600 text-white ring-2 ring-red-300"
                              : seat.is_accessible
                                ? "border border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-500"
                                : "bg-slate-600 text-white hover:bg-slate-500"
                          }`}
                        >
                          {seat.seat_number}
                        </button>
                      );
                    })}

                  <span className="w-5 text-center text-sm font-bold text-zinc-400">
                    {row}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Selection Summary */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-[#14141b] p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">

            <div>
              <h2 className="text-xl font-bold">
                Your Selection
              </h2>

              {selectedSeatDetails.length > 0 ? (
                <p className="mt-2 text-sm text-zinc-400">
                  {selectedSeatDetails
                    .map((seat) => `${seat.row_label}${seat.seat_number}`)
                    .join(", ")}
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  No seats selected yet.
                </p>
              )}
            </div>

            <div className="text-left sm:text-right">
              <p className="text-sm text-zinc-400">
                Selected seats
              </p>

              <p className="mt-1 text-3xl font-black text-red-500">
                {selectedSeats.length}
              </p>
            </div>

          </div>

          <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-6 text-zinc-500">
            Seat selection is currently a frontend demonstration.
            Your selections are not reserved or saved to the database.
            Occupied seat information will be added with booking integration.
          </p>
        </section>

      </main>
    </div>
  );
}

export default SeatSelection;
