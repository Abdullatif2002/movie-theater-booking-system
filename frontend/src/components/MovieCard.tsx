
import type { movie } from "../data/movie";

interface MovieCardProps {
  movie: movie;
}

function MovieCard({ movie }: MovieCardProps) {
  return (
    <div className="movie-card">
      <div className="movie-poster">
        <img src={movie.poster} alt={movie.title} />

        <span className="movie-duration">
          {movie.duration} min
        </span>
      </div>

      <div className="movie-info">
        <h3>{movie.title}</h3>

        <p>{movie.description}</p>

        <button className="details-button">
          View Details
        </button>
      </div>
    </div>
  );
}

export default MovieCard;