
import { useState } from "react";
import type { Movie } from "../App";

interface MovieCardProps {
  movie: Movie;
}

function MovieCard({ movie }: MovieCardProps) {
  const [imageError, setImageError] = useState(false);

  const hasPoster = Boolean(movie.poster_image) && !imageError;

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14141b] transition duration-300 hover:-translate-y-1 hover:border-red-500/40 hover:shadow-2xl hover:shadow-red-950/30">

      {/* Poster */}
      <div className="relative h-[280px] overflow-hidden bg-black sm:h-[300px]">
        {hasPoster ? (
          <>
            <img
              src={movie.poster_image!}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
            />

            <img
              src={movie.poster_image!}
              alt={`${movie.title} poster`}
              loading="lazy"
              onError={() => setImageError(true)}
              className="relative z-10 h-full w-full object-contain transition duration-500 group-hover:scale-[1.03]"
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-black p-6 text-center">
            <span className="mb-4 text-5xl text-red-500">✦</span>

            <h3 className="text-2xl font-black text-white">
              {movie.title}
            </h3>

            <p className="mt-3 text-xs uppercase tracking-[0.25em] text-zinc-500">
              CINEMAX
            </p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Badge */}
        <span className="absolute left-4 top-4 z-30 rounded-md bg-red-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white">
          Now Showing
        </span>

        {/* Duration */}
        <span className="absolute bottom-4 right-4 z-30 rounded-lg border border-white/10 bg-black/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
          {movie.duration} min
        </span>
      </div>

      {/* Movie information */}
      <div className="p-5">
        <h3 className="line-clamp-1 text-lg font-bold text-white transition group-hover:text-red-400">
          {movie.title}
        </h3>

        <p className="mt-2 line-clamp-2 min-h-[48px] text-sm leading-6 text-zinc-400">
          {movie.description}
        </p>
      </div>
    </article>
  );
}

export default MovieCard;
