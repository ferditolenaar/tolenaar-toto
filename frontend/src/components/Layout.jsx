import { Outlet, Link, useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';

export default function Layout() {
  const navigate = useNavigate();
  
  const handleLogout = () => {
    pb.authStore.clear();
    navigate('/login');
  };

  return (
    <div className="app-container">
      {/* The Sticky Top Row */}
      <nav className="navbar">
        <div className="nav-brand">Tolenaar Toto</div>
        <div className="nav-links">
          <Link to="/">Home</Link>
          {pb.authStore.isValid ? (
            <>
              <Link to="/predictions">Predictions</Link>
              <button onClick={handleLogout} className="logout-link">Logout</button>
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      </nav>

      {/* This is where the specific page content (Login, Register, etc.) goes */}
      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
}