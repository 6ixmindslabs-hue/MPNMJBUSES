import React, { useState, useEffect } from 'react';
import { Map, MapPin, Plus, Trash2, Save, Clock, Navigation, Edit2, X } from 'lucide-react';

const HOST = 'http://127.0.0.1:4000';

export default function RoutesPage() {
  const [routes, setRoutes] = useState([]);
  const [routeName, setRouteName] = useState('');
  const [routeId, setRouteId] = useState('');
  const [stops, setStops] = useState([{ name: '', lat: '', lng: '', arrivalTime: '' }]);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      const resp = await fetch(`${HOST}/api/routes`);
      const data = await resp.json();
      setRoutes(data);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  const addStop = () => {
    setStops([...stops, { name: '', lat: '', lng: '', arrivalTime: '' }]);
  };

  const removeStop = (index) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const updateStop = (index, field, value) => {
    const next = [...stops];
    next[index][field] = value;
    setStops(next);
  };

  const resetForm = () => {
    setRouteName('');
    setRouteId('');
    setStops([{ name: '', lat: '', lng: '', arrivalTime: '' }]);
    setEditingRouteId(null);
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    if (!routeName || !routeId) return;
    setLoading(true);
    try {
      const url = editingRouteId ? `${HOST}/api/routes/${editingRouteId}` : `${HOST}/api/routes`;
      const method = editingRouteId ? 'PUT' : 'POST';
      const body = { 
        routeId, 
        name: routeName, 
        stops: stops.map(s => ({ ...s, lat: parseFloat(s.lat), lng: parseFloat(s.lng) }))
      };
      if (!editingRouteId) body.createdAt = new Date().toISOString();

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      resetForm();
      fetchRoutes();
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (idToDelete) => {
    try {
      await fetch(`${HOST}/api/routes/${idToDelete}`, { method: 'DELETE' });
      setConfirmDelete(null);
      fetchRoutes();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const startEdit = (route) => {
    setEditingRouteId(route.routeId);
    setRouteId(route.routeId);
    setRouteName(route.name);
    setStops(route.stops.map(s => ({ ...s, lat: s.lat.toString(), lng: s.lng.toString() })));
  };

  return (
    <div style={{ flex: 1, padding: 32, background: '#fafaf9', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#1c1917' }}>Route Engineering</h1>
          <p style={{ margin: '4px 0 0', color: '#78716c' }}>Design network paths and time-synchronized stops.</p>
        </div>

        <div className="responsive-grid">
          
          {/* Create/Edit Form */}
          <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 12, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {editingRouteId ? <Edit2 size={18} color="#d97706" /> : <Navigation size={18} color="#d97706" />} 
                {editingRouteId ? 'Edit Route' : 'Design New Route'}
              </h3>
              {editingRouteId && (
                <button onClick={resetForm} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a8a29e' }}>
                  <X size={18} />
                </button>
              )}
            </div>
            
            <form onSubmit={handleCreateOrUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Route Identifier</label>
                <input 
                  type="text" 
                  value={routeId} 
                  onChange={e => setRouteId(e.target.value)}
                  placeholder="e.g. R-101"
                  disabled={!!editingRouteId}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 14, boxSizing: 'border-box', background: editingRouteId ? '#f5f5f4' : '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Route Name</label>
                <input 
                  type="text" 
                  value={routeName} 
                  onChange={e => setRouteName(e.target.value)}
                  placeholder="e.g. Campus Express (North)"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>Stops / Waypoints</label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {stops.map((stop, idx) => (
                    <div key={idx} style={{ padding: 12, background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8, position: 'relative' }}>
                      {stops.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => removeStop(idx)}
                          style={{ position: 'absolute', right: -8, top: -8, background: '#fff', border: '1px solid #e7e5e4', borderRadius: '50%', padding: 4, cursor: 'pointer', color: '#dc2626' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input 
                          type="text" 
                          value={stop.name} 
                          onChange={e => updateStop(idx, 'name', e.target.value)}
                          placeholder="Stop Name" 
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #e7e5e4', fontSize: 12 }} 
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input 
                            type="text" 
                            value={stop.lat} 
                            onChange={e => updateStop(idx, 'lat', e.target.value)}
                            placeholder="Latitude" 
                            style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #e7e5e4', fontSize: 11 }} 
                          />
                          <input 
                            type="text" 
                            value={stop.lng} 
                            onChange={e => updateStop(idx, 'lng', e.target.value)}
                            placeholder="Longitude" 
                            style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #e7e5e4', fontSize: 11 }} 
                          />
                        </div>
                        <div style={{ position: 'relative' }}>
                          <Clock size={10} style={{ position: 'absolute', left: 8, top: 10, color: '#a8a29e' }} />
                          <input 
                            type="text" 
                            value={stop.arrivalTime} 
                            onChange={e => updateStop(idx, 'arrivalTime', e.target.value)}
                            placeholder="Arrival (e.g. 08:30)" 
                            style={{ width: '100%', padding: '6px 8px 6px 24px', borderRadius: 4, border: '1px solid #e7e5e4', fontSize: 11 }} 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  type="button" 
                  onClick={addStop}
                  style={{ width: '100%', marginTop: 12, padding: '8px', borderRadius: 8, border: '1px dashed #d6d3d1', background: 'transparent', cursor: 'pointer', color: '#78716c', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Plus size={14} /> Add Another Stop
                </button>
              </div>

              <button 
                disabled={loading}
                type="submit" 
                style={{ 
                  marginTop: 16, 
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
                <Save size={16} /> {loading ? 'Saving...' : (editingRouteId ? 'Update Route' : 'Finalize Route')}
              </button>
            </form>
          </div>

          {/* Route List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {routes.map((r, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', background: '#fafaf9', borderBottom: '1px solid #e7e5e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>{r.routeId}</span>
                      <h4 style={{ margin: 0, fontSize: 16 }}>{r.name}</h4>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize: 12, color: '#78716c', fontWeight: 600 }}>{r.stops.length} Stops</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {confirmDelete === r.routeId ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => handleDelete(r.routeId)} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Confirm</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ background: '#e7e5e4', color: '#1c1917', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => startEdit(r)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#78716c' }} title="Edit">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => setConfirmDelete(r.routeId)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 7, top: 10, bottom: 10, width: 2, background: '#f5f5f4' }} />
                    {r.stops.map((s, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', border: '2px solid #fbbf24', flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name || `Waypoint ${idx+1}`}</span>
                          <span style={{ fontSize: 11, color: '#a8a29e', background: '#fafaf9', padding: '2px 6px', borderRadius: 4 }}>{s.arrivalTime}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {routes.length === 0 && (
              <div style={{ padding: 60, textAlign: 'center', background: '#fff', border: '1px dashed #d6d3d1', borderRadius: 12 }}>
                <Map size={32} color="#d6d3d1" style={{ marginBottom: 12 }} />
                <p style={{ color: '#a8a29e', margin: 0 }}>No routes mapped yet.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
