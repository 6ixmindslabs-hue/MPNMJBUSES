import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const FleetContext = createContext();

const HOST = import.meta.env.VITE_BACKEND_URL || 'https://mpnmjbuses.vercel.app';

export function FleetProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [fleets, setFleets] = useState({});
  const [summary, setSummary] = useState({ active: 0, delayed: 0, offRoute: 0, offline: 0 });
  const [health, setHealth] = useState({ broadcastHz: 0 });
  const [alerts, setAlerts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  // Use a ref to store fleets to avoid closure issues in socket handlers if needed,
  // but standard useState is fine for React's reconciliation.
  const fleetsRef = useRef({});

  useEffect(() => {
    const newSocket = io(HOST, {
      transports: ['websocket'],
      reconnectionAttempts: 10,
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('[FleetContext] Connected to Backend');
      setIsConnected(true);
      newSocket.emit('admin:subscribe', { orgId: 'default' });
    });

    newSocket.on('disconnect', () => {
      console.warn('[FleetContext] Disconnected');
      setIsConnected(false);
    });

    // 1. Full fleet state stream
    newSocket.on('fleet:state', (state) => {
      setFleets(prev => {
        const next = { ...prev, [state.busId]: state };
        fleetsRef.current = next;
        return next;
      });
    });

    // 2. Summary stats for TopBar
    newSocket.on('fleet:summary', (data) => {
      setSummary(data);
    });

    // 3. System health metrics
    newSocket.on('health:metrics', (data) => {
      setHealth(data);
    });

    // 4. Alerts snapshot and real-time alerts
    newSocket.on('alerts:snapshot', (data) => {
      setAlerts(data);
    });

    newSocket.on('alert:raised', (alert) => {
      setAlerts(prev => [alert, ...prev]);
    });

    newSocket.on('alert:resolved', (alert) => {
      setAlerts(prev => prev.filter(a => a.id !== alert.id));
    });

    newSocket.on('alert:acknowledged', (alert) => {
      setAlerts(prev => prev.filter(a => a.id !== alert.id));
    });

    return () => newSocket.disconnect();
  }, []);

  const acknowledgeAlert = (alertId) => {
    if (socket) {
      socket.emit('admin:alert:ack', { alertId, adminId: 'admin-01' });
    }
  };

  const sendCommand = (busId, command, params = {}) => {
    if (socket) {
      socket.emit('admin:command', { busId, command, params });
    }
  };

  const value = {
    fleets,
    summary,
    health,
    alerts,
    isConnected,
    acknowledgeAlert,
    sendCommand
  };

  return (
    <FleetContext.Provider value={value}>
      {children}
    </FleetContext.Provider>
  );
}

export function useFleet() {
  const context = useContext(FleetContext);
  if (!context) {
    throw new Error('useFleet must be used within a FleetProvider');
  }
  return context;
}
