import React from 'react';
import { ShieldAlert, Wrench } from 'lucide-react';

export default function PlaceholderPage({ title, description, icon: Icon = Wrench }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      background: 'linear-gradient(160deg, #fffbeb 0%, #fef3c7 40%, #f5f5f4 100%)',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        maxWidth: 440,
        padding: '0 24px',
        gap: 16,
      }}>
        {/* Icon card with yellow gradient */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'linear-gradient(135deg, #fbbf24, #d97706)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
          boxShadow: '0 8px 24px rgba(245,158,11,0.35)',
        }}>
          <Icon size={28} color="#1c1917" strokeWidth={2} />
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1c1917', margin: 0 }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: '#78716c', margin: 0, lineHeight: 1.7 }}>
          {description}
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 8,
          padding: '12px 18px',
          background: '#ffffff',
          border: '1px solid #fde68a',
          borderRadius: 10,
          color: '#92400e',
          fontSize: 13,
          fontWeight: 500,
          boxShadow: '0 2px 8px rgba(245,158,11,0.1)',
        }}>
          <ShieldAlert size={16} color="#d97706" />
          <span>Module inactive — awaiting backend provisioning</span>
        </div>
      </div>
    </div>
  );
}
