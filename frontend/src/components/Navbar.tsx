
function Navbar() {
  return (
    <nav className="navbar">
      <div className="nav-container">
        <a href="/" className="logo">
          CINE<span>MAX</span>
        </a>

        <div className="nav-links">
          <a href="#home">Home</a>
          <a href="#movies">Movies</a>
          <a href="#contact">Contact</a>
        </div>

        <button className="login-button">
          Login
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
