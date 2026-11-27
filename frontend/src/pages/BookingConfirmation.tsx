
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface Booking {
  booking_id: number;
  user_id: number;
  showtime_id: number;
  created_at: string;
  payment_status: string;
  total_amount_cents: number | string | null;
  currency: string;
  paid_at: string | null;
  expires_at: string | null;
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
  ticket_type_code: string | null;
  unit_price_cents: number | string | null;
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
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    if (!bookingId || !/^\d+$/.test(bookingId)) {
      setError("Invalid booking ID.");
      setLoading(false);
      return;
    }

    let active = true;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const loadBooking = async (isRefresh = false) => {
      try {
        if (isRefresh && active) {
          setRefreshing(true);
        }

        const response = await fetch(
          `http://localhost:3000/api/bookings/${bookingId}`,
          { cache: "no-store" }
        );

        const result: BookingResponse | { error?: string } =
          await response.json();

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error || "Unable to load booking."
              : "Unable to load booking."
          );
        }

        if (!active || !("booking" in result)) return;

        setData(result);
        setError("");

        const status = result.booking.payment_status;

        // Stop polling after a final payment state.
        if (
          ["paid", "expired", "failed", "cancelled"].includes(status) &&
          intervalId
        ) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Something went wrong."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    loadBooking();

    intervalId = setInterval(() => {
      if (active) {
        loadBooking(true);
      }
    }, 3000);

    return () => {
      active = false;

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [bookingId]);

  const formatPrice = (amount: number | string | null) => {
    if (amount === null || amount === undefined) return "—";

    return new Intl.NumberFormat("fi-FI", {
      style: "currency",
      currency: data?.booking.currency || "EUR",
    }).format(Number(amount) / 100);
  };

  const getTicketName = (type: string | null) => {
    switch (type) {
      case "child":
        return "Child (under 16)";
      case "accessible":
        return "Accessible";
      case "adult":
        return "Adult";
      default:
        return "Previous booking";
    }
  };

  const handleConfirmPayment = async () => {
    if (!bookingId || actionLoading) return;
    try {
      setActionLoading(true);
      setActionMessage("");
      const res = await fetch(
        `http://localhost:3000/api/bookings/${bookingId}/confirm-payment`,
        { method: "POST" }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Unable to confirm payment.");
      }
      const reload = await fetch(
        `http://localhost:3000/api/bookings/${bookingId}`,
        { cache: "no-store" }
      );
      if (reload.ok) {
        setData(await reload.json());
      }
      setActionMessage("Payment confirmed! Your seat reservation is locked in.");
    } catch (err) {
      setActionMessage(
        err instanceof Error ? err.message : "Action failed."
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleExpireReservation = async () => {
    if (!bookingId || actionLoading) return;
    try {
      setActionLoading(true);
      setActionMessage("");
      const res = await fetch(
        `http://localhost:3000/api/bookings/${bookingId}/expire`,
        { method: "POST" }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Unable to expire reservation.");
      }
      const reload = await fetch(
        `http://localhost:3000/api/bookings/${bookingId}`,
        { cache: "no-store" }
      );
      if (reload.ok) {
        setData(await reload.json());
      }
      setActionMessage(
        "Unpaid reservation expired according to reservation rules. Seats have been released."
      );
    } catch (err) {
      setActionMessage(
        err instanceof Error ? err.message : "Action failed."
      );
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusDetails = (status: string) => {
    switch (status) {
      case "paid":
        return {
          title: "Your booking is confirmed!",
          subtitle: "Your payment has been successfully received.",
          label: "Payment successful",
          color: "emerald",
          icon: "✓",
        };

      case "pending_payment":
        return {
          title: "Payment is processing",
          subtitle:
            "We are waiting for Stripe to confirm your payment. This page updates automatically.",
          label: "Payment pending",
          color: "yellow",
          icon: "…",
        };

      case "expired":
        return {
          title: "Payment session expired",
          subtitle:
            "The payment was not completed within the allowed time. Your seats have been released.",
          label: "Booking expired",
          color: "red",
          icon: "!",
        };

      case "failed":
        return {
          title: "Payment could not be completed",
          subtitle:
            "Your booking was not confirmed. Please start a new booking.",
          label: "Payment failed",
          color: "red",
          icon: "!",
        };

      case "cancelled":
        return {
          title: "Booking cancelled",
          subtitle: "This booking has been cancelled.",
          label: "Cancelled",
          color: "red",
          icon: "!",
        };

      default:
        return {
          title: "Booking status unavailable",
          subtitle: "Please contact the cinema for assistance.",
          label: status,
          color: "yellow",
          icon: "?",
        };
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d] text-white">
        Loading booking details...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090d] px-5 text-center text-white">
        <h1 className="text-3xl font-black">Booking unavailable</h1>

        <p className="mt-3 text-zinc-400">{error}</p>

        <Link
          to="/"
          className="mt-6 rounded-lg bg-red-600 px-6 py-3 font-semibold hover:bg-red-500"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const { booking, seats } = data;
  const status = getStatusDetails(booking.payment_status);
  const isPaid = booking.payment_status === "paid";
  const isPending = booking.payment_status === "pending_payment";
  const isExpiredOrFailed = ["expired", "failed", "cancelled"].includes(
    booking.payment_status
  );

  const colorClasses: Record<string, string> = {
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    yellow: "border-yellow-500/20 bg-yellow-500/10 text-yellow-400",
    red: "border-red-500/20 bg-red-500/10 text-red-400",
  };

  const seatColor = isPaid
    ? "border-emerald-500/30 bg-emerald-500/10"
    : "border-white/10 bg-white/[0.04]";

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
        <section className="rounded-2xl border border-white/10 bg-[#14141b] p-7 text-center sm:p-10">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border text-3xl font-black ${colorClasses[status.color] || colorClasses.yellow}`}
          >
            {status.icon}
          </div>

          <p
            className={`mt-6 text-xs font-bold uppercase tracking-[0.3em] ${colorClasses[status.color]?.split(" ").pop()}`}
          >
            {status.label}
          </p>

          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            {status.title}
          </h1>

          <p className="mt-3 text-sm text-zinc-400">
            {status.subtitle}
          </p>

          {isPending && (
            <div className="mt-6">
              <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-yellow-400/30 border-t-yellow-400" />
              <p className="mt-3 text-xs text-zinc-500">
                {refreshing
                  ? "Checking payment status..."
                  : "Waiting for payment confirmation..."}
              </p>

              <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleConfirmPayment}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  Confirm Payment Now
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleExpireReservation}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  Expire Unpaid Hold & Release Seats
                </button>
              </div>
            </div>
          )}

          {actionMessage && (
            <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-zinc-300">
              {actionMessage}
            </p>
          )}

          <div className="mt-7 rounded-xl bg-white/[0.04] p-5">
            <p className="text-sm text-zinc-400">Booking ID</p>
            <p className="mt-2 text-3xl font-black text-white">
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
              <span className="text-right font-semibold">
                {booking.movie_title}
              </span>
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
              <span className="text-right">
                {new Date(booking.created_at).toLocaleString()}
              </span>
            </div>

            {booking.paid_at && (
              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">Paid at</span>
                <span className="text-right">
                  {new Date(booking.paid_at).toLocaleString()}
                </span>
              </div>
            )}

            {isPending && booking.expires_at && (
              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">Payment deadline</span>
                <span className="text-right">
                  {new Date(booking.expires_at).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#14141b] p-6">
          <h2 className="text-xl font-bold">Your Tickets</h2>

          {seats.length === 0 ? (
            <p className="mt-5 text-sm text-zinc-400">
              No active seats are attached to this booking.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {seats.map((seat) => (
                <div
                  key={seat.seat_id}
                  className={`flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center ${seatColor}`}
                >
                  <div>
                    <p className="font-bold">
                      Row {seat.row_label} · Seat {seat.seat_number}
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                      {getTicketName(seat.ticket_type_code)}
                    </p>

                    {seat.is_accessible && (
                      <p className="mt-1 text-xs text-emerald-300">
                        Accessible seat
                      </p>
                    )}
                  </div>

                  <p className="font-bold">
                    {formatPrice(seat.unit_price_cents)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex justify-between border-t border-white/10 pt-4">
            <span className="font-bold">Total</span>
            <span className="text-xl font-black text-red-500">
              {formatPrice(booking.total_amount_cents)}
            </span>
          </div>
        </section>

        {isExpiredOrFailed && (
          <div className="mt-5 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            This booking is not confirmed. Please return to the movie
            listing and make a new booking if you still want tickets.
          </div>
        )}

        <p className="mt-5 text-center text-xs leading-6 text-zinc-500">
          Payment status is confirmed by the CINEMAX server through
          Stripe webhook verification. This page does not treat a
          browser redirect as proof of payment.
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
