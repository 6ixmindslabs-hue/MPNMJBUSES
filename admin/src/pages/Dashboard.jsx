import React, { useCallback, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { Bus, MapPin, Clock, Phone, AlertTriangle, Activity } from 'lucide-react';

const TRACKING_API_BASE = import.meta.env.VITE_TRACKING_API_URL || 'https://mpnmjec-backend.onrender.com/api';

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const createBusIcon = (status) => {
  const colors = {
    running: '#22c55e',
    paused: '#f59e0b',
    started: '#3b82f6',
    offline: '#ef4444',
    default: '#94a3b8'
  };
  const color = colors[status] || colors.default;

  return L.divIcon({
    html: `<div class="relative">
             <div class="pulsate-marker" style="background-color: ${color}; border-color: ${color}"></div>
             <div class="absolute -top-6 -left-2 bg-white px-2 py-0.5 rounded shadow text-[10px] font-bold border border-slate-200">BUS</div>
           </div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const Dashboard = () => {
  const [activeTrips, setActiveTrips] = useState([]);
  const [stats, setStats] = useState({ active: 0, delayed: 0, incidents: 0 });

  const fetchActiveTrips = useCallback(async () => {
    try {
      const response = await fetch(`${TRACKING_API_BASE}/trips/active`);
      if (!response.ok) return;
      const trips = await response.json();
      setActiveTrips(trips);
      setStats({
        active: trips.length,
        delayed: trips.filter((t) => t.delay_status === 'Delayed').length,
        incidents: 0,
      });
    } catch {
      // Keep previous snapshot on transient API failures.
    }
  }, []);

  useEffect(() => {
    fetchActiveTrips();

    const channel = supabase
      .channel('live-ops')
      .on('postgres_changes', { event: '*', table: 'trips' }, fetchActiveTrips)
      .on('postgres_changes', { event: 'INSERT', table: 'telemetry' }, fetchActiveTrips)
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchActiveTrips]);

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Live Operations Control</h2>
          <p className="text-slate-500">Real-time tracking of all active college transport units.</p>
        </div>
        <div className="flex gap-4">
          <StatCard label="Active Buses" value={stats.active} color="text-primary-600" />
          <StatCard label="Delays (>5m)" value={stats.delayed} color="text-amber-600" />
          <StatCard label="Incidents" value={stats.incidents} color="text-red-600" />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-4 gap-6 min-h-0">
        <div className="col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative map-container">
          <MapContainer
            center={[12.9716, 77.5946]}
            zoom={13}
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {activeTrips.map((trip) => {
              const pos = trip.latest_telemetry;
              if (!pos) return null;

              return (
                <React.Fragment key={trip.id}>
                  {trip.schedules?.routes?.polyline && (
                    <Polyline
                      positions={trip.schedules.routes.polyline}
                      color="#3b82f6"
                      weight={3}
                      opacity={0.3}
                      dashArray="5, 10"
                    />
                  )}
                  <Marker
                    position={[pos.latitude, pos.longitude]}
                    icon={createBusIcon(trip.is_online ? trip.status : 'offline')}
                  >
                    <Popup className="bus-popup">
                      <div className="p-1 min-w-[200px]">
                        <div className="flex justify-between items-start mb-2">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                            {trip.schedules?.buses?.bus_number || '-'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${
                            trip.is_online ? 'bg-green-500' : 'bg-red-500'
                          }`}>
                            {trip.is_online ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm mb-1">
                          {trip.schedules?.routes?.start_location} to {trip.schedules?.routes?.end_location}
                        </h4>
                        <div className="space-y-1.5 text-xs text-slate-600">
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-slate-400" />
                            <span>ETA: <b className="text-slate-900">{trip.eta_minutes ?? '-'} mins</b></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-slate-400" />
                            <span>Delay: <b className={trip.delay_status === 'Delayed' ? 'text-red-500' : 'text-green-600'}>
                              {trip.delay_status || 'On Time'}
                            </b></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-slate-400" />
                            <span>{trip.schedules?.drivers?.name || '-'}</span>
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              );
            })}
          </MapContainer>
        </div>

        <div className="col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Bus size={18} className="text-primary-600" />
              Active Trips
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeTrips.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-400">
                <Activity size={32} strokeWidth={1} className="mb-2" />
                <p className="text-sm italic">No active trips currently</p>
              </div>
            ) : (
              activeTrips.map((trip) => (
                <div key={trip.id} className="p-3 rounded-xl border border-slate-100 hover:border-primary-100 hover:bg-primary-50/30 transition-all cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-slate-900 truncate flex-1">
                      {trip.schedules?.routes?.start_location} to {trip.schedules?.routes?.end_location}
                    </span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded shrink-0 ${
                      trip.delay_status === 'Delayed' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                    }`}>
                      {trip.delay_status === 'Delayed' ? `+${trip.delay_minutes || 0}m` : 'ON TIME'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <MapPin size={12} />
                    <span className="truncate">
                      {trip.schedules?.buses?.bus_number || '-'} - {trip.is_online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  {trip.delay_status === 'Delayed' && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-red-600 font-bold bg-red-50 p-1.5 rounded-lg">
                      <AlertTriangle size={12} />
                      CRITICAL DELAY DETECTED
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color }) => (
  <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex flex-col min-w-[120px]">
    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</span>
    <span className={`text-2xl font-black ${color}`}>{value}</span>
  </div>
);

export default Dashboard;
