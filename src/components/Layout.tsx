import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AppStoreBadge } from "./AppStoreBadge";

export function Layout() {
  const home = useLocation().pathname === "/";
  return (
    <div className={home ? "shell shell-home" : "shell"}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="nav">
          <Link to="/" className="brand">
            <img src="/logo.webp" alt="" width={458} height={327} />
            <span>HuddlePals</span>
          </Link>
          <AppStoreBadge />
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="foot">
          <p className="foot-brand">
            <strong>HuddlePals</strong>
            <span>One photo a day. Just your people.</span>
          </p>
          <nav aria-label="Footer">
            <NavLink to="/about">About</NavLink>
            <NavLink to="/privacy">Privacy</NavLink>
            <NavLink to="/terms">Terms</NavLink>
            <NavLink to="/support">Support</NavLink>
          </nav>
          <p className="copy">© 2026 HuddlePals</p>
        </div>
      </footer>
    </div>
  );
}
