import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Activity, 
  Users, 
  Bus, 
  Map as MapIcon, 
  ChevronLeft, 
  Menu,
  ShieldAlert,
  Link2,
  X
} from 'lucide-react';
import './Sidebar.css';

export default function Sidebar({ mobileOpen, onClose }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed(!collapsed);

  const sidebarClass = `sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`;

  const navItems = (
    <nav className="sidebar-nav">
      <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
        <Activity className="nav-icon" />
        {!collapsed && <span>Command Center</span>}
      </NavLink>
      
      {!collapsed && (
        <div style={{ padding: '16px 12px 8px', fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Config
        </div>
      )}

      <NavLink to="/drivers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
        <Users className="nav-icon" />
        {!collapsed && <span>Drivers</span>}
      </NavLink>

      <NavLink to="/buses" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
        <Bus className="nav-icon" />
        {!collapsed && <span>Buses</span>}
      </NavLink>

      <NavLink to="/routes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
        <MapIcon className="nav-icon" />
        {!collapsed && <span>Routes</span>}
      </NavLink>

      {!collapsed && (
        <div style={{ padding: '16px 12px 8px', fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Deployment
        </div>
      )}

      <NavLink to="/assignments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
        <Link2 className="nav-icon" />
        {!collapsed && <span>Assignments</span>}
      </NavLink>

      {!collapsed && (
        <div style={{ padding: '16px 12px 8px', fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Realtime
        </div>
      )}

      <NavLink to="/alerts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
        <ShieldAlert className="nav-icon" />
        {!collapsed && <span>Live Alerts</span>}
      </NavLink>
    </nav>
  );

  return (
    <aside className={sidebarClass}>
      <div className="sidebar-header">
        <div className="logo-area">
          <div className="logo-icon">T</div>
          {!collapsed && <span className="logo-text">Transport OS</span>}
        </div>
        
        {/* Toggle button on desktop */}
        <button className="collapse-btn desktop-only" onClick={toggle} style={{ display: 'flex' }}>
          {collapsed ? <ChevronLeft size={18} style={{ transform: 'rotate(180deg)' }} /> : <ChevronLeft size={18} />}
        </button>

        {/* Close button on mobile */}
        <button className="collapse-btn mobile-only" onClick={onClose} style={{ display: 'none' }}>
           <X size={18} />
        </button>
      </div>

      {navItems}
    </aside>
  );
}
