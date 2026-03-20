import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import pb from '../lib/pocketbase';
import '../Features.css';

export default function Layout() {
  const [isOpen, setIsOpen] = useState(false); // Profile dropdown
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Hamburger menu
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const user = pb.authStore.model;
  const isLoggedIn = !!user;

  // Close both menus when the URL changes (user clicks a link)
  useEffect(() => {
    setIsMenuOpen(false);
    setIsOpen(false);
  }, [location]);

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
    pb.authStore.clear();
    setIsOpen(false);
    setIsMenuOpen(false);
    navigate('/login');
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="container-centered nav-inner">
          <div className="nav-brand">
            <Link to="/">DeRoTo</Link>
          </div>

          {/* HAMBURGER TOGGLE BUTTON */}
          <button 
            className="mobile-toggle" 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <span className={`bar ${isMenuOpen ? 'open' : ''}`}></span>
            <span className={`bar ${isMenuOpen ? 'open' : ''}`}></span>
            <span className={`bar ${isMenuOpen ? 'open' : ''}`}></span>
          </button>

          <div className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
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
                  {user.firstName ? `${user.firstName.charAt(0).toUpperCase()}${user.lastName.charAt(0).toUpperCase()}` : 'X'}
                </div>

                {isOpen && (
                  <div className="profile-dropdown">
                    <div className="dropdown-header">
                      <strong>{`${user.firstName} ${user.lastName}` || 'Gebruiker'}</strong>
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
        <Outlet />
      </main>
    </div>
  );
}