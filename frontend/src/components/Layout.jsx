import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'; // Added NavLink
import pb from '../lib/pocketbase';
import '../Features.css';
import trophyLogo from '../assets/logo.png';

export default function Layout() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const user = pb.authStore.model;
  const isLoggedIn = !!user;

  useEffect(() => {
    setIsMenuOpen(false);
    setIsOpen(false);
  }, [location]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    } else {
      document.body.style.overflow = 'unset';
      document.body.style.height = 'auto';
    }

    // Clean up on unmount
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.height = 'auto';
    };
  }, [isMenuOpen]);

  const handleLogout = () => {
    pb.authStore.clear();
    setIsMenuOpen(false);
    navigate('/login');
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        {/* container-centered keeps things from hitting the screen edges on desktop */}
        <div className="container-centered nav-inner">

          <div className="nav-brand">
            <Link to="/" className="brand-link">
              {/* The Trophy Logo */}
              <img
                src={trophyLogo}
                alt="FIFA Trophy"
                className="brand-logo"
              />

              {/* The Text Group */}
              <div className="brand-text">
                <span className="brand-name">DeRoTo</span>
                <span className="brand-subtitle">WORLD CUP 2026</span>
              </div>
            </Link>
          </div>

          {/* This block handles BOTH Desktop horizontal links and Mobile vertical menu */}
          <div className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>Home</NavLink>

            {isLoggedIn && (
              <>
                <NavLink to="/voorspellen" className={({ isActive }) => isActive ? 'nav-item active voorspel' : 'nav-item voorspel'}><span class="voorspel">Voorspellen</span>Wedstrijden</NavLink>
                <NavLink to="/top4" className={({ isActive }) => isActive ? 'nav-item active voorspel' : 'nav-item voorspel'}><span class="voorspel">Voorspellen</span>Top 4</NavLink>
              </>
            )}

            {user?.role === 'admin' && (
              <NavLink to="/stand" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>Stand</NavLink>
            )}

            {user?.role === 'admin' && (
              <NavLink to="/uitslagen" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>Uitslagen</NavLink>
            )}

            {user?.role === 'admin' && (
              <NavLink to="/overzicht" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>Overzicht</NavLink>
            )}

            {user?.role === 'admin' && (
              <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>Admin</NavLink>
            )}

            {isLoggedIn ? (
              <div className="profile-container" ref={dropdownRef}>
                <div className="profile-bubble" onClick={() => setIsOpen(!isOpen)}>
                  {user.firstName && user.lastName
                    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
                    : 'U'}
                </div>
                {isOpen && (
                  <div className="profile-dropdown">
                    <div className="dropdown-header">
                      <strong>{user.firstName} {user.lastName}</strong>
                      <span>{user.email}</span>
                    </div>
                    <hr />
                    <button onClick={handleLogout} className="logout-item">Uitloggen</button>
                  </div>
                )}
              </div>
            ) : (
              <NavLink to="/login" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>Login</NavLink>
            )}
          </div>

          {/* The hamburger button */}
          <button className="mobile-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <span className={`bar ${isMenuOpen ? 'open' : ''}`}></span>
            <span className={`bar ${isMenuOpen ? 'open' : ''}`}></span>
            <span className={`bar ${isMenuOpen ? 'open' : ''}`}></span>
          </button>

        </div> {/* nav-inner CLOSES HERE to contain the links */}
      </nav>

      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
}