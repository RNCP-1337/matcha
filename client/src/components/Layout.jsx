import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';

function Badge({ value }) {
  if (!value) return null;
  return <span className="count-pill">{value > 99 ? '99+' : value}</span>;
}

function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          <span>
            {toast.href ? <Link to={toast.href}>{toast.text}</Link> : toast.text}
          </span>
          <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

function Masthead() {
  const { user, counts, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="masthead">
      <div className="masthead__inner">
        <Link className="masthead__brand" to={user ? '/browse' : '/'}>
          Mat<span>cha</span>
        </Link>

        <button
          type="button"
          className="masthead__toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          Menu
        </button>

        <nav className={`masthead__nav${open ? ' is-open' : ''}`} aria-label="Main">
          {user ? (
            <>
              <NavLink className="masthead__link" to="/browse">
                Suggestions
              </NavLink>
              <NavLink className="masthead__link" to="/search">
                Search
              </NavLink>
              <NavLink className="masthead__link" to="/map">
                Map
              </NavLink>
              <NavLink className="masthead__link" to="/activity">
                Activity
              </NavLink>
              <NavLink className="masthead__link" to="/meetups">
                Meetups
              </NavLink>
              <NavLink className="masthead__link" to="/chat">
                Messages
                <Badge value={counts.messages} />
              </NavLink>
              <NavLink className="masthead__link" to="/notifications">
                Notifications
                <Badge value={counts.notifications} />
              </NavLink>
              <NavLink className="masthead__link" to="/settings">
                {user.username}
              </NavLink>
              <button type="button" className="masthead__link" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink className="masthead__link" to="/login">
                Sign in
              </NavLink>
              <NavLink className="masthead__link" to="/register">
                Create an account
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Colophon() {
  return (
    <footer className="colophon">
      <div className="colophon__inner">
        <span>Matcha &mdash; a school project about meeting people, not collecting them.</span>
        <span>
          <Link to="/about">How matching works</Link>
        </span>
      </div>
    </footer>
  );
}

export default function Layout({ children }) {
  return (
    <div className="app">
      <Masthead />
      <main className="page">{children}</main>
      <Colophon />
      <Toasts />
    </div>
  );
}
