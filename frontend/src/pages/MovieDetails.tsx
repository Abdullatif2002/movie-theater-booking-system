
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Movie } from "../App";

interface Showtime {
  showtime_id: number;
  screening_time: string;
  status: string;
  cinema_name: string;
  room_name: string;
}

function MovieDetails() {
  const { movieId } = useParams<{ movieId: string }>();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [showtimes, setShowtimes] = useState<Showtime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadMovieDetails = async () => {
      if (!movieId || !/^\d+$/.test(movieId)) {
        setError("Invalid movie ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const [moviesResponse, showtimesResponse] = await Promise.all([
          fetch("http://localhost:3000/api/movies"),
          fetch(
            `http://localhost:3000/api/movies/${movieId}/showtimes`
          ),
        ]);

        if (!moviesResponse.ok || !showtimesResponse.ok) {
          throw new Error("Unable to load movie information.");
        }

        const movies: Movie[] = await moviesResponse.json();
        const showtimeData = await showtimesResponse.json();

        const selectedMovie = movies.find(
          (item) => item.movie_id === Number(movieId)
        );

        if (!selectedMovie) {
          throw new Error("Movie not found.");
        }

        setMovie(selectedMovie);

        setShowtimes(
          Array.isArray(showtimeData)
            ? showtimeData
            : showtimeData.showtimes ?? []
        );
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

    loadMovieDetails();
  }, [movieId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d] text-white">
        <p className="animate-pulse text-lg text-zinc-400">
          Loading movie details...
        </p>
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090d] px-5 text-center text-white">
        <h1 className="text-3xl font-black">
          Movie unavailable
        </h1>

        <p className="mt-3 text-zinc-400">
          {error || "We could not find this movie."}
        </p>

        <Link
          to="/"
          className="mt-6 rounded-lg bg-red-600 px-6 py-3 font-semibold transition hover:bg-red-500"
        >
          Back to Home
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
            to="/"
            className="text-sm font-semibold text-zinc-400 transition hover:text-white"
          >
            ← Back to Movies
          </Link>

        </div>
      </header>

      {/* Movie Details */}
      <main className="mx-auto max-w-7xl px-5 py-12">

        <section className="grid gap-10 md:grid-cols-[300px_1fr] lg:gap-16">

          {/* Poster */}
          <div className="h-fit overflow-hidden rounded-2xl border border-white/10 bg-[#14141b]">

            {movie.poster_image ? (
              <img
                src={movie.poster_image}
                alt={`${movie.title} poster`}
                className="block w-full rounded-2xl object-contain"
              />
            ) : (
              <div className="flex aspect-[2/3] items-center justify-center p-6 text-center text-3xl font-black">
                {movie.title}
              </div>
            )}

          </div>

          {/* Information */}
          <div className="flex flex-col justify-center">

            <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              CINEMAX · Now Showing
            </p>

            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
              {movie.title}
            </h1>

            <p className="mt-5 text-sm text-zinc-400">
              Runtime: {movie.duration} minutes
            </p>

            {/* Description */}
            <div className="mt-8">
              <h2 className="text-xl font-bold">
                About the Movie
              </h2>

              <p className="mt-3 max-w-2xl leading-8 text-zinc-400">
                {movie.description}
              </p>
            </div>

            {/* Showtimes */}
            <div className="mt-10">

              <h2 className="text-2xl font-bold">
                Select a{" "}
                <span className="text-red-500">
                  Showtime
                </span>
              </h2>

              {showtimes.length === 0 ? (
                <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-zinc-400">
                  No showtimes are currently available for this movie.
                </p>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">

                  {showtimes.map((showtime) => (
                    <div
                      key={showtime.showtime_id}
                      className="rounded-xl border border-white/10 bg-[#14141b] p-5 transition hover:border-red-500/50"
                    >

                      <p className="font-bold text-white">
                        {showtime.cinema_name || "CINEMAX"}
                      </p>

                      <p className="mt-1 text-sm text-zinc-400">
                        {showtime.room_name || "Screen"}
                      </p>

                      <p className="mt-4 text-lg font-bold text-red-400">
                        {new Date(
                          showtime.screening_time
                        ).toLocaleString()}
                      </p>

                      <Link
                        to={`/showtimes/${showtime.showtime_id}/seats`}
                        className="mt-4 block w-full rounded-lg bg-red-600 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-red-500"
                      >
                        Select Seats →
                      </Link>

                    </div>
                  ))}

                </div>
              )}

            </div>

          </div>

        </section>

      </main>

    </div>
  );
}

export default MovieDetails;
