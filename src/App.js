import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';

import Sidebar from './components/Sidebar';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Timetable from './components/Timetable';
import PrintSheets from './components/PrintSheets';
import Reports from './components/Reports';
import Export from './components/Export';
import Scheduler from './components/Scheduler';
import EditSchedule from './components/EditSchedule';
import Plans from './components/Plans';
import AddDoctor from './components/AddDoctor';
import AddPatient from './components/AddPatient';
import Equipment from './components/Equipment';
import TimeSlotManager from './components/TimeSlotManager';

// Pages that change data are for admins only (Firestore rules enforce this too)
const AdminOnly = ({ children }) => {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
};

function Shell() {
  const { loading, error } = useData();
  if (loading && !error) return <div className="center-screen">Loading…</div>;
  return (
    <Router>
      <div className="app-layout">
        <Sidebar />
        <div className="main-content">
          {error && <div className="notice bad">Some data could not be loaded: {error}</div>}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/print" element={<PrintSheets />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/export" element={<Export />} />
            <Route path="/schedule" element={<AdminOnly><Scheduler /></AdminOnly>} />
            <Route path="/edit-schedule" element={<AdminOnly><EditSchedule /></AdminOnly>} />
            <Route path="/plans" element={<AdminOnly><Plans /></AdminOnly>} />
            <Route path="/add-doctor" element={<AdminOnly><AddDoctor /></AdminOnly>} />
            <Route path="/add-patient" element={<AdminOnly><AddPatient /></AdminOnly>} />
            <Route path="/equipment" element={<AdminOnly><Equipment /></AdminOnly>} />
            <Route path="/time-config" element={<AdminOnly><TimeSlotManager /></AdminOnly>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

function Gate() {
  const { user, role, loading, roleError, logout } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Login />;
  if (role !== 'admin' && role !== 'viewer') {
    return (
      <div className="center-screen">
        <div className="card login-card">
          <h3>No access yet</h3>
          <p>
            You are signed in as <strong>{user.email}</strong>, but this account has not been given a role.
            Please ask the administrator to approve it.
          </p>
          {roleError && <p className="muted">{roleError}</p>}
          <button onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
