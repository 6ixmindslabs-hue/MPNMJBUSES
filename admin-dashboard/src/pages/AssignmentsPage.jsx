import React, { useState, useEffect } from 'react';
import { Link2, User, Bus, Map as MapIcon, Save, RefreshCw, Trash2, Edit2, X } from 'lucide-react';

const HOST = 'https://mpnmjbuses.vercel.app';

export default function AssignmentsPage() {
  const [drivers, setDrivers] = useState([]);
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [assignments, setAssignments] = useState([]);
  
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedBus, setSelectedBus] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [shiftDirection, setShiftDirection] = useState('INBOUND');
  const [editingBusId, setEditingBusId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [dr, bs, rt, as] = await Promise.all([
        fetch(`${HOST}/api/drivers`).then(r => r.json()),
        fetch(`${HOST}/api/buses`).then(r => r.json()),
        fetch(`${HOST}/api/routes`).then(r => r.json()),
        fetch(`${HOST}/api/assignments`).then(r => r.json())
      ]);
      setDrivers(dr);
      setBuses(bs);
      setRoutes(rt);
      setAssignments(as);
    } catch (err) {
      console.error('Data pull error:', err);
    }
  };

  const resetForm = () => {
    setSelectedDriver('');
    setSelectedBus('');
    setSelectedRoute('');
    setShiftDirection('INBOUND');
    setEditingBusId(null);
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedDriver || !selectedBus || !selectedRoute) return;
    setLoading(true);
    try {
      await fetch(`${HOST}/api/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          busId: selectedBus, 
          driverId: selectedDriver, 
          routeId: selectedRoute,
          shiftDirection,
          updatedAt: new Date().toISOString()
        })
      });
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Assignment error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (busId) => {
    try {
      await fetch(`${HOST}/api/assignments/${busId}`, { method: 'DELETE' });
      setConfirmDelete(null);
      fetchData();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const startEdit = (as) => {
    setEditingBusId(as.busId);
    setSelectedBus(as.busId);
    setSelectedDriver(as.driverId);
    setSelectedRoute(as.routeId);
    setShiftDirection(as.shiftDirection || 'INBOUND');
  };

  return (
    <div style={{ flex: 1, padding: 32, background: '#fafaf9', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#1c1917' }}>Operational Assignments</h1>
          <p style={{ margin: '4px 0 0', color: '#78716c' }}>Link drivers and vehicles to active service routes.</p>
        </div>

        <div className="responsive-grid form-first">
          
          {/* Active Assignments List */}
          <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e7e5e4', background: '#fafaf9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: '#78716c' }}>ACTIVE DEPLOYMENTS ({assignments.length})</span>
              <button onClick={fetchData} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#78716c' }}><RefreshCw size={14} /></button>
            </div>
            <div style={{ minHeight: 200 }}>
              {assignments.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#a8a29e' }}>No active assignments found.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e7e5e4', fontSize: 11, textTransform: 'uppercase', color: '#a8a29e' }}>
                      <th style={{ padding: '12px 20px' }}>Vehicle</th>
                      <th style={{ padding: '12px 20px' }}>Operator</th>
                      <th style={{ padding: '12px 20px' }}>Route & Shift</th>
                      <th style={{ padding: '12px 20px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((as, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f5f5f4', fontSize: 13 }}>
                        <td style={{ padding: '12px 20px', fontWeight: 700, color: '#f59e0b' }}>{as.busId}</td>
                        <td style={{ padding: '12px 20px', fontWeight: 600 }}>{drivers.find(d => d.login === as.driverId)?.name || as.driverId}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ color: '#57534e', fontWeight: 600 }}>{routes.find(r => r.routeId === as.routeId)?.name || as.routeId}</div>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#a8a29e', marginTop: 2 }}>{as.shiftDirection === 'OUTBOUND' ? 'Evening (Outbound)' : 'Morning (Inbound)'}</div>
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {confirmDelete === as.busId ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => handleDelete(as.busId)} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Confirm</button>
                                <button onClick={() => setConfirmDelete(null)} style={{ background: '#e7e5e4', color: '#1c1917', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => startEdit(as)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#78716c' }} title="Edit">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={() => setConfirmDelete(as.busId)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }} title="Delete">
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

          {/* Assignment Creator Form */}
          <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 12, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {editingBusId ? <Edit2 size={18} color="#d97706" /> : <Link2 size={18} color="#d97706" />} 
                {editingBusId ? 'Edit Deployment' : 'Create Deployment'}
              </h3>
              {editingBusId && (
                <button onClick={resetForm} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a8a29e' }}>
                  <X size={18} />
                </button>
              )}
            </div>
            
            <form onSubmit={handleAssign} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Select Vehicle</label>
                <div style={{ position: 'relative' }}>
                  <Bus size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#a8a29e' }} />
                  <select 
                    value={selectedBus} 
                    onChange={e => setSelectedBus(e.target.value)}
                    disabled={!!editingBusId}
                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 14, background: editingBusId ? '#f5f5f4' : '#fff' }}
                  >
                    <option value="">Choose Bus...</option>
                    {buses.map(b => (
                      <option key={b.busId} value={b.busId}>{b.busId}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Select Driver</label>
                <div style={{ position: 'relative' }}>
                  <User size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#a8a29e' }} />
                  <select 
                    value={selectedDriver} 
                    onChange={e => setSelectedDriver(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 14, background: '#fff' }}
                  >
                    <option value="">Choose Driver...</option>
                    {drivers.map(d => (
                      <option key={d.login} value={d.login}>{d.name} ({d.login})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Assign to Route</label>
                <div style={{ position: 'relative' }}>
                  <MapIcon size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#a8a29e' }} />
                  <select 
                    value={selectedRoute} 
                    onChange={e => setSelectedRoute(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 14, background: '#fff' }}
                  >
                    <option value="">Choose Route...</option>
                    {routes.map(r => (
                      <option key={r.routeId} value={r.routeId}>{r.routeId} - {r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Shift Direction</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShiftDirection('INBOUND')}
                    style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${shiftDirection === 'INBOUND' ? '#f59e0b' : '#e7e5e4'}`, background: shiftDirection === 'INBOUND' ? '#fffbeb' : '#fff', color: shiftDirection === 'INBOUND' ? '#b45309' : '#78716c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Morning (Inbound)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShiftDirection('OUTBOUND')}
                    style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${shiftDirection === 'OUTBOUND' ? '#f59e0b' : '#e7e5e4'}`, background: shiftDirection === 'OUTBOUND' ? '#fffbeb' : '#fff', color: shiftDirection === 'OUTBOUND' ? '#b45309' : '#78716c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Evening (Outbound)
                  </button>
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
                <Save size={16} /> {loading ? 'Processing...' : (editingBusId ? 'Update Deployment' : 'Deploy Assignment')}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
