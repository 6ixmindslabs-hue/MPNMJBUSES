import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '../../lib/supabase';
import { Driver } from '../../types';
import { useStore } from '../../store';
import { TableSkeleton } from '../ui/Skeleton';
import { ConfirmModal } from '../ui/Modal';
import { UserPlus, Trash2, Edit2, Phone, User, ShieldCheck, Mail, Lock, ChevronLeft, ChevronRight, UserX } from 'lucide-react';

const DriverTab = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const addToast = useStore((state) => state.addToast);
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Driver>({
    defaultValues: {
      status: 'active',
      phone: '',
      name: '',
      username: '',
      password: ''
    }
  });

  useEffect(() => {
    fetchDrivers();
    const sub = supabase.channel('drivers').on('postgres_changes' as any, { event: '*', table: 'drivers' }, fetchDrivers).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const fetchDrivers = async () => {
    setLoading(true);
    const { data } = await supabase.from('drivers').select('*').order('created_at', { ascending: false });
    if (data) setDrivers(data);
    setLoading(false);
  };

  const onSubmit = async (data: Driver) => {
    setIsSaving(true);
    const submitData: any = {
      name: data.name,
      username: data.username,
      phone: data.phone || '',
      status: data.status || 'active'
    };
    
    if (data.password) {
      submitData.password = data.password;
    }
    
    try {
      if (editingId) {
        const { error } = await supabase.from('drivers').update(submitData).eq('id', editingId);
        if (error) throw error;
        addToast('Driver updated');
        setEditingId(null);
      } else {
        const { error } = await supabase.from('drivers').insert([submitData]);
        if (error) throw error;
        addToast('Driver created');
      }
      reset();
      fetchDrivers();
    } catch (err: any) {
      addToast(err.message || 'Action failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (driver: Driver) => {
    setEditingId(driver.id!);
    reset({ 
      name: driver.name, 
      username: driver.username, 
      phone: driver.phone, 
      status: driver.status, 
      password: '' 
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from('drivers').delete().eq('id', deletingId);
      if (error) throw error;
      addToast('Driver deleted');
      fetchDrivers();
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
          <UserPlus size={18} className="text-gray-900" />
          <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Edit Driver' : 'Create Driver'}</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
             {/* Name Input */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium">Full Legal Name</label>
                <div className="relative flex items-center h-10">
                   <User className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <input 
                     {...register('name', { required: 'Name is required' })} 
                     className={`input-premium input-with-icon ${errors.name ? 'border-red-500' : ''}`} 
                     placeholder="John Doe" 
                   />
                </div>
                {errors.name && <p className="text-[10px] text-red-500">{errors.name.message}</p>}
             </div>

             {/* Phone Input */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium">Phone Number</label>
                <div className="relative flex items-center h-10">
                   <Phone className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <input 
                     {...register('phone')} 
                     className="input-premium input-with-icon" 
                     placeholder="+91 00000 00000" 
                   />
                </div>
             </div>

             {/* Username Input */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium">System Username</label>
                <div className="relative flex items-center h-10">
                   <Mail className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <input 
                     {...register('username', { required: 'Username is required' })} 
                     className={`input-premium input-with-icon lowercase ${errors.username ? 'border-red-500' : ''}`} 
                     placeholder="johndoe" 
                   />
                </div>
                {errors.username && <p className="text-[10px] text-red-500">{errors.username.message}</p>}
             </div>

             {/* Password Input */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium">Password {editingId && '(Leave blank to keep current)'}</label>
                <div className="relative flex items-center h-10">
                   <Lock className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <input 
                     type="password" 
                     {...register('password', { required: editingId ? false : 'Password is required' })} 
                     className={`input-premium input-with-icon ${errors.password ? 'border-red-500' : ''}`} 
                     placeholder="••••••••" 
                   />
                </div>
                {errors.password && <p className="text-[10px] text-red-500">{errors.password.message}</p>}
             </div>

             {/* Status Select */}
             <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-600 font-medium">Operational Status</label>
                <div className="relative flex items-center h-10">
                   <ShieldCheck className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                   <select {...register('status')} className="input-premium input-with-icon cursor-pointer">
                     <option value="active">Active</option>
                     <option value="inactive">Inactive</option>
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
                {isSaving ? 'Saving...' : editingId ? 'Update Driver' : 'Create Driver'}
             </button>
          </div>
        </form>
      </section>

      {/* Table Section */}
      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 uppercase tracking-tight">Operator Directory</h3>
            <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-100 px-2 py-1 rounded">Total: {drivers.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-[11px] font-semibold uppercase tracking-wider">
                <th className="px-6 py-3 border-b border-gray-200">Name</th>
                <th className="px-6 py-3 border-b border-gray-200">Contact</th>
                <th className="px-6 py-3 border-b border-gray-200 text-center">Status</th>
                <th className="px-6 py-3 border-b border-gray-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 italic md:not-italic">
              {loading ? (
                <TableSkeleton columns={4} rows={3} />
              ) : drivers.length === 0 ? (
                <tr>
                   <td colSpan={4} className="px-6 py-12 text-center text-gray-400 text-sm">
                      <div className="flex flex-col items-center gap-2">
                         <UserX size={32} strokeWidth={1.5} className="text-gray-300" />
                         <span>No drivers found.</span>
                      </div>
                   </td>
                </tr>
              ) : (
                drivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-900">{driver.name}</span>
                          <span className="text-xs text-gray-500 italic opacity-75">{driver.username}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">{driver.phone || 'N/A'}</td>
                    <td className="px-6 py-4 text-center">
                       <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                         driver.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                       }`}>
                         {driver.status}
                       </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex justify-end items-center gap-1">
                          <button onClick={() => handleEdit(driver)} className="btn-ghost" title="Modify Record">
                             <Edit2 size={16} />
                          </button>
                          <button onClick={() => setDeletingId(driver.id!)} className="btn-ghost hover:text-red-600" title="Delete Permanent">
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
        
        {!loading && drivers.length > 0 && (
           <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Showing 1 to {drivers.length} of {drivers.length} drivers</span>
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
        title="Delete Personnel Record"
        description="Are you sure you want to permanently remove this operator? This mission-critical deletion cannot be reversed."
      />
    </div>
  );
};

export default DriverTab;
