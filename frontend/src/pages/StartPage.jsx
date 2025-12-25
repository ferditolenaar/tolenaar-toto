import { Link, useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';

export default function StartPage() {
  const navigate = useNavigate();
  const user = pb.authStore.model; // Gets the logged-in user's data

  const handleLogout = () => {
    pb.authStore.clear(); // Wipes the token from local storage
    navigate('/login');
  };

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Welcome to Tolenaar Toto</h1>
      
      {pb.authStore.isValid ? (
        // What logged-in users see
        <div className="dashboard-hero">
          <p>G'day, <strong>{user?.username || user?.email}</strong>!</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <Link to="/predictions">
              <button>Make Predictions</button>
            </Link>
            <button onClick={handleLogout} style={{ background: '#ff4444' }}>
              Logout
            </button>
          </div>
        </div>
      ) : (
        // What guests see
        <div className="guest-hero">
          <p>Please log in to start your footy tipping.</p>
          <Link to="/login">
            <button>Login</button>
          </Link>
          <p>
            Don't have an account? <Link to="/register">Register here</Link>
          </p>
        </div>
      )}
    </div>
  );
}