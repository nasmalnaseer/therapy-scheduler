import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header'; // optional
import './App.css';


import Home from './components/Home';
import AddDoctor from './components/AddDoctor';
import AddPatient from './components/AddPatient';
import Scheduler from './components/Scheduler';
import EditSchedule from './components/EditSchedule';
import Export from './components/Export';
import TimeSlotManager from './components/TimeSlotManager';

function App() {
  return (
    <Router>
      <div className="app-layout">
        <Sidebar />
        <div className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/add-doctor" element={<AddDoctor />} />
            <Route path="/add-patient" element={<AddPatient />} />
            <Route path="/schedule" element={<Scheduler />} />
            <Route path="/edit-schedule" element={<EditSchedule />} />
            <Route path="/export" element={<Export />} />
            <Route path="/time-config" element={<TimeSlotManager />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
