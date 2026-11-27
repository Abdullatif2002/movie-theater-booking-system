import { Link } from "react-router-dom";

function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#09090d]/90 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <a href="#home" className="text-2xl font-black tracking-tighter">
          CINE<span className="text-red-500">MAX</span>
          <span className="ml-2 align-top text-[9px] font-medium tracking-[0.25em] text-zinc-500">
            CINEMAS
          </span>
        </a>

        <div className="hidden items-center gap-8 text-sm font-medium text-zinc-400 md:flex">
          <a href="#home" className="transition hover:text-white">Home</a>
          <a href="#movies" className="transition hover:text-white">Movies</a>
          <Link to="/private-screening" className="transition hover:text-white">
            Private Screenings
          </Link>
          <Link to="/staff/private-screenings" className="transition hover:text-white">
            Staff Portal
          </Link>
          <a href="#contact" className="transition hover:text-white">Contact</a>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/private-screening"
            className="hidden rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-red-500/50 hover:bg-white/[0.08] sm:inline-block md:hidden"
          >
            Private Screening
          </Link>
          <a
            href="#movies"
            className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold transition hover:bg-red-500 hover:shadow-lg hover:shadow-red-600/20"
          >
            Explore Movies
          </a>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
