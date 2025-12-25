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
      {/* 1. Full-width Black Bar */}
      <nav className="navbar">
        {/* 2. Centered Spine for Nav Contents */}
        <div className="container-centered">
          <div className="nav-brand">Tolenaar Toto</div>
          <div className="nav-links">
            <Link to="/">Home</Link>
            {pb.authStore.isValid ? (
              <button onClick={handleLogout} className="logout-btn">Logout</button>
            ) : (
              <Link to="/login">Login</Link>
            )}
          </div>
        </div>
      </nav>

      {/* 3. Full-width Background for Content */}
      <main className="content-area">
        {/* 4. The magic wrapper that centers the Login/Register card */}
        <div className="centered-hero">
          <Outlet />
        </div>
      </main>
    </div>
  );
}