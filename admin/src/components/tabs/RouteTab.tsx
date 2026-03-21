import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '../../lib/supabase';
import { Route } from '../../types';
import { useStore } from '../../store';
import { TableSkeleton } from '../ui/Skeleton';
import { ConfirmModal } from '../ui/Modal';
import { Navigation, MapPin, Trash2, Edit2, Hash, ArrowRight, Route as RouteIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const RouteTab = () => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const addToast = useStore((state) => state.addToast);
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Route>({
    defaultValues: {
      start_location: '',
      end_location: ''
    }
  });

  useEffect(() => {
    fetchRoutes();
    const sub = supabase.channel('routes').on('postgres_changes' as any, { event: '*', table: 'routes' }, fetchRoutes).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const fetchRoutes = async () => {
    setLoading(true);
    const { data } = await supabase.from('routes').select('*').order('created_at', { ascending: false });
    if (data) setRoutes(data);
    setLoading(false);
  };

  const onSubmit = async (data: Route) => {
    setIsSaving(true);
    const { id, created_at, ...updateData } = data as any;
    
    // Internal metadata gen
    updateData.route_name = `${data.start_location} - ${data.end_location}`;
    updateData.route_code = `RT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    try {
      if (editingId) {
        const { error } = await supabase.from('routes').update(updateData).eq('id', editingId);
        if (error) throw error;
        addToast('Architecture updated');
        setEditingId(null);
      } else {
        const { error } = await supabase.from('routes').insert([updateData]);
        if (error) throw error;
        addToast('Protocol established');
      }
      reset();
      fetchRoutes();
    } catch (err: any) {
      addToast(err.message || 'Action failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (route: Route) => {
    setEditingId(route.id!);
    reset({ 
      start_location: route.start_location, 
      end_location: route.end_location 
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from('routes').delete().eq('id', deletingId);
      if (error) throw error;
      addToast('Path purged');
      fetchRoutes();
    } catch (err: any) {
      addToast(err.message || 'Deletion failed', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-[1280px]">
      {/* Form Section */}
      <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Navigation size={18} className="text-gray-900" />
          <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Modify Corridors' : 'Establish Network'}</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
             {/* Origin */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium tracking-tight">Origin Hub (Start)</label>
                <div className="relative flex items-center h-10">
                   <MapPin className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <input 
                     {...register('start_location', { required: 'Origin hubs required' })} 
                     className={`input-premium input-with-icon uppercase font-semibold text-xs ${errors.start_location ? 'border-red-500' : ''}`} 
                     placeholder="CENTRAL DEPOT" 
                   />
                </div>
             </div>

             {/* Destination */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium tracking-tight">Target Terminal (End)</label>
                <div className="relative flex items-center h-10">
                   <MapPin className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <input 
                     {...register('end_location', { required: 'Target required' })} 
                     className={`input-premium input-with-icon uppercase font-semibold text-xs ${errors.end_location ? 'border-red-500' : ''}`} 
                     placeholder="SCIENCE PARK" 
                   />
                </div>
             </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
             {editingId && (
               <button 
                 type="button" 
                 disabled={isSaving}
                 onClick={() => { setEditingId(null); reset(); }} 
                 className="btn-secondary"
               >
                 Cancel
               </button>
             )}
             <button 
               type="submit" 
               disabled={isSaving}
               className="btn-primary"
             >
                {isSaving ? 'Processing...' : editingId ? 'Update Network' : 'Initialize Hubs'}
             </button>
          </div>
        </form>
      </section>

      {/* Table Section */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 uppercase tracking-tight">Routing Architecture</h3>
            <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-100 px-2 py-1 rounded">Protocol Grid: {routes.length} paths</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-display">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-[11px] font-semibold uppercase tracking-wider">
                <th className="px-6 py-3 border-b border-gray-200">System Code</th>
                <th className="px-6 py-3 border-b border-gray-200 text-center">Hub Sequence</th>
                <th className="px-6 py-3 border-b border-gray-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 italic md:not-italic">
              {loading ? (
                <TableSkeleton columns={3} rows={3} />
              ) : routes.length === 0 ? (
                <tr>
                   <td colSpan={3} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                         <RouteIcon size={32} strokeWidth={1.5} className="text-gray-300" />
                         <span className="text-sm italic">No routing protocols deployed.</span>
                      </div>
                   </td>
                </tr>
              ) : (
                routes.map((route) => (
                  <tr key={route.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2">
                          <Hash size={12} className="text-gray-400 opacity-50" />
                          <span className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">{route.route_code || 'RT-000'}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center justify-center gap-4">
                          <span className="text-[11px] font-black text-gray-900 uppercase tracking-tight italic bg-gray-50 px-3 py-1 rounded border border-gray-100">{route.start_location}</span>
                          <ArrowRight size={14} className="text-gray-400 shrink-0" />
                          <span className="text-[11px] font-black text-gray-900 uppercase tracking-tight italic bg-gray-100 px-3 py-1 rounded border border-gray-200">{route.end_location}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex justify-end items-center gap-1">
                          <button onClick={() => handleEdit(route)} className="btn-ghost" title="Modify Architecture">
                             <Edit2 size={16} />
                          </button>
                          <button onClick={() => setDeletingId(route.id!)} className="btn-ghost hover:text-red-600" title="Purge Record">
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
        
        {!loading && routes.length > 0 && (
           <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Showing {routes.length} architectural paths</span>
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
        title="Purge Operational Logic"
        description="Are you sure you want to permanently decommission this routing protocol? Mission sync will be disrupted."
      />
    </div>
  );
};

export default RouteTab;
