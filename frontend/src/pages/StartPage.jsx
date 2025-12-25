import { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import { Link } from 'react-router-dom';
import '../Features.css';

export default function StartPage() {
  // 1. Create a state to hold the user
  const [user, setUser] = useState(pb.authStore.model);

  useEffect(() => {
    // 2. Subscribe to auth changes so the UI stays in sync
    const unsubscribe = pb.authStore.onChange((token, model) => {
      setUser(model);
    });

    return () => unsubscribe(); // Cleanup on unmount
  }, []);

  return (
    <div className="container-centered page-container">
      {/* Consistent Page Header */}
      <header className="page-header">
        <h1>Welcome, {user?.username || 'Guest'}</h1>
      </header>

      {/* Content Area using the full 1280px width */}
      <div className="feature-grid">
        <div className="feature-card">
          <h3>Upcoming Matches</h3>
          <p>View and predict the latest fixtures.</p>
          <Link to="/predictions" className="nav-links">
            <button style={{color: 'var(--primary)', marginTop: '1rem', fontWeight: 'bold'}}>
              Go to Predictions →
            </button>
          </Link>
        </div>

        <div className="feature-card">
          <h3>Leaderboard</h3>
          <p>See how you rank against the other legends.</p>
        </div>

        {user?.role === 'admin' && (
          <div className="feature-card" style={{borderLeft: '4px solid gold'}}>
            <h3>Admin Tools</h3>
            <p>Manage users and match results.</p>
          </div>
        )}
      </div>
    </div>
  );
}