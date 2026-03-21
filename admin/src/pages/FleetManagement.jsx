import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Bus, Settings, Plus, Search, MapPin, MoreVertical, Trash2, Edit2, Shield, Users as UsersIcon, Fuel } from 'lucide-react';

const TRACKING_API_BASE = import.meta.env.VITE_TRACKING_API_URL || 'https://mpnmjec-trackingserver.onrender.com/api';

const FleetManagement = () => {
  const [buses, setBuses] = useState([]);
  const [liveTripByBus, setLiveTripByBus] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBus, setNewBus] = useState({ registration_number: '', capacity: '', status: 'active' });

  useEffect(() => {
    fetchBuses();
    fetchLiveTripStates();
  }, []);

  const fetchBuses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('buses')
      .select('*, drivers(license_number, users(full_name))');
    
    if (data) setBuses(data);
    setLoading(false);
  };

  const fetchLiveTripStates = async () => {
    try {
      const response = await fetch(`${TRACKING_API_BASE}/trips/active`);
      if (!response.ok) return;
      const trips = await response.json();
      const nextMap = {};
      for (const trip of trips) {
        const busId = trip?.schedules?.buses?.id;
        if (!busId) continue;
        nextMap[busId] = {
          is_online: !!trip.is_online,
          last_seen_at: trip.last_seen_at,
          delay_status: trip.delay_status,
          eta_minutes: trip.eta_minutes,
        };
      }
      setLiveTripByBus(nextMap);
    } catch {
      // Ignore transient failures; fleet table still renders from Supabase.
    }
  };

  const handleAddBus = async (e) => {
    e.preventDefault();
    const { data, error } = await supabase.from('buses').insert([newBus]).select();
    if (data) {
      setBuses([...buses, ...data]);
      setShowAddModal(false);
      setNewBus({ registration_number: '', capacity: '', status: 'active' });
    }
  };

  const filteredBuses = buses.filter(bus => 
    bus.registration_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = [
    { label: 'Total Fleet', value: buses.length, icon: Bus, color: 'bg-teal-500', light: 'bg-teal-50' },
    { label: 'Active Units', value: buses.filter(b => b.status === 'active').length, icon: Shield, color: 'bg-emerald-500', light: 'bg-emerald-50' },
    { label: 'In Maintenance', value: buses.filter(b => b.status === 'maintenance').length, icon: Settings, color: 'bg-amber-500', light: 'bg-amber-50' },
    { label: 'Total Capacity', value: buses.reduce((acc, b) => acc + (parseInt(b.capacity) || 0), 0), icon: UsersIcon, color: 'bg-indigo-500', light: 'bg-indigo-50' },
  ];

  return (
    <div className="space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Fleet Inventory
            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-full font-bold uppercase tracking-wider">Operational</span>
          </h2>
          <p className="text-slate-500 mt-1 font-medium italic">Manage and monitor MPNMJEC transport assets.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-slate-200 transition-all active:scale-95 group"
        >
          <div className="bg-white/20 p-1 rounded-lg group-hover:rotate-90 transition-transform">
            <Plus size={18} />
          </div>
          Register New Unit
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-premium group hover:border-teal-200 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.light} p-3 rounded-2xl`}>
                <stat.icon size={24} className={`text-slate-700`} />
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none bg-slate-50 px-2 py-1 rounded">{stat.label}</span>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-4xl font-black text-slate-900 tracking-tighter">{stat.value}</span>
              {stat.label.includes('Capacity') && <span className="text-sm font-bold text-slate-400 mb-2">Seats</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Main Table Content */}
      <div className="bg-white rounded-3xl shadow-premium border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search via Plate Number..."
              className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500/50 text-sm font-medium transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
             <button className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all border border-slate-200">Active</button>
             <button className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all border border-slate-200 border-dashed">All Units</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/30 text-slate-400 text-[10px] uppercase font-bold tracking-widest border-b border-slate-50">
                <th className="px-8 py-5">Unit Detail</th>
                <th className="px-8 py-5">Configuration</th>
                <th className="px-8 py-5">Assigned Operator</th>
                <th className="px-8 py-5">Maintenance Status</th>
                <th className="px-8 py-5 text-right">Settings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50/50 font-display">
              {loading ? (
                 <tr><td colSpan="5" className="px-8 py-20 text-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div><span className="text-slate-400 text-sm font-medium animate-pulse">Retrieving inventory...</span></div></td></tr>
              ) : filteredBuses.length === 0 ? (
                <tr><td colSpan="5" className="px-8 py-20 text-center text-slate-400 font-medium italic">No transport units match your search.</td></tr>
              ) : (
                filteredBuses.map((bus) => (
                  (() => {
                    const liveState = liveTripByBus[bus.id];
                    const isOnline = liveState ? liveState.is_online : null;
                    return (
                  <tr key={bus.id} className="hover:bg-teal-50/20 transition-all group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-teal-600 group-hover:shadow-lg transition-all border border-slate-100">
                          <Bus size={28} strokeWidth={1.5} />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-lg leading-tight tracking-tight uppercase">{bus.registration_number}</p>
                          <p className="text-[10px] text-slate-400 font-black tracking-widest uppercase mt-0.5 flex items-center gap-1.5"><Fuel size={10} className="text-slate-300"/> UNIT.{bus.id.substring(0, 6)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                       <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900">{bus.capacity} Seats</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Standard Class</span>
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       {bus.drivers?.[0] ? (
                         <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-[10px] text-white font-bold">
                             {bus.drivers[0].users.full_name.charAt(0)}
                           </div>
                           <div>
                             <p className="text-sm font-bold text-slate-900 leading-none">{bus.drivers[0].users.full_name}</p>
                             <p className="text-[10px] text-slate-400 font-bold mt-1 tracking-tight">Lic: {bus.drivers[0].license_number}</p>
                           </div>
                         </div>
                       ) : (
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">No Operator</span>
                       )}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                           <div className={`w-2 h-2 rounded-full ${bus.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`}></div>
                           <span className={`text-[10px] font-black uppercase tracking-widest ${
                            bus.status === 'active' ? 'text-emerald-700' : 'text-amber-700'
                          }`}>
                            {bus.status}
                          </span>
                        </div>
                        {isOnline !== null && (
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isOnline ? 'text-green-700' : 'text-red-700'}`}>
                              {isOnline ? 'online' : 'offline'}
                            </span>
                          </div>
                        )}
                        <div className="h-1 w-24 bg-slate-100 rounded-full overflow-hidden mt-1">
                           <div className={`h-full ${bus.status === 'active' ? 'w-[95%] bg-emerald-500' : 'w-[45%] bg-amber-500'}`}></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                        <button className="p-2.5 hover:bg-white hover:text-teal-600 hover:shadow-md rounded-xl text-slate-400 transition-all"><Edit2 size={16} /></button>
                        <button className="p-2.5 hover:bg-white hover:text-red-500 hover:shadow-md rounded-xl text-slate-400 transition-all"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                    );
                  })()
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modern Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in transition-all">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl glass p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                <Bus size={150} />
            </div>
            
            <div className="relative">
              <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Register Assets</h3>
              <p className="text-slate-500 text-sm font-medium mb-8">Add a new transit unit to the intelligent fleet.</p>
              
              <form onSubmit={handleAddBus} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 px-1">Registration Identifier</label>
                  <input 
                    required
                    type="text" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500/50 transition-all font-black text-slate-800 placeholder:text-slate-300 uppercase tracking-wider"
                    placeholder="KA-00-XX-0000"
                    value={newBus.registration_number}
                    onChange={e => setNewBus({...newBus, registration_number: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 px-1">Certified Capacity</label>
                  <div className="relative">
                    <input 
                      required
                      type="number" 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500/50 transition-all font-black text-slate-800 placeholder:text-slate-300"
                      placeholder="50"
                      value={newBus.capacity}
                      onChange={e => setNewBus({...newBus, capacity: e.target.value})}
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">Seats</span>
                  </div>
                </div>
                <div className="flex gap-4 pt-6">
                  <button 
                    type="button" 
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    Discard
                  </button>
                  <button 
                    type="submit" 
                    className="flex-[1.5] bg-teal-600 hover:bg-teal-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-teal-900/20 transition-all hover:-translate-y-1 active:scale-95"
                  >
                    Confirm Entry
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetManagement;
