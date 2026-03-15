import React, { useState, useEffect } from 'react';
import { Bus, Save, Hash, Trash2, Edit2, X } from 'lucide-react';

const HOST = import.meta.env.VITE_BACKEND_URL || 'https://mpnmjbuses.vercel.app';

export default function BusesPage() {
  const [buses, setBuses] = useState([]);
  const [busId, setBusId] = useState('');
  const [editingBusId, setEditingBusId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchBuses();
  }, []);

  const fetchBuses = async () => {
    try {
      const resp = await fetch(`${HOST}/api/buses`);
      const data = await resp.json();
      setBuses(data);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  const resetForm = () => {
    setBusId('');
    setEditingBusId(null);
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    if (!busId) return;
    setLoading(true);
    try {
      const url = editingBusId ? `${HOST}/api/buses/${editingBusId}` : `${HOST}/api/buses`;
      const method = editingBusId ? 'PUT' : 'POST';
      const body = { busId, status: 'IDLE' };
      if (!editingBusId) body.registeredAt = new Date().toISOString();

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      resetForm();
      fetchBuses();
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (idToDelete) => {
    try {
      await fetch(`${HOST}/api/buses/${idToDelete}`, { method: 'DELETE' });
      setConfirmDelete(null);
      fetchBuses();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const startEdit = (bus) => {
    setEditingBusId(bus.busId);
    setBusId(bus.busId);
  };

  return (
    <div style={{ flex: 1, padding: 32, background: '#fafaf9', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#1c1917' }}>Fleet Inventory</h1>
          <p style={{ margin: '4px 0 0', color: '#78716c' }}>Register and manage buses by their unique number.</p>
        </div>

        <div className="responsive-grid form-first">
          
          {/* Bus List */}
          <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e7e5e4', background: '#fafaf9', fontWeight: 600, fontSize: 13, color: '#78716c' }}>
              ACTIVE FLEET ({buses.length})
            </div>
            <div style={{ minHeight: 200 }}>
              {buses.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#a8a29e' }}>No vehicles registered yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e7e5e4', fontSize: 11, textTransform: 'uppercase', color: '#a8a29e' }}>
                      <th style={{ padding: '12px 20px' }}>Bus Number</th>
                      <th style={{ padding: '12px 20px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buses.map((b, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f5f5f4', fontSize: 13 }}>
                        <td style={{ padding: '12px 20px', fontWeight: 700, color: '#f59e0b' }}>{b.busId}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {confirmDelete === b.busId ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => handleDelete(b.busId)} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Confirm</button>
                                <button onClick={() => setConfirmDelete(null)} style={{ background: '#e7e5e4', color: '#1c1917', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => startEdit(b)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#78716c' }} title="Edit">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={() => setConfirmDelete(b.busId)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }} title="Delete">
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Create/Edit Form */}
          <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 12, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {editingBusId ? <Edit2 size={18} color="#d97706" /> : <Bus size={18} color="#d97706" />} 
                {editingBusId ? 'Edit Bus' : 'Add New Bus'}
              </h3>
              {editingBusId && (
                <button onClick={resetForm} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a8a29e' }}>
                  <X size={18} />
                </button>
              )}
            </div>
            
            <form onSubmit={handleCreateOrUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Bus Number</label>
                <div style={{ position: 'relative' }}>
                  <Hash size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#a8a29e' }} />
                  <input 
                    type="text" 
                    value={busId} 
                    onChange={e => setBusId(e.target.value)}
                    placeholder="e.g. 102"
                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <button 
                disabled={loading}
                type="submit" 
                style={{ 
                  marginTop: 8, 
                  background: 'linear-gradient(135deg, #fbbf24, #d97706)', 
                  border: 'none', 
                  borderRadius: 8, 
                  padding: '12px', 
                  color: '#fff', 
                  fontWeight: 600, 
                  fontSize: 14, 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(217, 119, 6, 0.2)'
                }}
              >
                <Save size={16} /> {loading ? 'Saving...' : (editingBusId ? 'Update Bus' : 'Register Bus')}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
