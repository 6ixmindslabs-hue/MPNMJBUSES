import React, { useState, useEffect } from 'react';
import { useFleet } from '../context/FleetContext';
import { Check, Bell, AlertCircle, Clock, Trash2 } from 'lucide-react';

export default function AlertsPage() {
  const { alerts, acknowledgeAlert } = useFleet();

  const getAlertIcon = (severity) => {
    switch (severity) {
      case 'CRITICAL': return <AlertCircle size={20} color="#dc2626" />;
      case 'WARNING': return <Clock size={20} color="#d97706" />;
      default: return <Bell size={20} color="#3b82f6" />;
    }
  };

  return (
    <div style={{ flex: 1, padding: '32px', background: '#fafaf9', overflowY: 'auto' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', color: '#1c1917' }}>Live System Alerts</h1>
            <p style={{ margin: '4px 0 0', color: '#78716c' }}>Real-time anomaly detection and incident response</p>
          </div>
          <div style={{ 
            background: alerts.length > 0 ? '#fef2f2' : '#f0fdf4', 
            padding: '8px 16px', 
            borderRadius: '20px', 
            border: alerts.length > 0 ? '1px solid #fee2e2' : '1px solid #dcfce7',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <div style={{ 
              width: 8, height: 8, borderRadius: '50%', 
              background: alerts.length > 0 ? '#dc2626' : '#16a34a' 
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: alerts.length > 0 ? '#991b1b' : '#14532d' }}>
              {alerts.length} Active {alerts.length === 1 ? 'Incident' : 'Incidents'}
            </span>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div style={{ 
            background: '#ffffff', 
            border: '1px solid #e7e5e4', 
            borderRadius: '16px', 
            padding: '64px', 
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{ 
              width: 64, height: 64, background: '#f0fdf4', borderRadius: '50%', 
              display: 'flex', alignItems: 'center', justifyCenter: 'center', marginBottom: '16px' 
            }}>
              <Check size={32} color="#16a34a" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 8px' }}>All Clear</h2>
            <p style={{ color: '#78716c', margin: 0 }}>No active fleet anomalies detected at this time.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {alerts.map(alert => (
              <div key={alert.id} style={{
                background: '#ffffff',
                border: '1px solid #e7e5e4',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'transform 0.1s'
              }}>
                <div style={{ 
                  width: 44, height: 44, borderRadius: '10px', 
                  background: alert.severity === 'CRITICAL' ? '#fef2f2' : '#fffbeb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {getAlertIcon(alert.severity)}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#a8a29e' }}>
                      {alert.busId}
                    </span>
                    <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#d6d3d1' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: alert.severity === 'CRITICAL' ? '#dc2626' : '#d97706' }}>
                      {alert.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: '#1c1917', fontWeight: 500 }}>
                    {alert.message}
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: 12, color: '#a8a29e', fontFamily: 'monospace' }}>
                    {new Date(alert.raisedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <button 
                    onClick={() => acknowledgeAlert(alert.id)}
                    style={{
                      background: '#1c1917',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Check size={14} /> Ack
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
