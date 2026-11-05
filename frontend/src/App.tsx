
import { useEffect, useState } from "react";
import "./App.css";

import MovieCard from "./components/MovieCard";
import { movies } from "./data/movie";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";

function App() {
  const [message, setMessage] = useState("Connecting to backend...");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetch("http://localhost:3000/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Backend request failed");
        }
        return response.json();
      })
      .then((data) => {
        setMessage(data.message);
        setError("");
      })
      .catch(() => {
        setError("Could not connect to backend.");
        setMessage("");
      });
  }, []);

  // Filter movies based on search input
  const filteredMovies = movies.filter((movie) =>
    movie.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Navbar />
      <Hero />

      <section className="movies-section" id="movies">
        <div className="movies-header">
          <h2>Now Showing</h2>

          <input
            type="text"
            className="search-input"
            placeholder="Search movies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="movie-grid">
          {filteredMovies.length > 0 ? (
            filteredMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))
          ) : (
            <p className="no-movies">No movies found.</p>
          )}
        </div>
      </section>

      <div className="backend-status">
        <h3>Backend Connection Status</h3>

        {error ? (
          <p className="error-message">{error}</p>
        ) : (
          <p>{message}</p>
        )}
      </div>
    </>
  );
}

export default App;
