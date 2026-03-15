import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import LiveOperations from './pages/LiveOperations';
import DriversPage from './pages/DriversPage';
import BusesPage from './pages/BusesPage';
import RoutesPage from './pages/RoutesPage';
import AssignmentsPage from './pages/AssignmentsPage';
import AlertsPage from './pages/AlertsPage';

import { FleetProvider } from './context/FleetContext';

export default function App() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <FleetProvider>
      <Router>
        <div className="app-container">
          
          <TopBar onMenuClick={() => setMobileSidebarOpen(true)} />
          
          <div className="main-layout">
            
            <Sidebar 
              mobileOpen={mobileSidebarOpen} 
              onClose={() => setMobileSidebarOpen(false)} 
            />
            
            {mobileSidebarOpen && (
              <div className="sidebar-overlay" onClick={() => setMobileSidebarOpen(false)} />
            )}

            <Routes>
              {/* Core Operations */}
              <Route path="/" element={<LiveOperations />} />
              <Route path="/alerts" element={<AlertsPage />} />

              {/* Management Only */}
              <Route path="/drivers" element={<DriversPage />} />
              <Route path="/buses" element={<BusesPage />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/assignments" element={<AssignmentsPage />} />
            </Routes>

          </div>
        </div>
      </Router>
    </FleetProvider>
  );
}
