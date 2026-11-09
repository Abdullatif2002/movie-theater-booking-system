
function Hero() {
  return (
    <section
      id="home"
      className="relative isolate flex min-h-[480px] w-full items-center overflow-hidden border-b border-white/[0.07] bg-[#09090d] sm:min-h-[520px]"
    >
      {/* Background image */}
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=2000')",
        }}
      />

      {/* Dark overlays */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#09090d] via-[#09090d]/90 to-[#09090d]/35" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#09090d]/80 via-transparent to-[#09090d]/20" />

      {/* Main content */}
      <div className="w-full px-5 py-14 sm:px-6 sm:py-16 lg:px-8 xl:px-10">
        <div className="max-w-[1100px]">

          {/* Welcome label */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/[0.08] px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />

            <span className="text-xs font-bold tracking-[0.2em] text-red-400">
              WELCOME TO CINEMAX
            </span>
          </div>

          {/* Main heading */}
          <h1 className="text-5xl font-black leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl">
            Discover Your Next
            <span className="mt-2 block text-red-500">
              Favourite Movie.
            </span>
          </h1>

          {/* Description */}
          <p className="mt-6 max-w-[700px] text-base leading-8 text-zinc-300 sm:text-lg">
            Experience the magic of cinema. Explore exciting movies,
            discover upcoming screenings and find your next favourite
            story on the big screen.
          </p>

          {/* Buttons */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#movies"
              className="inline-flex items-center gap-3 rounded-xl bg-red-600 px-7 py-4 text-sm font-bold text-white shadow-lg shadow-red-950/30 transition hover:-translate-y-0.5 hover:bg-red-500"
            >
              Browse Movies
              <span aria-hidden="true">→</span>
            </a>

            <a
              href="#contact"
              className="rounded-xl border border-white/20 bg-white/[0.04] px-7 py-4 text-sm font-semibold text-white transition hover:border-red-500/50 hover:bg-white/[0.08]"
            >
              About CINEMAX
            </a>
          </div>

          {/* Highlights */}
          <div className="mt-10 flex flex-wrap gap-x-12 gap-y-5 border-t border-white/10 pt-6">
            <div>
              <p className="text-xl font-bold text-white">Big</p>
              <p className="mt-1 text-xs text-zinc-400">
                Screen experience
              </p>
            </div>

            <div>
              <p className="text-xl font-bold text-white">Your</p>
              <p className="mt-1 text-xs text-zinc-400">
                Next movie awaits
              </p>
            </div>

            <div>
              <p className="text-xl font-bold text-white">Cinema</p>
              <p className="mt-1 text-xs text-zinc-400">
                Made memorable
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

export default Hero;
