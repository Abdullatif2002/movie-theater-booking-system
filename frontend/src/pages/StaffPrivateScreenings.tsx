import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { SubmittedScreeningRequest } from "./PrivateScreeningRequest";

interface StaffUser {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
}

const TOKEN_STORAGE_KEY = "cinemax_staff_token";
const USER_STORAGE_KEY = "cinemax_staff_user";

function StaffPrivateScreenings() {
  const [token, setToken] = useState<string>(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  });

  const [staffUser, setStaffUser] = useState<StaffUser | null>(() => {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    if (!saved) return null;
    try {
      return JSON.parse(saved) as StaffUser;
    } catch {
      return null;
    }
  });

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Requests list state
  const [requests, setRequests] = useState<SubmittedScreeningRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken("");
    setStaffUser(null);
    setRequests([]);
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setListError("");

      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      if (statusFilter) {
        params.set("status", statusFilter);
      }

      const queryString = params.toString();
      const url = `http://localhost:3000/api/staff/private-screenings${
        queryString ? `?${queryString}` : ""
      }`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        handleLogout();
        setLoginError(
          "Your staff session expired or lacks permission. Please sign in with a Staff or Admin account."
        );
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load private screening requests."
        );
      }

      setRequests(data.requests || []);
    } catch (err) {
      setListError(
        err instanceof Error
          ? err.message
          : "Unable to load private screening requests."
      );
    } finally {
      setLoading(false);
    }
  }, [token, searchQuery, statusFilter, handleLogout]);

  useEffect(() => {
    if (token) {
      fetchRequests();
    }
  }, [token, fetchRequests]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");

    if (!email.trim() || !password) {
      setLoginError("Please enter both email and password.");
      return;
    }

    try {
      setLoggingIn(true);

      const response = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid login credentials.");
      }

      if (!data.user || !["staff", "admin"].includes(data.user.role)) {
        throw new Error(
          "Access denied. Only authorized Staff or Admin accounts can view submitted private screening requests."
        );
      }

      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      setToken(data.token);
      setStaffUser(data.user);
      setPassword("");
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : "Unable to sign in."
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const handleStatusChange = async (
    requestId: number,
    newStatus: string
  ) => {
    if (!token) return;

    try {
      setUpdatingId(requestId);
      setListError("");

      const response = await fetch(
        `http://localhost:3000/api/staff/private-screenings/${requestId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to update request status."
        );
      }

      setRequests((prev) =>
        prev.map((item) =>
          item.request_id === requestId ? data.request : item
        )
      );
    } catch (err) {
      setListError(
        err instanceof Error
          ? err.message
          : "Failed to update request status."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadgeClasses = (status: string) => {
    switch (status) {
      case "approved":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
      case "reviewed":
        return "border-sky-500/30 bg-sky-500/10 text-sky-400";
      case "rejected":
        return "border-red-500/30 bg-red-500/10 text-red-400";
      default:
        return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
    }
  };

  return (
    <div className="min-h-screen bg-[#09090d] text-white">
      <header className="border-b border-white/10 bg-black/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link to="/" className="text-2xl font-black tracking-tighter">
            CINE<span className="text-red-500">MAX</span>
            <span className="ml-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
              Staff
            </span>
          </Link>

          <div className="flex items-center gap-5 text-sm font-semibold">
            <Link
              to="/private-screening"
              className="text-zinc-400 transition hover:text-white"
            >
              Request Form
            </Link>
            <Link
              to="/"
              className="text-zinc-400 transition hover:text-white"
            >
              ← Back to Cinema
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              Authorized Staff Portal
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              Private Screening{" "}
              <span className="text-red-500">Requests</span>
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Review and manage corporate and organization private screening
              requests.
            </p>
          </div>

          {token && staffUser && (
            <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#14141b] px-4 py-2.5 text-xs">
              <div>
                <p className="font-bold text-white">
                  {staffUser.full_name || staffUser.email}
                </p>
                <p className="uppercase tracking-wider text-red-400">
                  {staffUser.role}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 font-semibold text-zinc-300 transition hover:bg-white/[0.1] hover:text-white"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>

        {!token ? (
          <section className="mx-auto mt-10 max-w-md rounded-2xl border border-white/10 bg-[#14141b] p-6 sm:p-8">
            <h2 className="text-xl font-bold">Staff & Admin Sign In</h2>
            <p className="mt-2 text-xs leading-6 text-zinc-400">
              Sign in with your authorized CINEMAX staff or administrator
              account to view submitted private screening requests.
            </p>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-xs text-zinc-300">
              <p className="font-bold text-white">Default Staff Credentials:</p>
              <p className="mt-1">
                Email: <code className="text-red-400">staff@cinemax.com</code> ·
                Password: <code className="text-red-400">staff1234</code>
              </p>
              <p className="mt-0.5 text-zinc-400">
                (Admin: <code>admin@cinemax.com</code> / <code>admin1234</code>)
              </p>
            </div>

            {loginError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300"
              >
                {loginError}
              </div>
            )}

            <form
              onSubmit={handleLogin}
              noValidate
              className="mt-5 space-y-4"
            >
              <div>
                <label
                  htmlFor="staff-email"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                >
                  Staff Email
                </label>
                <input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@cinemax.com"
                  className="w-full rounded-xl border border-white/10 bg-[#09090d] px-4 py-3 text-sm text-white outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label
                  htmlFor="staff-password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                >
                  Password
                </label>
                <input
                  id="staff-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-[#09090d] px-4 py-3 text-sm text-white outline-none focus:border-red-500"
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full rounded-xl bg-red-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {loggingIn ? "Signing In..." : "Sign In to Staff Portal"}
              </button>
            </form>
          </section>
        ) : (
          <section className="mt-8">
            {/* Filters */}
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#14141b] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <label
                  htmlFor="request-search"
                  className="sr-only"
                >
                  Search requests
                </label>
                <input
                  id="request-search"
                  type="search"
                  placeholder="Search by organization, contact name, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#09090d] px-4 py-2.5 text-sm text-white outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-white/10 bg-[#09090d] px-4 py-2.5 text-sm text-white outline-none focus:border-red-500"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>

                <button
                  type="button"
                  onClick={fetchRequests}
                  className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.1]"
                >
                  Refresh
                </button>
              </div>
            </div>

            {listError && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
              >
                {listError}
              </div>
            )}

            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-[#14141b] p-12 text-center text-zinc-400">
                Loading submitted private screening requests...
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#14141b] p-12 text-center">
                <h2 className="text-lg font-bold">
                  No private screening requests found
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Submitted corporate screening requests will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((req) => (
                  <article
                    key={req.request_id}
                    className="rounded-2xl border border-white/10 bg-[#14141b] p-6"
                  >
                    <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs font-bold text-zinc-400">
                            Request #{req.request_id}
                          </span>
                          <span
                            className={`rounded-full border px-3 py-0.5 text-xs font-bold uppercase tracking-wider ${getStatusBadgeClasses(
                              req.status
                            )}`}
                          >
                            {req.status}
                          </span>
                        </div>
                        <h2 className="mt-2 text-xl font-black text-white">
                          {req.organization_name}
                        </h2>
                      </div>

                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`status-${req.request_id}`}
                          className="text-xs text-zinc-400"
                        >
                          Update Status:
                        </label>
                        <select
                          id={`status-${req.request_id}`}
                          value={req.status}
                          disabled={updatingId === req.request_id}
                          onChange={(e) =>
                            handleStatusChange(
                              req.request_id,
                              e.target.value
                            )
                          }
                          className="rounded-lg border border-white/10 bg-[#09090d] px-3 py-1.5 text-xs font-semibold text-white outline-none focus:border-red-500"
                        >
                          <option value="pending">Pending</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          Contact Representative
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {req.contact_name}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {req.contact_email}
                        </p>
                        {req.contact_phone && (
                          <p className="text-xs text-zinc-400">
                            {req.contact_phone}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          Preferred Date & Time
                        </p>
                        <p className="mt-1 font-semibold text-red-400">
                          {new Date(
                            req.preferred_datetime
                          ).toLocaleString()}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          Estimated Attendees
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {req.estimated_attendees} attendees
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          Submitted At
                        </p>
                        <p className="mt-1 text-zinc-300">
                          {new Date(req.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {req.additional_requirements && (
                      <div className="mt-4 rounded-xl bg-white/[0.03] p-4 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Additional Requirements
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-zinc-200">
                          {req.additional_requirements}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default StaffPrivateScreenings;
