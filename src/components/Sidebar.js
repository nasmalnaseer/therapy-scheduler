import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { NAV, ROLE_LABELS } from '../utils/permissions';
import './Sidebar.css';

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, profile, role, can, logout } = useAuth();

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
          {NAV.map(([section, items]) => {
            const visible = items.filter(([, , perm]) => can(perm));
            if (visible.length === 0) return null;
            return (
              <React.Fragment key={section}>
                <div className="sidebar-section">{section}</div>
                {visible.map(([path, label]) => (
                  <React.Fragment key={path}>{link(path, label, path === '/')}</React.Fragment>
                ))}
              </React.Fragment>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <div className="who">{profile?.name || user?.email}</div>
          {profile?.name && <div className="who muted-white">{user?.email}</div>}
          <div className="role">{ROLE_LABELS[role] || role}</div>
          <button onClick={logout}>Sign out</button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
