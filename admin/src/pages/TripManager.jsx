import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Map, Calendar, Clock, UserCheck, Play, Pause, Square, AlertCircle, RefreshCw, Sun, Moon, ArrowRight, User, Hash } from 'lucide-react';
import { format } from 'date-fns';

const TRACKING_API_BASE = import.meta.env.VITE_TRACKING_API_URL || 'https://mpnmjec-trackingserver.onrender.com/api';

const TripManager = () => {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTripMeta, setActiveTripMeta] = useState({});
  
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [assignForm, setAssignForm] = useState({ bus_id: '', driver_id: '' });

  useEffect(() => {
    fetchTrips();
    fetchResources();
    fetchActiveTripMeta();
    
    const channel = supabase
      .channel('trips_status_updates')
      .on('postgres_changes', { event: 'UPDATE', table: 'trips' }, fetchTrips)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const fetchTrips = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('trips')
      .select('*, buses(registration_number), routes(name), drivers:driver_id(users(full_name))')
      .order('scheduled_start_time', { ascending: false })
      .limit(50);
      
    if (data) setTrips(data);
    fetchActiveTripMeta();
    setLoading(false);
  };

  const fetchActiveTripMeta = async () => {
    try {
      const response = await fetch(`${TRACKING_API_BASE}/trips/active`);
      if (!response.ok) return;
      const activeTrips = await response.json();

      const metaByTripId = {};
      for (const trip of activeTrips) {
        metaByTripId[trip.id] = {
          trip_id: trip.id,
          is_online: !!trip.is_online,
          eta_minutes: trip.eta_minutes,
          delay_status: trip.delay_status,
          delay_minutes: trip.delay_minutes,
          driver_id: trip.schedules?.drivers?.id || trip.driver_id,
          bus_id: trip.schedules?.buses?.id || trip.bus_id,
        };
      }
      setActiveTripMeta(metaByTripId);
    } catch {
      // Keep stale snapshot until next successful refresh.
    }
  };

  const fetchResources = async () => {
    const { data: busData } = await supabase.from('buses').select('id, registration_number').eq('status', 'active');
    const { data: driverData } = await supabase.from('users').select('id, full_name').eq('role', 'driver');
    
    if (busData) setBuses(busData);
    if (driverData) setDrivers(driverData);
  };

  const openAssignModal = (trip) => {
    setSelectedTrip(trip);
    setAssignForm({ bus_id: trip.bus_id || '', driver_id: trip.driver_id || '' });
    setShowAssignModal(true);
  };

  const handleAssignTrip = async () => {
    const { error } = await supabase
      .from('trips')
      .update({ 
        bus_id: assignForm.bus_id, 
        driver_id: assignForm.driver_id,
        status: 'assigned' 
      })
      .eq('id', selectedTrip.id);
      
    if (!error) {
      setShowAssignModal(false);
      fetchTrips();
      fetchActiveTripMeta();
    }
  };

  const getStatusUI = (status) => {
    const map = {
      'created': { label: 'Scheduled', color: 'text-slate-500 bg-slate-100', dot: 'bg-slate-400' },
      'assigned': { label: 'Ready', color: 'text-blue-600 bg-blue-50 border-blue-100', dot: 'bg-blue-500' },
      'started': { label: 'Initiated', color: 'text-indigo-600 bg-indigo-50 border-indigo-100', dot: 'bg-indigo-500' },
      'running': { label: 'In Transit', color: 'text-emerald-600 bg-emerald-50 border-emerald-100', dot: 'bg-emerald-500 animate-pulse' },
      'paused': { label: 'Hold', color: 'text-amber-600 bg-amber-50 border-amber-100', dot: 'bg-amber-500' },
      'completed': { label: 'Finalized', color: 'text-slate-400 bg-slate-50', dot: 'bg-slate-300' },
      'cancelled': { label: 'Aborted', color: 'text-red-600 bg-red-50', dot: 'bg-red-500' },
    };
    return map[status] || map.created;
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Transit Sessions
            <div className="flex -space-x-1">
               <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
               <div className="w-2 h-2 rounded-full bg-emerald-500/50 animate-ping absolute"></div>
            </div>
          </h2>
          <p className="text-slate-500 mt-1 font-medium italic">Monitor execution lifecycle and mission status in real-time.</p>
        </div>
        <div className="flex gap-3">
           <div className="glass px-4 py-2 rounded-2xl flex items-center gap-3 border-slate-200">
              <Calendar size={18} className="text-slate-400" />
              <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{format(new Date(), 'MMMM dd, yyyy')}</span>
           </div>
           <button 
             onClick={fetchTrips}
             className="bg-white hover:bg-slate-50 border-2 border-slate-100 text-slate-600 p-3 rounded-2xl shadow-sm transition-all active:scale-95"
           >
             <RefreshCw size={20} className={loading && "animate-spin"} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading && trips.length === 0 ? (
           <div className="py-40 flex flex-col items-center justify-center bg-white rounded-[3rem] shadow-premium border border-slate-50">
              <div className="w-16 h-16 border-t-4 border-indigo-600 border-4 border-indigo-50 rounded-full animate-spin mb-6"></div>
              <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em] animate-pulse">Syncing Session Data...</p>
           </div>
        ) : trips.map((trip) => {
          const ui = getStatusUI(trip.status);
          const tripShift = trip.schedule_type || trip.shift || 'morning';
          const isMorning = tripShift === 'morning';
          const liveMeta = activeTripMeta[trip.id];
          
          return (
            <div key={trip.id} className="group bg-white rounded-[2.5rem] p-4 pr-10 border-2 border-slate-50 hover:border-indigo-100 shadow-premium transition-all flex flex-col lg:flex-row lg:items-center gap-8 relative overflow-hidden">
               {/* Shift Indicator Vertical Bar */}
               <div className={`absolute left-0 top-0 bottom-0 w-2 ${isMorning ? 'bg-amber-400' : 'bg-indigo-600'}`}></div>
               
               {/* Shift Icon */}
               <div className="flex items-center gap-6 lg:w-48 pl-4">
                  <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl ${isMorning ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200' : 'bg-gradient-to-br from-indigo-600 to-slate-900 shadow-indigo-200'}`}>
                     {isMorning ? <Sun size={32} strokeWidth={2.5} /> : <Moon size={32} strokeWidth={2.5} />}
                  </div>
                  <div>
                     <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isMorning ? 'text-amber-600' : 'text-indigo-600'}`}>{tripShift} Session</p>
                     <p className="text-lg font-black text-slate-900 leading-tight mt-1">{format(new Date(trip.scheduled_start_time), 'hh:mm a')}</p>
                  </div>
               </div>

               {/* Route Info */}
               <div className="flex-1">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                     <Hash size={12} className="opacity-50" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Route Network</span>
                  </div>
                  <h4 className="text-xl font-black text-slate-900 tracking-tight uppercase group-hover:text-indigo-600 transition-colors">{trip.routes?.name}</h4>
                  <p className="text-xs font-bold text-slate-400 mt-1">Operational ID: <span className="text-slate-600">{trip.id.substring(0, 12)}</span></p>
               </div>

               {/* Resource Assignment */}
               <div className="lg:w-64">
                  {trip.drivers && trip.buses ? (
                    <div className="space-y-3">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-[10px] text-white font-black shadow-lg">
                             {trip.buses.registration_number.substring(0, 2)}
                          </div>
                          <span className="text-sm font-black text-slate-900">{trip.buses.registration_number}</span>
                       </div>
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                             <User size={14} strokeWidth={2.5} />
                          </div>
                          <span className="text-sm font-bold text-slate-600">{trip.drivers.users.full_name}</span>
                       </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border-2 border-amber-100/50 p-4 rounded-3xl flex flex-col items-center gap-2 group/assign cursor-pointer hover:bg-amber-100 transition-all" onClick={() => openAssignModal(trip)}>
                        <UserCheck size={20} className="text-amber-600 animate-bounce" />
                        <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest text-center">Awaiting Assignment</span>
                    </div>
                  )}
               </div>

               {/* Status Badge */}
               <div className="lg:w-40 flex flex-col items-center lg:items-end gap-2">
                  <div className={`px-4 py-2 rounded-2xl flex items-center gap-2 border-2 ${ui.color}`}>
                     <div className={`w-2 h-2 rounded-full ${ui.dot}`}></div>
                     <span className="text-[10px] font-black uppercase tracking-widest">{ui.label}</span>
                  </div>
                  {liveMeta && (
                    <div className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${liveMeta.is_online ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {liveMeta.is_online ? 'ONLINE' : 'OFFLINE'}
                    </div>
                  )}
                  {liveMeta && (
                    <span className="text-[10px] font-bold text-slate-500">
                      ETA {liveMeta.eta_minutes ?? '-'}m • {liveMeta.delay_status || 'On Time'}
                    </span>
                  )}
                  {trip.actual_start_time && (
                      <span className="text-[10px] font-bold text-slate-400">Live since {format(new Date(trip.actual_start_time), 'HH:mm')}</span>
                  )}
               </div>

               {/* Action Area */}
               <div className="lg:w-20 flex justify-end">
                  <button 
                    onClick={() => openAssignModal(trip)}
                    className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-900 hover:text-white hover:shadow-xl transition-all active:scale-90"
                  >
                    <ArrowRight size={20} strokeWidth={3} />
                  </button>
               </div>
            </div>
          );
        })}
      </div>

      {/* Assignment Glass Modal */}
      {showAssignModal && selectedTrip && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl glass p-10 relative overflow-hidden border-8 border-white">
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                <Calendar size={150} />
            </div>
            
            <div className="relative">
              <h3 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter">Command Assignment</h3>
              <p className="text-slate-500 text-sm font-medium mb-8 italic">Link transit assets to the selected mission sequence.</p>
              
              <div className="bg-slate-50/50 border-2 border-slate-100 p-6 rounded-[2rem] mb-8 space-y-2">
                 <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-3">Target Objective</p>
                 <h4 className="text-xl font-black text-slate-900 uppercase leading-tight">{selectedTrip.routes?.name}</h4>
                 <div className="flex items-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                       <Clock size={14} />
                       {format(new Date(selectedTrip.scheduled_start_time), 'hh:mm a')}
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                       {(selectedTrip.schedule_type || selectedTrip.shift || 'morning')} Shift
                    </div>
                 </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 px-1">Tactical Unit (Bus)</label>
                  <select 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-black text-slate-800 text-sm tracking-wide appearance-none cursor-pointer"
                    value={assignForm.bus_id}
                    onChange={e => setAssignForm({...assignForm, bus_id: e.target.value})}
                  >
                    <option value="">Select Vehicle...</option>
                    {buses.map(b => (
                      <option key={b.id} value={b.id}>{b.registration_number}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 px-1">Commanding Operator (Driver)</label>
                  <select 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-black text-slate-800 text-sm tracking-wide appearance-none cursor-pointer"
                    value={assignForm.driver_id}
                    onChange={e => setAssignForm({...assignForm, driver_id: e.target.value})}
                  >
                    <option value="">Select Personnel...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4 pt-6">
                  <button 
                    onClick={() => setShowAssignModal(false)}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                  >Abort</button>
                  <button 
                    disabled={!assignForm.bus_id || !assignForm.driver_id}
                    onClick={handleAssignTrip}
                    className="flex-[1.5] bg-slate-900 hover:bg-black disabled:opacity-20 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 transition-all active:scale-95"
                  >Confirm Link</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripManager;
