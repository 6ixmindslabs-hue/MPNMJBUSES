import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '../../lib/supabase';
import { Schedule, Route, Bus, Driver } from '../../types';
import { useStore } from '../../store';
import { TableSkeleton } from '../ui/Skeleton';
import { ConfirmModal } from '../ui/Modal';
import { Calendar, Clock, UserCheck, Trash2, Edit2, Link as LinkIcon, Compass, Activity, Sun, Moon, SearchX, ChevronLeft, ChevronRight } from 'lucide-react';

const TRACKING_API_BASE = import.meta.env.VITE_TRACKING_API_URL || 'https://mpnmjec-trackingserver.onrender.com/api';

const ScheduleTab = () => {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const addToast = useStore((state) => state.addToast);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<Schedule>();

  const selectedRouteId = watch('route_id');

  useEffect(() => {
    fetchData();
    const sub = supabase.channel('schedules').on('postgres_changes' as any, { event: '*', table: 'schedules' }, fetchData).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: routeData } = await supabase.from('routes').select('*');
    const { data: busData } = await supabase.from('buses').select('*').eq('status', 'active');
    const { data: driverData } = await supabase.from('drivers').select('*').eq('status', 'active');
    const { data: scheduleData } = await supabase.from('schedules').select('*, routes(start_location, end_location), buses(bus_number), drivers(name)').order('created_at', { ascending: false });
    
    if (routeData) setRoutes(routeData);
    if (busData) setBuses(busData);
    if (driverData) setDrivers(driverData);
    if (scheduleData) setSchedules(scheduleData);
    setLoading(false);
  };

  const onSubmit = async (data: Schedule) => {
    setIsSaving(true);
    const { id, created_at, ...updateData } = data as any;
    
    try {
      const validationRes = await fetch(`${TRACKING_API_BASE}/schedules/validate-assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: data.driver_id,
          bus_id: data.bus_id,
          schedule_id: editingId || null,
        }),
      });

      if (!validationRes.ok) {
        const payload = await validationRes.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || 'Selected driver/bus is already in an active trip');
      }

      if (editingId) {
        const { error } = await supabase.from('schedules').update(updateData).eq('id', editingId);
        if (error) throw error;
        addToast('Mission updated');
        setEditingId(null);
      } else {
        const { error } = await supabase.from('schedules').insert([data]);
        if (error) throw error;
        addToast('Mission assigned');
      }
      reset();
      fetchData();
    } catch (err: any) {
      addToast(err.message || 'Action failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (schedule: any) => {
    setEditingId(schedule.id);
    reset({
      route_id: schedule.route_id,
      bus_id: schedule.bus_id,
      driver_id: schedule.driver_id,
      schedule_type: schedule.schedule_type,
      start_time: schedule.start_time,
      end_time: schedule.end_time
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from('schedules').delete().eq('id', deletingId);
      if (error) throw error;
      addToast('Mission purged');
      fetchData();
    } catch (err: any) {
      addToast(err.message || 'Deletion failed', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-[1280px]">
      <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Calendar size={18} className="text-gray-900" />
          <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Modify Strategy' : 'Sync Strategy (Plan)'}</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {/* Section 1: Route & Bus */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100 pb-1 flex items-center gap-2">
                  <Compass size={10} /> Protocols & Payload
               </h3>
               <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                     <label className="text-sm text-gray-600 font-medium">Corridor Assignment</label>
                     <select {...register('route_id', { required: 'Target corridor required' })} className="input-premium appearance-none cursor-pointer text-xs font-bold uppercase tracking-widest bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat">
                       <option value="">-- Choose Corridor --</option>
                       {routes.map(r => <option key={r.id} value={r.id}>{r.start_location} ➝ {r.end_location}</option>)}
                     </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                     <label className="text-sm text-gray-600 font-medium">Assigned Hardware (Bus)</label>
                     <select {...register('bus_id', { required: 'Hardware unit required' })} className="input-premium appearance-none cursor-pointer text-xs font-bold uppercase tracking-widest bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat">
                       <option value="">-- Choose Unit --</option>
                       {buses.map(b => <option key={b.id} value={b.id}>{b.bus_number} - {b.bus_name}</option>)}
                     </select>
                  </div>
               </div>
            </div>

            {/* Section 2: Driver */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100 pb-1 flex items-center gap-2">
                  <UserCheck size={10} /> Personnel Auth
               </h3>
               <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                     <label className="text-sm text-gray-600 font-medium tracking-tight">Commanding Operator</label>
                     <select {...register('driver_id', { required: 'Personnel link required' })} className="input-premium appearance-none cursor-pointer text-xs font-bold uppercase tracking-widest bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat">
                       <option value="">-- Choose Operator --</option>
                       {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                     </select>
                  </div>
               </div>
            </div>

            {/* Section 3: Timing */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100 pb-1 flex items-center gap-2">
                  <Clock size={10} /> Temporal Sync
               </h3>
               <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center leading-none italic">T-Start</label>
                    <input type="time" {...register('start_time', { required: 'X required' })} className="input-premium font-black text-xs text-center tracking-[0.1em]" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center leading-none italic">T-End</label>
                    <input type="time" {...register('end_time', { required: 'Y required' })} className="input-premium font-black text-xs text-center tracking-[0.1em]" />
                  </div>
               </div>
            </div>

            {/* Section 4: Block Type */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100 pb-1 flex items-center gap-2">
                  <Activity size={10} /> Mission Block
               </h3>
               <div className="grid grid-cols-2 gap-4">
                  <label className="relative cursor-pointer transition-all active:scale-95 group">
                     <input type="radio" {...register('schedule_type', { required: 'Block type required' })} value="morning" className="peer sr-only" />
                     <div className="peer-checked:bg-gray-900 peer-checked:text-white bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col items-center gap-2 group-hover:bg-gray-100 transition-colors shadow-sm">
                        <Sun size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Morning Shift</span>
                     </div>
                  </label>
                  <label className="relative cursor-pointer transition-all active:scale-95 group">
                     <input type="radio" {...register('schedule_type', { required: 'Block type required' })} value="evening" className="peer sr-only" />
                     <div className="peer-checked:bg-gray-900 peer-checked:text-white bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col items-center gap-2 group-hover:bg-gray-100 transition-colors shadow-sm">
                        <Moon size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Evening Shift</span>
                     </div>
                  </label>
               </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
             {editingId && (
               <button 
                 type="button" 
                 disabled={isSaving}
                 onClick={() => { setEditingId(null); reset(); fetchData(); }} 
                 className="btn-secondary"
               >
                 Cancel Override
               </button>
             )}
             <button 
               type="submit" 
               disabled={isSaving}
               className="btn-primary min-w-[120px]"
             >
                {isSaving ? 'Syncing...' : editingId ? 'Update Mission' : 'Establish Link'}
             </button>
          </div>
        </form>
      </section>

      {/* Sync Log */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 uppercase tracking-tight italic">Mission Synchronization Protocol</h3>
            <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-100 px-2 py-1 rounded">Log: {schedules.length} Blocks</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-display">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-[11px] font-semibold uppercase tracking-wider">
                <th className="px-6 py-3 border-b border-gray-200">Block</th>
                <th className="px-6 py-3 border-b border-gray-200">Operational Vector</th>
                <th className="px-6 py-3 border-b border-gray-200">Allocated Assets</th>
                <th className="px-6 py-3 border-b border-gray-200 text-center">T-Window</th>
                <th className="px-6 py-3 border-b border-gray-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 italic md:not-italic">
              {loading ? (
                <TableSkeleton columns={5} rows={3} />
              ) : schedules.length === 0 ? (
                <tr>
                   <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                         <SearchX size={32} strokeWidth={1.5} className="text-gray-300" />
                         <span className="text-sm">No mission records established.</span>
                      </div>
                   </td>
                </tr>
              ) : (
                schedules.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold relative transition-all border shadow-sm ${s.schedule_type === 'morning' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-gray-900 text-white border-gray-800'}`}>
                          {s.schedule_type === 'morning' ? <Sun size={18} /> : <Moon size={18} />}
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <p className="text-xs font-black text-gray-900 uppercase tracking-widest leading-none mb-1 italic">{s.routes?.start_location} ➝ {s.routes?.end_location}</p>
                       <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none">{s.schedule_type} link enabled</p>
                    </td>
                    <td className="px-6 py-4 space-y-1">
                       <div className="flex items-center gap-2">
                          <UserCheck size={10} className="text-gray-400" strokeWidth={3} />
                          <span className="text-[10px] font-bold text-gray-900 uppercase leading-none tracking-tight">{s.drivers?.name}</span>
                       </div>
                       <div className="flex items-center gap-2">
                          <LinkIcon size={10} className="text-gray-400" strokeWidth={3} />
                          <span className="text-[10px] font-bold text-gray-400 uppercase leading-none italic">Unit: {s.buses?.bus_number}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                       <div className="flex flex-col gap-1 items-center">
                          <span className="bg-gray-900 text-white px-2 py-0.5 rounded text-[10px] font-black border border-gray-800 uppercase italic shadow-sm">{s.start_time}</span>
                          <span className="text-[10px] font-black text-gray-400 uppercase italic">{s.end_time}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex justify-end items-center gap-1">
                          <button onClick={() => handleEdit(s)} className="btn-ghost" title="Modify Architecture">
                             <Edit2 size={16} />
                          </button>
                          <button onClick={() => setDeletingId(s.id)} className="btn-ghost hover:text-red-600" title="Purge Record">
                             <Trash2 size={16} />
                          </button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {!loading && schedules.length > 0 && (
           <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium italic">Showing {schedules.length} mission sync records</span>
              <div className="flex items-center gap-1">
                 <button disabled className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-all"><ChevronLeft size={16} /></button>
                 <div className="px-2 py-0.5 text-xs font-bold bg-gray-900 text-white rounded">1</div>
                 <button disabled className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-all"><ChevronRight size={16} /></button>
              </div>
           </div>
        )}
      </section>

      <ConfirmModal 
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Purge Operational Link"
        description="Are you sure you want to permanently decommission this mission block? Hardware and personnel allocations will be cleared."
      />
    </div>
  );
};

export default ScheduleTab;
