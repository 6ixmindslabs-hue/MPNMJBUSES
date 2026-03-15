import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, User, Key, Save, Trash2, Edit2, X, AlertTriangle } from 'lucide-react';

const HOST = import.meta.env.VITE_BACKEND_URL || 'https://mpnmjbuses.vercel.app';

export default function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [editingLogin, setEditingLogin] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const resp = await fetch(`${HOST}/api/drivers`);
      const data = await resp.json();
      setDrivers(data);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  const resetForm = () => {
    setName('');
    setLogin('');
    setPassword('');
    setEditingLogin(null);
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    if (!name || !login || (!editingLogin && !password)) return;
    setLoading(true);
    try {
      const url = editingLogin ? `${HOST}/api/drivers/${editingLogin}` : `${HOST}/api/drivers`;
      const method = editingLogin ? 'PUT' : 'POST';
      const body = { name, login };
      if (password) body.password = password;
      if (!editingLogin) body.createdAt = new Date().toISOString();

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      resetForm();
      fetchDrivers();
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (loginToDelete) => {
    try {
      await fetch(`${HOST}/api/drivers/${loginToDelete}`, { method: 'DELETE' });
      setConfirmDelete(null);
      fetchDrivers();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const startEdit = (driver) => {
    setEditingLogin(driver.login);
    setName(driver.name);
    setLogin(driver.login);
    setPassword('');
  };

  return (
    <div style={{ flex: 1, padding: 32, background: '#fafaf9', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 28, color: '#1c1917' }}>Driver Personnel</h1>
          <p style={{ margin: '4px 0 0', color: '#78716c' }}>Manage authorized driver credentials and system access.</p>
        </div>

        <div className="responsive-grid form-first">
          
          {/* Driver List */}
          <div style={{ background: '#fff', border: '1px solid #e7e5e4', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e7e5e4', background: '#fafaf9', fontWeight: 600, fontSize: 13, color: '#78716c' }}>
              REGISTERED DRIVERS ({drivers.length})
            </div>
            <div style={{ minHeight: 200 }}>
              {drivers.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#a8a29e' }}>No drivers registered yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e7e5e4', fontSize: 11, textTransform: 'uppercase', color: '#a8a29e' }}>
                      <th style={{ padding: '12px 20px' }}>Name</th>
                      <th style={{ padding: '12px 20px' }}>Login ID</th>
                      <th style={{ padding: '12px 20px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map((d, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f5f5f4', fontSize: 13 }}>
                        <td style={{ padding: '12px 20px', fontWeight: 600 }}>{d.name}</td>
                        <td style={{ padding: '12px 20px', color: '#57534e' }}>{d.login}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {confirmDelete === d.login ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => handleDelete(d.login)} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Confirm</button>
                                <button onClick={() => setConfirmDelete(null)} style={{ background: '#e7e5e4', color: '#1c1917', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => startEdit(d)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#78716c' }} title="Edit">
                                  <Edit2 size={16} />
                                </button>
                                <button onClick={() => setConfirmDelete(d.login)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }} title="Delete">
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
                {editingLogin ? <Edit2 size={18} color="#d97706" /> : <UserPlus size={18} color="#d97706" />} 
                {editingLogin ? 'Edit Driver' : 'Register New Driver'}
              </h3>
              {editingLogin && (
                <button onClick={resetForm} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a8a29e' }}>
                  <X size={18} />
                </button>
              )}
            </div>
            
            <form onSubmit={handleCreateOrUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Form fields same as before... */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#a8a29e' }} />
                  <input 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. John Smith"
                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>Login ID</label>
                <div style={{ position: 'relative' }}>
                  <Shield size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#a8a29e' }} />
                  <input 
                    type="text" 
                    value={login} 
                    onChange={e => setLogin(e.target.value)}
                    placeholder="e.g. driver_01"
                    disabled={!!editingLogin}
                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e7e5e4', fontSize: 14, boxSizing: 'border-box', background: editingLogin ? '#f5f5f4' : '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase' }}>
                  {editingLogin ? 'New Password (optional)' : 'Password'}
                </label>
                <div style={{ position: 'relative' }}>
                  <Key size={14} style={{ position: 'absolute', left: 12, top: 12, color: '#a8a29e' }} />
                  <input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)}
                    placeholder={editingLogin ? "Leave blank to keep current" : "••••••••"}
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
                <Save size={16} /> {loading ? 'Saving...' : (editingLogin ? 'Update Driver' : 'Create Credentials')}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
