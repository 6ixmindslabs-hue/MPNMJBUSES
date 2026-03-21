import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '../../lib/supabase';
import { rebuildRouteGeometry } from '../../lib/routingApi';
import { Stop, Route } from '../../types';
import { useStore } from '../../store';
import { ConfirmModal } from '../ui/Modal';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Trash2, Clock, Globe, Edit2, Target, Info, SearchX, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';

// ── Icons ───────────────────────────────────────────────
const morningIcon = L.divIcon({
  html: `<div style="width:22px;height:22px;background:#f59e0b;border:2px solid #92400e;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.18);">
           <div style="width:8px;height:8px;background:#fff;border-radius:50%;"></div>
         </div>`,
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const eveningIcon = L.divIcon({
  html: `<div style="width:22px;height:22px;background:#1f2937;border:2px solid #111827;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.28);">
           <div style="width:8px;height:8px;background:#fff;border-radius:50%;"></div>
         </div>`,
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

type ShiftType = 'morning' | 'evening';

// ── Component ────────────────────────────────────────────
const StopTab = () => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewShift, setViewShift] = useState<ShiftType>('morning');

  const addToast = useStore((state) => state.addToast);
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<Stop & { schedule_type: ShiftType }>({
    defaultValues: { schedule_type: 'morning' }
  });

  const selectedRouteId = watch('route_id');
  const selectedShiftType = watch('schedule_type');
  const latValue = watch('latitude');
  const lngValue = watch('longitude');

  useEffect(() => { fetchRoutes(); }, []);
  useEffect(() => {
    if (selectedRouteId) fetchStops(selectedRouteId);
    else setAllStops([]);
  }, [selectedRouteId]);

  const fetchRoutes = async () => {
    const { data } = await supabase.from('routes').select('*');
    if (data) setRoutes(data);
  };

  const fetchStops = async (rid: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('stops')
      .select('*')
      .eq('route_id', rid)
      .order('schedule_type', { ascending: true })
      .order('arrival_time', { ascending: true });
    if (data) setAllStops(data);
    setLoading(false);
  };

  // Filtered stops for the current viewShift tab
  const filteredStops = allStops.filter(s => (s as any).schedule_type === viewShift);

  // Map markers for all stops, coloured by shift
  const MapHandler = () => {
    useMapEvents({
      click(e) {
        setValue('latitude', e.latlng.lat, { shouldValidate: true, shouldDirty: true });
        setValue('longitude', e.latlng.lng, { shouldValidate: true, shouldDirty: true });
      },
    });
    return null;
  };

  const onSubmit = async (data: any) => {
    setIsSaving(true);
    const { id, created_at, routes: _r, ...clean } = data;
    try {
      if (editingId) {
        const { error } = await supabase.from('stops').update(clean).eq('id', editingId);
        if (error) throw error;
        addToast('Checkpoint updated');
        setEditingId(null);
      } else {
        const { error } = await supabase.from('stops').insert([clean]);
        if (error) throw error;
        addToast(`${clean.schedule_type === 'morning' ? 'Morning' : 'Evening'} checkpoint added`);
      }
      try {
        const geometryResult = await rebuildRouteGeometry(clean.route_id, clean.schedule_type);
        if (geometryResult.ok) {
          addToast('Road geometry refreshed');
        } else if (geometryResult.pendingStops && geometryResult.message) {
          addToast(geometryResult.message);
        }
      } catch (geometryErr: any) {
        addToast(geometryErr.message || 'Stop saved, but geometry refresh failed.', 'error');
      }

      reset({ route_id: data.route_id, stop_name: '', latitude: null as any, longitude: null as any, arrival_time: '', schedule_type: data.schedule_type });
      fetchStops(data.route_id);
    } catch (err: any) {
      addToast(err.message || 'Action failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (stop: any) => {
    setEditingId(stop.id!);
    reset(stop);
    setViewShift(stop.schedule_type || 'morning');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const targetStop = allStops.find((stop) => stop.id === deletingId);

    try {
      const { error } = await supabase.from('stops').delete().eq('id', deletingId);
      if (error) throw error;
      addToast('Checkpoint removed');

      if (targetStop?.route_id && targetStop?.schedule_type) {
        try {
          const geometryResult = await rebuildRouteGeometry(targetStop.route_id, targetStop.schedule_type);
          if (geometryResult.ok) {
            addToast('Road geometry refreshed');
          } else if (geometryResult.pendingStops && geometryResult.message) {
            addToast(geometryResult.message);
          }
        } catch (geometryErr: any) {
          addToast(geometryErr.message || 'Stop removed, but geometry refresh failed.', 'error');
        }
      }

      if (selectedRouteId) fetchStops(selectedRouteId);
    } catch (err: any) {
      addToast(err.message || 'Deletion failed', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-[1280px]">

      {/* ── 40/60 FORM + MAP ─────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col lg:flex-row">

        {/* LEFT – Form (40%) */}
        <div className="w-full lg:w-[40%] p-6 border-r border-gray-100">
          <div className="flex items-center gap-2 mb-6">
            <Target size={18} className="text-gray-900" />
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Edit Checkpoint' : 'Add Checkpoint'}
            </h2>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Route */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-600 font-medium">Route Corridor</label>
              <select
                {...register('route_id', { required: 'Route required' })}
                className="input-premium appearance-none cursor-pointer text-xs font-bold uppercase"
              >
                <option value="">-- Select Route --</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.start_location} ➝ {r.end_location}
                  </option>
                ))}
              </select>
            </div>

            {/* Shift Selector (Morning / Evening) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-600 font-medium">Shift / Schedule Type</label>
              <div className="grid grid-cols-2 gap-3">
                <label className="cursor-pointer group">
                  <input
                    type="radio"
                    {...register('schedule_type', { required: 'Shift required' })}
                    value="morning"
                    className="peer sr-only"
                  />
                  <div className="peer-checked:bg-amber-50 peer-checked:border-amber-400 peer-checked:text-amber-700 bg-gray-50 border border-gray-200 rounded-lg h-[52px] flex items-center justify-center gap-2 group-hover:bg-amber-50/60 transition-all">
                    <Sun size={16} />
                    <span className="text-xs font-black uppercase tracking-widest">Morning</span>
                  </div>
                </label>
                <label className="cursor-pointer group">
                  <input
                    type="radio"
                    {...register('schedule_type', { required: 'Shift required' })}
                    value="evening"
                    className="peer sr-only"
                  />
                  <div className="peer-checked:bg-gray-900 peer-checked:border-gray-800 peer-checked:text-white bg-gray-50 border border-gray-200 rounded-lg h-[52px] flex items-center justify-center gap-2 group-hover:bg-gray-100 transition-all">
                    <Moon size={16} />
                    <span className="text-xs font-black uppercase tracking-widest">Evening</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Stop Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-600 font-medium">Checkpoint Name</label>
              <input
                {...register('stop_name', { required: 'Name required' })}
                className={`input-premium uppercase font-semibold text-xs ${errors.stop_name ? 'border-red-500' : ''}`}
                placeholder="Sector Gate A"
              />
              {errors.stop_name && <p className="text-[10px] text-red-500">{errors.stop_name.message}</p>}
            </div>

            {/* Arrival Time */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-600 font-medium">Arrival Time</label>
              <div className="relative flex items-center h-10">
                <Clock className="absolute left-3 text-gray-400 pointer-events-none" size={14} />
                <input
                  type="time"
                  {...register('arrival_time', { required: 'Time required' })}
                  className="input-premium input-with-icon font-bold tracking-widest text-xs"
                />
              </div>
            </div>

            {/* Lat / Lng */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center leading-none">Lat (X)</label>
                <input
                  type="number"
                  step="any"
                  {...register('latitude', { required: 'Required' })}
                  className="input-premium text-center font-bold text-xs"
                  placeholder="0.0000"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center leading-none">Lng (Y)</label>
                <input
                  type="number"
                  step="any"
                  {...register('longitude', { required: 'Required' })}
                  className="input-premium text-center font-bold text-xs"
                  placeholder="0.0000"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-gray-100 flex flex-col gap-3">
              <button
                type="submit"
                disabled={isSaving || !selectedRouteId}
                className="btn-primary w-full"
              >
                {isSaving ? 'Saving...' : editingId ? 'Update Checkpoint' : 'Add Checkpoint'}
              </button>
              {editingId && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => { setEditingId(null); reset(); }}
                  className="btn-secondary w-full"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* RIGHT – Map (60%) */}
        <div className="w-full lg:w-[60%] min-h-[420px] relative">
          <MapContainer center={[12.9716, 77.5946]} zoom={13} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapHandler />
            {/* Preview marker for the coordinate being set */}
            {latValue && lngValue && (
              <Marker
                position={[latValue, lngValue]}
                icon={selectedShiftType === 'morning' ? morningIcon : eveningIcon}
              />
            )}
            {/* All stored stops coloured by shift */}
            {allStops.map(s => (
              <Marker
                key={s.id}
                position={[s.latitude, s.longitude]}
                icon={(s as any).schedule_type === 'morning' ? morningIcon : eveningIcon}
              />
            ))}
          </MapContainer>

          {/* Map legend + instruction overlay */}
          <div className="absolute top-4 right-4 z-[500] bg-white shadow-lg border border-gray-200 rounded-lg px-4 py-3 min-w-[200px] pointer-events-none">
            <p className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-2">
              <Info size={10} className="inline mr-1" /> Click map to set location
            </p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-amber-700 shrink-0"></div>
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Morning</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-gray-900 border-2 border-gray-700 shrink-0"></div>
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Evening</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STOP LIST TABLE ──────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 uppercase tracking-tight">
            Checkpoint Assignment Log
          </h3>
          <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-100 px-2 py-1 rounded">
            Total: {allStops.length} nodes
          </span>
        </div>

        {/* Shift Toggle Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50/40">
          <button
            onClick={() => setViewShift('morning')}
            className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
              viewShift === 'morning'
                ? 'border-amber-500 text-amber-700 bg-amber-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Sun size={14} />
            Morning Shift
            <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-black ${
              viewShift === 'morning' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {allStops.filter(s => (s as any).schedule_type === 'morning').length}
            </span>
          </button>
          <button
            onClick={() => setViewShift('evening')}
            className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
              viewShift === 'evening'
                ? 'border-gray-900 text-white bg-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Moon size={14} />
            Evening Shift
            <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-black ${
              viewShift === 'evening' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {allStops.filter(s => (s as any).schedule_type === 'evening').length}
            </span>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto max-h-[420px]">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 text-gray-600 text-[11px] font-semibold uppercase tracking-wider">
                <th className="px-6 py-3 border-b border-gray-200">Seq</th>
                <th className="px-6 py-3 border-b border-gray-200">Checkpoint</th>
                <th className="px-6 py-3 border-b border-gray-200 text-center">Arrival</th>
                <th className="px-6 py-3 border-b border-gray-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center">
                    <div className="flex flex-col items-center gap-2 animate-pulse">
                      <div className="h-4 bg-gray-100 rounded w-48"></div>
                      <div className="h-4 bg-gray-100 rounded w-32"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredStops.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-3">
                      {viewShift === 'morning'
                        ? <Sun size={32} strokeWidth={1.5} className="text-amber-200" />
                        : <Moon size={32} strokeWidth={1.5} className="text-gray-200" />
                      }
                      <span className="text-sm italic">
                        No {viewShift} checkpoints defined for this corridor.
                      </span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        Add one using the form above ↑
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStops.map((stop, index) => (
                  <tr key={stop.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className={`text-xs font-black w-8 h-8 rounded flex items-center justify-center border ${
                        viewShift === 'morning'
                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : 'bg-gray-900 text-white border-gray-800'
                      }`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-gray-900 uppercase leading-none mb-1">{stop.stop_name}</p>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] flex items-center gap-1 font-mono">
                        <Globe size={9} strokeWidth={3} />
                        {stop.latitude?.toFixed(4)}, {stop.longitude?.toFixed(4)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold border tracking-widest shadow-sm ${
                        viewShift === 'morning'
                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : 'bg-gray-900 text-white border-gray-800'
                      }`}>
                        <Clock size={11} />
                        {stop.arrival_time}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(stop)} className="btn-ghost" title="Edit">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setDeletingId(stop.id!)} className="btn-ghost hover:text-red-600" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filteredStops.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">
              Showing {filteredStops.length} {viewShift} stops
            </span>
            <div className="flex items-center gap-1">
              <button disabled className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <div className="px-2 py-0.5 text-xs font-bold bg-gray-900 text-white rounded">1</div>
              <button disabled className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Remove Checkpoint"
        description="Are you sure you want to permanently remove this stop from the route sequence?"
      />
    </div>
  );
};

export default StopTab;
