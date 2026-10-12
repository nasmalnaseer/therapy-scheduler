import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { ROUTE_PERMISSIONS } from './utils/permissions';

import Sidebar from './components/Sidebar';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Timetable from './components/Timetable';
import CheckIn from './components/CheckIn';
import PrintSheets from './components/PrintSheets';
import Reports from './components/Reports';
import Export from './components/Export';
import MyLeave from './components/MyLeave';
import Scheduler from './components/Scheduler';
import EditSchedule from './components/EditSchedule';
import Plans from './components/Plans';
import AddDoctor from './components/AddDoctor';
import AddPatient from './components/AddPatient';
import Equipment from './components/Equipment';
import TimeSlotManager from './components/TimeSlotManager';
import Users from './components/Users';

// A page the person's role may not open sends them back to the dashboard
// (Firestore rules enforce the same limits on the server).
const Guard = ({ path, children }) => {
  const { can } = useAuth();
  return can(ROUTE_PERMISSIONS[path]) ? children : <Navigate to="/" replace />;
};

const PAGES = [
  ['/', Dashboard],
  ['/timetable', Timetable],
  ['/check-in', CheckIn],
  ['/print', PrintSheets],
  ['/reports', Reports],
  ['/export', Export],
  ['/my-leave', MyLeave],
  ['/schedule', Scheduler],
  ['/edit-schedule', EditSchedule],
  ['/plans', Plans],
  ['/add-doctor', AddDoctor],
  ['/add-patient', AddPatient],
  ['/equipment', Equipment],
  ['/time-config', TimeSlotManager],
  ['/users', Users]
];

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
            {PAGES.map(([path, Page]) => (
              <Route key={path} path={path} element={<Guard path={path}><Page /></Guard>} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

function Message({ title, children }) {
  const { logout } = useAuth();
  return (
    <div className="center-screen">
      <div className="card login-card">
        <h3>{title}</h3>
        {children}
        <button onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}

function Gate() {
  const { user, role, inactive, doctorId, loading, roleError } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Login />;
  if (inactive) {
    return (
      <Message title="Account deactivated">
        <p>This account has been switched off. Please contact the administrator.</p>
      </Message>
    );
  }
  if (!role) {
    return (
      <Message title="No access yet">
        <p>
          You are signed in as <strong>{user.email}</strong>, but this account has not been given a role.
          Please ask the administrator to set it up.
        </p>
        {roleError && <p className="muted">{roleError}</p>}
      </Message>
    );
  }
  if (role === 'doctor' && !doctorId) {
    return (
      <Message title="Not linked to a doctor yet">
        <p>This doctor login is not linked to a doctor record. Please ask the administrator to link it.</p>
      </Message>
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
