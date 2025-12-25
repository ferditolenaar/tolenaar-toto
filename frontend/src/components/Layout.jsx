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
      <nav className="navbar">
        {/* The "Inner" container keeps navigation at 1280px */}
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

      <main className="content-area">
        {/* We don't use container-centered here because we want the 
            login card to be dead-center of the WHOLE screen */}
        <Outlet />
      </main>
    </div>
  );
}