
import { useEffect, useMemo, useState } from "react";
import "./App.css";

import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import MovieCard from "./components/MovieCard";

export interface Movie {
  movie_id: number;
  title: string;
  description: string;
  duration: number;
  poster_image: string | null;
}

function App() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [backendConnected, setBackendConnected] = useState(false);

  useEffect(() => {
    const loadMovies = async () => {
      try {
        setLoading(true);
        setError("");

        const [healthResponse, moviesResponse] = await Promise.all([
          fetch("http://localhost:3000/api/health"),
          fetch("http://localhost:3000/api/movies"),
        ]);

        if (!healthResponse.ok || !moviesResponse.ok) {
          throw new Error("Unable to connect to the movie service.");
        }

        const movieData: Movie[] = await moviesResponse.json();

        setMovies(movieData);
        setBackendConnected(true);
      } catch (err) {
        console.error("API error:", err);
        setBackendConnected(false);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load movies."
        );
      } finally {
        setLoading(false);
      }
    };

    loadMovies();
  }, []);

  const filteredMovies = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return movies;

    return movies.filter(
      (movie) =>
        movie.title.toLowerCase().includes(query) ||
        movie.description.toLowerCase().includes(query)
    );
  }, [movies, searchTerm]);

  return (
    <div className="min-h-screen bg-[#09090d] text-white">
      <Navbar />
      <Hero />

      <main
        id="movies"
        className="w-full px-5 py-12 sm:px-6 lg:px-8 xl:px-10"
      >
        {/* Movies heading and search */}
        <div className="mb-8 rounded-2xl border border-white/[0.07] bg-[#111116] p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">

            {/* Heading */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-red-500">
                Find your next experience
              </p>

              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                Now <span className="text-red-500">Showing</span>
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                Discover movies currently available at CINEMAX.
              </p>
            </div>

            {/* Search */}
            <div className="w-full lg:max-w-[380px]">
              <label
                htmlFor="movie-search"
                className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500"
              >
                Find a movie
              </label>

              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#09090d] px-4 py-3.5 transition focus-within:border-red-500/70">
                <svg
                  className="h-5 w-5 shrink-0 text-zinc-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>

                <input
                  id="movie-search"
                  type="search"
                  placeholder="Search by movie title..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                />

                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="shrink-0 text-xs font-semibold text-zinc-400 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Movie count and service status */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
            <p className="text-sm text-zinc-400">
              {loading
                ? "Loading movies..."
                : `${filteredMovies.length} ${
                    filteredMovies.length === 1 ? "movie" : "movies"
                  } available`}
            </p>

            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  backendConnected ? "bg-emerald-500" : "bg-red-500"
                }`}
              />

              <span className="text-xs font-medium text-zinc-400">
                {backendConnected ? "Service online" : "Service unavailable"}
              </span>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-[430px] animate-pulse rounded-2xl bg-white/[0.05]"
              />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-12 text-center">
            <h3 className="text-lg font-bold">Unable to load movies</h3>
            <p className="mt-2 text-sm text-zinc-400">{error}</p>
          </div>
        )}

        {/* Movie cards */}
        {!loading && !error && filteredMovies.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMovies.map((movie) => (
              <MovieCard key={movie.movie_id} movie={movie} />
            ))}
          </div>
        )}

        {/* Empty search */}
        {!loading && !error && filteredMovies.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center">
            <h3 className="text-xl font-bold">No movies found</h3>

            <p className="mt-2 text-sm text-zinc-400">
              Try searching with another movie title.
            </p>

            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="mt-5 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-red-500"
            >
              Clear search
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        id="contact"
        className="border-t border-white/10 bg-black/40"
      >
        <div className="flex w-full flex-col gap-3 px-5 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 xl:px-10">
          <p>
            <span className="font-black text-white">
              CINE<span className="text-red-500">MAX</span>
            </span>
            {" "}· Your cinema experience.
          </p>

          <p>Movie Theater Booking System</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
