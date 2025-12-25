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
        <div className="container-centered nav-inner">
          <div className="nav-brand">Tolenaar Toto</div>
          <div className="nav-links">
            <Link to="/">Home</Link>
            {pb.authStore.isValid ? (
              <button onClick={handleLogout} className="btn-link">Logout</button>
            ) : (
              <Link to="/login">Login</Link>
            )}
          </div>
        </div>
      </nav>

      <main className="content-area">
        {/* Pages will render here. Auth pages will use a wrapper to center themselves. */}
        <Outlet />
      </main>
    </div>
  );
}