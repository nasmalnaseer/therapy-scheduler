// src/components/Sidebar.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => setIsOpen(false);
  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <>
      {/* Mobile Header */}
      <div className="mobile-header">
        <h2>🩺 Thanal</h2>
        <button className="hamburger" onClick={toggleMenu}>
          ☰
        </button>
      </div>

      {/* Overlay */}
      {isOpen && <div className="overlay" onClick={closeMenu}></div>}

      {/* Sidebar */}
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="desktop-title">🩺 Thanal</h2>
          <button className="close-btn" onClick={closeMenu}>✖</button>
        </div>
        <nav className="sidebar-nav">
          <Link to="/" className="sidebar-link" onClick={closeMenu}>🏠 Dashboard</Link>
          <Link to="/add-doctor" className="sidebar-link" onClick={closeMenu}>🧑‍⚕️ Add Doctor</Link>
          <Link to="/add-patient" className="sidebar-link" onClick={closeMenu}>🧑‍🦽 Add Patient</Link>
          <Link to="/schedule" className="sidebar-link" onClick={closeMenu}>🗓️ Scheduler</Link>
          <Link to="/edit-schedule" className="sidebar-link" onClick={closeMenu}>✏️ Edit Schedule</Link>
          <Link to="/export" className="sidebar-link" onClick={closeMenu}>📄 Export</Link>
          <Link to="/time-config" className="sidebar-link" onClick={closeMenu}>🕒 Time Config</Link>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
