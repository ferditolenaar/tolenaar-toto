import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';
import '../Features.css';

export default function Layout() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Get user info from PocketBase
  const user = pb.authStore.model;
  const isLoggedIn = !!user;

  // Close dropdown if user clicks outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    pb.authStore.clear(); //
    setIsOpen(false);
    navigate('/login');
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="container-centered nav-inner">
          <div className="nav-brand">
            <Link to="/">DeRoTo</Link>
          </div>
          <div className="nav-links">
            <Link to="/">Home</Link>

            <Link to="/voorspellen">Voorspellen</Link>
            <Link to="/top4">Top 4</Link>
            <Link to="/uitslagen">Uitslagen</Link>
            <Link to="/stand">Stand</Link>
            {user?.role === 'admin' && <Link to="/admin">Admin</Link>}

            {isLoggedIn ? (
                    <div className="profile-container" ref={dropdownRef}>
                        <div 
                            className="profile-bubble" 
                            onClick={() => setIsOpen(!isOpen)}
                        >
                            {/* Display initials or a default user icon */}
                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                        </div>

                        {isOpen && (
                            <div className="profile-dropdown">
                                <div className="dropdown-header">
                                    <strong>{user.name || 'Gebruiker'}</strong>
                                    <span>{user.email}</span>
                                </div>
                                <hr />
                                <button onClick={handleLogout} className="logout-item">
                                    Uitloggen
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <Link to="/login" className="login-link">Login</Link>
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