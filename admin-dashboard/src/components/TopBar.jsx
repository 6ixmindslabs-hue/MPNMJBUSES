import React, { useState, useEffect } from 'react';
import { useFleet } from '../context/FleetContext';
import { Menu as MenuIcon } from 'lucide-react';
import './TopBar.css';

export default function TopBar({ onMenuClick }) {
  const [time, setTime] = useState(new Date());
  
  // Use the central fleet context for live data
  const { summary, health, isConnected } = useFleet();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const metrics = [
    { label: 'Active',    value: summary.active.toString().padStart(2, '0'), cls: 'healthy'  },
    { label: 'Delayed',   value: summary.delayed.toString().padStart(2, '0'), cls: 'warning'  },
    { label: 'Off Route', value: summary.offRoute.toString().padStart(2, '0'), cls: 'critical' },
    { label: 'Offline',   value: summary.offline.toString().padStart(2, '0'), cls: 'offline'  },
  ];

  return (
    <header className="top-bar">

      {/* LEFT */}
      <div className="tb-left">
        <button className="mobile-menu-btn" onClick={onMenuClick}>
           <MenuIcon size={20} />
        </button>
        <div className="org-icon" style={{ borderColor: isConnected ? '#f59e0b' : '#dc2626', overflow: 'hidden' }}>
          <img src="/favicon.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div className="org-details">
          <span className="org-name">Metro Campus</span>
          <span className="org-sub">Operations</span>
        </div>
      </div>

      {/* CENTER */}
      <div className="tb-center">
        <div className="tb-metrics">
          {metrics.map(m => (
            <div className="kpi-item" key={m.label}>
              <span className={`kpi-dot ${m.cls}`} />
              <span className="kpi-lbl">{m.label}</span>
              <span className={`kpi-val ${m.cls}`}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div className="tb-right">
        <div className="sys-hz">
          <span className="sys-hz-dot" style={{ background: isConnected ? '#16a34a' : '#dc2626' }} />
          {health.broadcastHz}hz
        </div>
        <div className="tb-sep" />
        <span className="sys-time">
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </span>
        <div className="tb-sep" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1c1917' }}>Administrator</span>
            <span style={{ fontSize: 9, color: 'rgba(28,25,23,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Access</span>
          </div>
          <div className="avatar">AD</div>
        </div>
      </div>

    </header>
  );
}
