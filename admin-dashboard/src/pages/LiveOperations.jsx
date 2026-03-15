import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Info, X, Radio, Navigation, AlertTriangle } from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import './LiveOperations.css';

// ── Marker Icon Factory ──────────────────────────────────────────────────────
const createStructIcon = (status) => {
  const colors = {
    HEALTHY:   { fill: '#16a34a', stroke: '#14532d' },
    DELAYED:   { fill: '#d97706', stroke: '#92400e' },
    OFF_ROUTE: { fill: '#dc2626', stroke: '#991b1b' },
    OFFLINE:   { fill: '#a8a29e', stroke: '#78716c' },
  };
  const c = colors[status] || colors.HEALTHY;

  const svg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="10" fill="${c.fill}" fill-opacity="0.2" stroke="${c.stroke}" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
  </svg>`;

  return new L.DivIcon({
    html: svg,
    className: 'map-struct-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
};

// ── Map Controller ──────────────────────────────────────────────────────────
function FleetMapMarkers({ onSelectVehicle, selectedVehicleId }) {
  const map = useMap();
  const { fleets } = useFleet();
  const markerRefs = useRef({});

  useEffect(() => {
    // Process all fleet states from context
    Object.values(fleets).forEach((state) => {
      let markerStatus = 'HEALTHY';
      if (state.sysStatus === 'OFFLINE') markerStatus = 'OFFLINE';
      else if (state.lifecycle === 'OFF_ROUTE') markerStatus = 'OFF_ROUTE';
      else if (state.etaMinutes > 15) markerStatus = 'DELAYED';

      const icon = createStructIcon(markerStatus);
      let marker = markerRefs.current[state.busId];

      if (marker) {
        marker.setLatLng([state.lat, state.lng]);
        marker.setIcon(icon);
      } else {
        marker = L.marker([state.lat, state.lng], { icon })
          .on('click', () => onSelectVehicle(state.busId))
          .addTo(map);
        markerRefs.current[state.busId] = marker;
      }

      // If this is the active vehicle, auto-center (optional UX choice)
      if (selectedVehicleId === state.busId) {
        map.panTo([state.lat, state.lng], { animate: true, duration: 1 });
      }
    });

    // Cleanup stale markers (if a vehicle is removed from cache - rare in this engine)
    Object.keys(markerRefs.current).forEach(id => {
      if (!fleets[id]) {
        map.removeLayer(markerRefs.current[id]);
        delete markerRefs.current[id];
      }
    });
  }, [fleets, map, selectedVehicleId, onSelectVehicle]);

  return null;
}

// ── Item Row Helper ──────────────────────────────────────────────────────────
const DataRow = ({ label, value, unit, icon: Icon }) => (
  <div className="data-cell">
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      {Icon && <Icon size={12} className="text-secondary" />}
      <span className="cell-key">{label}</span>
    </div>
    <span className="cell-val mono">
      {value} {unit && <span className="cell-unit">{unit}</span>}
    </span>
  </div>
);

// ── Right intelligence panel ─────────────────────────────────────────────────
function IntelligencePanel({ vehicle, onClose }) {
  if (!vehicle) return null;

  const { sendCommand } = useFleet();
  const isDelayed = vehicle.etaMinutes > 15;
  const progressPct = Math.min(100, Math.max(0, (vehicle.progressionIndex || 0) * 100));

  return (
    <div className="right-panel">
      
      <div className="panel-topbar">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="eyebrow-text">Vehicle Unit</span>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={`status-dot ${vehicle.sysStatus === 'ONLINE' ? 'healthy' : 'offline'}`} 
                 style={{ width: 8, height: 8, borderRadius: '50%' }} />
            {vehicle.busId}
          </h2>
        </div>
        <button className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="panel-body">
        
        {/* Status Card */}
        <div className={`card border-${isDelayed ? 'warning' : 'healthy'}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="status-badge">{vehicle.lifecycle}</span>
            <div style={{ textAlign: 'right' }}>
              <div className="mono" style={{ fontSize: 24, fontWeight: '700', color: isDelayed ? 'var(--status-warning)' : 'var(--text-primary)' }}>
                {vehicle.etaMinutes}<span style={{ fontSize: 14, marginLeft: 2 }}>M</span>
              </div>
              <div className="eyebrow-text" style={{ fontSize: 9 }}>Confidence {vehicle.etaConfidence}%</div>
            </div>
          </div>
          
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="eyebrow-text">Route Progress</span>
              <span className="mono" style={{ fontSize: 12 }}>{progressPct.toFixed(1)}%</span>
            </div>
            <div className="track-bar">
              <div 
                className="track-fill" 
                style={{ 
                  width: `${progressPct}%`, 
                  background: vehicle.lifecycle === 'OFF_ROUTE' ? 'var(--status-critical)' : (isDelayed ? 'var(--status-warning)' : 'var(--status-healthy)') 
                }} 
              />
            </div>
          </div>
        </div>

        {/* Telemetry Grid */}
        <h3 className="section-title">Operational Telemetry</h3>
        <div className="data-grid">
          <DataRow 
            label="Velocity" 
            value={(vehicle.speed * 3.6).toFixed(1)} 
            unit="km/h" 
            icon={Navigation}
          />
          <DataRow 
            label="Accuracy" 
            value={`±${(vehicle.accuracy || 0).toFixed(1)}`} 
            unit="m" 
            icon={Radio}
          />
          <DataRow 
            label="Heading" 
            value={Math.floor(vehicle.heading || 0)} 
            unit="°" 
          />
          <DataRow 
            label="Deviation" 
            value={Math.floor(vehicle.deviationMeters || 0)} 
            unit="m" 
            icon={AlertTriangle}
          />
        </div>

        {/* Command Center */}
        <h3 className="section-title" style={{ marginTop: 8 }}>Management Overrides</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            className="btn-command"
            onClick={() => sendCommand(vehicle.busId, 'FORCE_IDLE')}
            style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Idle
          </button>
          <button 
            className="btn-command"
            onClick={() => sendCommand(vehicle.busId, 'RESET_PROGRESSION')}
            style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Reset
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Main Layout ──────────────────────────────────────────────────────────────
export default function LiveOperations() {
  const { fleets } = useFleet();
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);

  return (
    <div className="live-ops-layout">
      
      <div className="map-view">
        <MapContainer center={[13.0827, 80.2707]} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <FleetMapMarkers 
            onSelectVehicle={setSelectedVehicleId} 
            selectedVehicleId={selectedVehicleId} 
          />
        </MapContainer>
      </div>

      {selectedVehicleId && (
        <IntelligencePanel 
          vehicle={fleets[selectedVehicleId]} 
          onClose={() => setSelectedVehicleId(null)} 
        />
      )}
      
    </div>
  );
}
