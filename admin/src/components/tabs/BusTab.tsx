import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '../../lib/supabase';
import { Bus } from '../../types';
import { useStore } from '../../store';
import { TableSkeleton } from '../ui/Skeleton';
import { ConfirmModal } from '../ui/Modal';
import { Bus as BusIcon, Trash2, Edit2, ShieldAlert, Users, Settings, Fuel, SearchX, ChevronLeft, ChevronRight } from 'lucide-react';

const BusTab = () => {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const addToast = useStore((state) => state.addToast);
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Bus>({
    defaultValues: {
      status: 'active',
      bus_number: '',
      bus_name: '',
      capacity: 0
    }
  });

  useEffect(() => {
    fetchBuses();
    const sub = supabase.channel('buses').on('postgres_changes' as any, { event: '*', table: 'buses' }, fetchBuses).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const fetchBuses = async () => {
    setLoading(true);
    const { data } = await supabase.from('buses').select('*').order('created_at', { ascending: false });
    if (data) setBuses(data);
    setLoading(false);
  };

  const onSubmit = async (data: Bus) => {
    setIsSaving(true);
    const { id, created_at, ...updateData } = data as any;
    
    try {
      if (editingId) {
        const { error } = await supabase.from('buses').update(updateData).eq('id', editingId);
        if (error) throw error;
        addToast('Bus updated');
        setEditingId(null);
      } else {
        const { error } = await supabase.from('buses').insert([data]);
        if (error) throw error;
        addToast('Bus added');
      }
      reset();
      fetchBuses();
    } catch (err: any) {
      addToast(err.message || 'Action failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (bus: Bus) => {
    setEditingId(bus.id!);
    reset(bus);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from('buses').delete().eq('id', deletingId);
      if (error) throw error;
      addToast('Bus deleted');
      fetchBuses();
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
          <BusIcon size={18} className="text-gray-900" />
          <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Edit Asset' : 'Register Asset'}</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
             {/* Plate Number */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium tracking-tight">Registry Plate (Number)</label>
                <div className="relative flex items-center h-10">
                   <Fuel className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <input 
                     {...register('bus_number', { required: 'Plate number is required' })} 
                     className={`input-premium input-with-icon uppercase font-semibold ${errors.bus_number ? 'border-red-500' : ''}`} 
                     placeholder="KA-XX-0000" 
                   />
                </div>
                {errors.bus_number && <p className="text-[10px] text-red-500">{errors.bus_number.message}</p>}
             </div>

             {/* Asset nomenclature */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium tracking-tight">Asset Nomenclature (Name)</label>
                <div className="relative flex items-center h-10">
                   <Settings className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <input 
                     {...register('bus_name', { required: 'Name is required' })} 
                     className={`input-premium input-with-icon uppercase font-semibold text-xs ${errors.bus_name ? 'border-red-500' : ''}`} 
                     placeholder="Main Campus Service" 
                   />
                </div>
                {errors.bus_name && <p className="text-[10px] text-red-500">{errors.bus_name.message}</p>}
             </div>

             {/* Capacity */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium tracking-tight">Seating Capacity</label>
                <div className="relative flex items-center h-10">
                   <Users className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <input 
                     type="number" 
                     {...register('capacity', { required: 'Capacity is required', min: 1 })} 
                     className={`input-premium input-with-icon font-bold ${errors.capacity ? 'border-red-500' : ''}`} 
                     placeholder="50" 
                   />
                </div>
                {errors.capacity && <p className="text-[10px] text-red-500 font-medium">{String(errors.capacity.message)}</p>}
             </div>

             {/* Status */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium tracking-tight">Condition / Lifecycle</label>
                <div className="relative flex items-center h-10">
                   <ShieldAlert className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <select {...register('status')} className="input-premium input-with-icon cursor-pointer uppercase text-xs font-bold tracking-widest">
                     <option value="active">Active Sequence</option>
                     <option value="maintenance">Maintenance</option>
                     <option value="inactive">Locked / Deactivated</option>
                   </select>
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
                {isSaving ? 'Processing...' : editingId ? 'Update Asset' : 'Add Unit'}
             </button>
          </div>
        </form>
      </section>

      {/* Table Section */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 uppercase tracking-tight">Fleet Asset Directory</h3>
            <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-100 px-2 py-1 rounded">Units: {buses.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-display">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-[11px] font-semibold uppercase tracking-wider">
                <th className="px-6 py-3 border-b border-gray-200">Identifier</th>
                <th className="px-6 py-3 border-b border-gray-200">Specs</th>
                <th className="px-6 py-3 border-b border-gray-200 text-center">Lifecycle</th>
                <th className="px-6 py-3 border-b border-gray-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 italic md:not-italic">
              {loading ? (
                <TableSkeleton columns={4} rows={3} />
              ) : buses.length === 0 ? (
                <tr>
                   <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                         <SearchX size={32} strokeWidth={1.5} className="text-gray-300" />
                         <span className="text-sm">No transport assets registered.</span>
                      </div>
                   </td>
                </tr>
              ) : (
                buses.map((bus) => (
                  <tr key={bus.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="flex flex-col leading-none">
                          <span className="text-sm font-black text-gray-900 uppercase tracking-widest mb-1">{bus.bus_number}</span>
                          <span className="text-[10px] font-bold text-gray-500 uppercase opacity-75">{bus.bus_name}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-bold">
                       {bus.capacity}
                       <span className="text-[9px] font-black text-gray-400 uppercase ml-2 tracking-widest leading-none">P-Units</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                       <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest leading-none ${
                         bus.status === 'active' ? 'bg-green-50 text-green-700' : 
                         bus.status === 'maintenance' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                       }`}>
                         {bus.status}
                       </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex justify-end items-center gap-1">
                          <button onClick={() => handleEdit(bus)} className="btn-ghost" title="Modify Architecture">
                             <Edit2 size={16} />
                          </button>
                          <button onClick={() => setDeletingId(bus.id!)} className="btn-ghost hover:text-red-600" title="Purge Record">
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
        
        {!loading && buses.length > 0 && (
           <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Showing 1 to {buses.length} of {buses.length} units</span>
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
        title="Purge Asset Record"
        description="Are you sure you want to permanently decommission this hardware unit from the grid? This action is data-destructive."
      />
    </div>
  );
};

export default BusTab;
