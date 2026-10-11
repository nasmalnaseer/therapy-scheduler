import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, role, isAdmin, logout } = useAuth();

  const closeMenu = () => setIsOpen(false);
  const toggleMenu = () => setIsOpen(!isOpen);

  const link = (to, label, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
      onClick={closeMenu}
    >
      {label}
    </NavLink>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="mobile-header">
        <h2>🩺 Hospital Therapy Scheduler</h2>
        <button className="hamburger" onClick={toggleMenu} aria-label="Menu">☰</button>
      </div>

      {isOpen && <div className="overlay" onClick={closeMenu}></div>}

      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="desktop-title">🩺 Hospital Therapy Scheduler</h2>
          <button className="close-btn" onClick={closeMenu}>✖</button>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">Daily</div>
          {link('/', '🏠 Dashboard', true)}
          {link('/timetable', '🗓️ Timetable')}
          {link('/print', '🖨️ Print & Share')}
          {link('/reports', '📈 Reports')}
          {link('/export', '📄 Export')}

          {isAdmin && (
            <>
              <div className="sidebar-section">Scheduling</div>
              {link('/schedule', '⚙️ Scheduler')}
              {link('/edit-schedule', '✏️ Edit Sessions')}
              {link('/plans', '🔁 Recurring Plans')}

              <div className="sidebar-section">Setup</div>
              {link('/add-doctor', '🧑‍⚕️ Doctors & Leave')}
              {link('/add-patient', '🧑‍🦽 Patients')}
              {link('/equipment', '🦾 Equipment')}
              {link('/time-config', '🕒 Time Config')}
            </>
          )}
        </nav>

        <div className="sidebar-user">
          <div className="who">{user?.email}</div>
          <div className="role">{role}</div>
          <button onClick={logout}>Sign out</button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
