import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

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

interface TicketPrice {
  ticket_type_code: "adult" | "child" | "accessible";
  display_name: string;
  price_cents: number;
  currency: string;
  discount_percent: number;
}

type TicketSelections = Record<number, TicketPrice["ticket_type_code"]>;

function BookingSummary() {
  const { showtimeId } = useParams<{ showtimeId: string }>();

  const [data, setData] = useState<SeatResponse | null>(null);
  const [movieTitle, setMovieTitle] = useState("");
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([]);
  const [ticketPrices, setTicketPrices] = useState<TicketPrice[]>([]);
  const [ticketSelections, setTicketSelections] =
    useState<TicketSelections>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [seatConflict, setSeatConflict] = useState(false);
  const [approvedRules, setApprovedRules] = useState(true);

  const paymentCancelled =
    new URLSearchParams(window.location.search).get("payment") ===
    "cancelled";

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
        const [
          seatsResponse,
          moviesResponse,
          pricesResponse,
        ] = await Promise.all([
          fetch(
            `http://localhost:3000/api/showtimes/${showtimeId}/seats`
          ),
          fetch("http://localhost:3000/api/movies"),
          fetch(
            `http://localhost:3000/api/showtimes/${showtimeId}/ticket-prices`
          ),
        ]);

        if (!seatsResponse.ok) {
          throw new Error("Unable to load booking information.");
        }

        if (!moviesResponse.ok) {
          throw new Error("Unable to load movie information.");
        }

        if (!pricesResponse.ok) {
          throw new Error("Unable to load ticket prices.");
        }

        const result: SeatResponse = await seatsResponse.json();
        const movies: Movie[] = await moviesResponse.json();
        const prices: TicketPrice[] = await pricesResponse.json();

        if (result.showtime.status !== "scheduled") {
          throw new Error("This showtime is not available.");
        }

        const screeningTime = new Date(
          result.showtime.screening_time
        ).getTime();

        if (
          !Number.isFinite(screeningTime) ||
          screeningTime <= Date.now()
        ) {
          throw new Error(
            "This screening has already started or passed."
          );
        }

        const movie = movies.find(
          (item) => item.movie_id === result.showtime.movie_id
        );

        if (!movie) {
          throw new Error("Movie information not found.");
        }

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

        const requiredTypes = ["adult", "child", "accessible"];

        if (
          !requiredTypes.every((type) =>
            prices.some((price) => price.ticket_type_code === type)
          )
        ) {
          throw new Error("Required ticket prices are unavailable.");
        }

        setData(result);
        setMovieTitle(movie.title);
        setSelectedSeats(chosenSeats);
        setTicketPrices(prices);

        // Adult is the default ticket category for every seat.
        const defaults: TicketSelections = {};

        chosenSeats.forEach((seat) => {
          defaults[seat.seat_id] = "adult";
        });

        setTicketSelections(defaults);
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

  const updateTicketType = (
    seatId: number,
    ticketType: TicketPrice["ticket_type_code"]
  ) => {
    setTicketSelections((previous) => ({
      ...previous,
      [seatId]: ticketType,
    }));
  };

  const getPrice = (ticketType: string): number => {
    const price = ticketPrices.find(
      (item) => item.ticket_type_code === ticketType
    );

    return Number(price?.price_cents ?? 0);
  };

  const totalAmount = selectedSeats.reduce((total, seat) => {
    return total + getPrice(ticketSelections[seat.seat_id]);
  }, 0);

  const formatPrice = (amountCents: number) =>
    new Intl.NumberFormat("fi-FI", {
      style: "currency",
      currency: "EUR",
    }).format(amountCents / 100);

  const confirmBooking = async () => {
    if (!data || !showtimeId || submitting) return;

    if (
      selectedSeats.some(
        (seat) => !ticketSelections[seat.seat_id]
      )
    ) {
      setError("Please select a ticket type for every seat.");
      return;
    }

    if (!approvedRules) {
      setError(
        "Please approve the reservation hold and expiry rules before continuing."
      );
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setSeatConflict(false);

      const tickets = selectedSeats.map((seat) => ({
        seat_id: seat.seat_id,
        ticket_type_code: ticketSelections[seat.seat_id],
      }));

      const response = await fetch(
        "http://localhost:3000/api/checkout-sessions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: 1,
            showtime_id: Number(showtimeId),
            tickets,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setSeatConflict(true);
          sessionStorage.removeItem(`selectedSeats-${showtimeId}`);
        }

        throw new Error(
          result.error || "Unable to start checkout."
        );
      }

      if (!result.checkout_url) {
        throw new Error("Stripe Checkout URL was not returned.");
      }

      // Redirect to Stripe-hosted Checkout.
      // Keep selected seats in sessionStorage if customer cancels.
      window.location.href = result.checkout_url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Checkout failed. Please try again."
      );
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

        {paymentCancelled && (
          <div className="mt-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-300">
            Payment was cancelled. Your selected seats are still in
            this session. You can try checkout again if they remain
            available.
          </div>
        )}

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
          <h2 className="text-xl font-bold">Ticket Selection</h2>

          <p className="mt-2 text-sm text-zinc-400">
            Choose a ticket category for each selected seat.
          </p>

          <div className="mt-5 space-y-4">
            {selectedSeats.map((seat) => (
              <div
                key={seat.seat_id}
                className="flex flex-col gap-3 rounded-lg bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-bold">
                    Row {seat.row_label} · Seat {seat.seat_number}
                  </p>

                  {seat.is_accessible && (
                    <span className="mt-1 inline-block text-xs text-emerald-400">
                      Accessible seat
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={ticketSelections[seat.seat_id] || "adult"}
                    onChange={(event) =>
                      updateTicketType(
                        seat.seat_id,
                        event.target.value as TicketPrice["ticket_type_code"]
                      )
                    }
                    className="min-w-40 rounded-lg border border-white/10 bg-[#24242d] px-3 py-2 text-sm text-white outline-none focus:border-red-500"
                    aria-label={`Ticket type for seat ${seat.row_label}${seat.seat_number}`}
                  >
                    {ticketPrices.map((price) => (
                      <option
                        key={price.ticket_type_code}
                        value={price.ticket_type_code}
                      >
                        {price.display_name} –{" "}
                        {formatPrice(Number(price.price_cents))}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#14141b] p-6">
          <h2 className="text-xl font-bold">Price Breakdown</h2>

          <div className="mt-5 space-y-3">
            {ticketPrices.map((price) => {
              const quantity = selectedSeats.filter(
                (seat) =>
                  ticketSelections[seat.seat_id] ===
                  price.ticket_type_code
              ).length;

              if (quantity === 0) return null;

              return (
                <div
                  key={price.ticket_type_code}
                  className="flex justify-between gap-4 text-sm"
                >
                  <span className="text-zinc-400">
                    {price.display_name} × {quantity}
                  </span>

                  <span className="font-semibold">
                    {formatPrice(
                      Number(price.price_cents) * quantity
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex justify-between border-t border-white/10 pt-4">
            <span className="text-lg font-bold">Total</span>
            <span className="text-2xl font-black text-red-500">
              {formatPrice(totalAmount)}
            </span>
          </div>

          <p className="mt-4 text-xs leading-6 text-zinc-500">
            Child tickets are for customers under 16. Child and
            accessible discounts cannot be combined. Accessible
            ticket pricing is separate from accessible seat selection.
            Final prices are calculated and verified by the server.
          </p>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#14141b] p-6">
          <h2 className="text-lg font-bold">
            Reservation Hold & Expiry Rules
          </h2>

          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-6 text-zinc-400">
            <li>
              Only one active reservation is permitted for a specific seat and
              screening.
            </li>
            <li>
              Your selected seats are held for <strong>31 minutes</strong> while
              you complete payment.
            </li>
            <li>
              If payment is not completed before the reservation deadline, the
              unpaid reservation automatically expires and releases the seats for
              other customers.
            </li>
          </ul>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-xs text-zinc-200">
            <input
              type="checkbox"
              checked={approvedRules}
              onChange={(e) => setApprovedRules(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-red-600"
            />
            <span>
              I approve the reservation rules and understand that an expired
              unpaid reservation automatically releases the selected seats.
            </span>
          </label>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300"
          >
            <p className="font-bold text-red-200">
              {seatConflict
                ? "Seat No Longer Available"
                : "Unable to Complete Booking"}
            </p>
            <p className="mt-1">{error}</p>

            {seatConflict && (
              <Link
                to={`/showtimes/${showtimeId}/seats`}
                className="mt-4 inline-block rounded-lg bg-red-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-red-500"
              >
                Return to Seat Selection →
              </Link>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={confirmBooking}
          disabled={
            submitting || selectedSeats.length === 0 || seatConflict
          }
          className="mt-7 w-full rounded-xl bg-red-600 px-6 py-4 font-bold transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? "Redirecting to Stripe..."
            : `Continue to Payment · ${formatPrice(totalAmount)}`}
        </button>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Secure test payment powered by Stripe Checkout.
        </p>
      </main>
    </div>
  );
}

export default BookingSummary;
