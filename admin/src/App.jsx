import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import FleetManagement from './pages/FleetManagement';
import RouteManager from './pages/RouteManager';
import TripManager from './pages/TripManager';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/fleet" replace />} />
            <Route path="fleet" element={<FleetManagement />} />
            <Route path="routes" element={<RouteManager />} />
            <Route path="trips" element={<TripManager />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
