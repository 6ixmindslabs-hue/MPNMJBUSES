import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, CheckCircle, Info, MessageSquare, Clock, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

const IncidentCenter = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel('incident_updates')
      .on('postgres_changes', { event: '*', table: 'alerts' }, fetchAlerts)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('alerts')
      .select('*, trips(id, status, buses(registration_number), routes(name), drivers:driver_id(users(full_name, phone_number)))')
      .order('created_at', { ascending: false });

    if (data) setAlerts(data);
    setLoading(false);
  };

  const resolveAlert = async (alertId) => {
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', alertId);
    
    if (!error) fetchAlerts();
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'panic_button': return <ShieldAlert className="text-red-600" size={20} />;
      case 'breakdown': return <AlertTriangle className="text-amber-600" size={20} />;
      case 'accident': return <ShieldAlert className="text-red-600" size={20} />;
      case 'delay': return <Clock className="text-blue-600" size={20} />;
      default: return <Info className="text-slate-600" size={20} />;
    }
  };

  const getAlertBadge = (status) => {
    if (status === 'open') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Incident Control Center</h2>
          <p className="text-slate-500">Real-time monitoring of emergencies, breakdowns, and traffic delays.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500" />
              Active Incidents
            </h3>
          </div>

          <div className="divide-y divide-slate-100">
            {loading && alerts.length === 0 ? (
              <div className="p-12 text-center text-slate-400 italic">Scanning for incidents...</div>
            ) : alerts.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <CheckCircle size={40} className="mx-auto mb-3 text-green-200" strokeWidth={1} />
                <p>All units operating normally. No active incidents.</p>
              </div>
            ) : alerts.map((alert) => (
              <div key={alert.id} className={`p-6 flex gap-6 transition-colors ${alert.status === 'open' ? 'bg-red-50/30' : 'opacity-60'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                  alert.type === 'panic_button' ? 'bg-red-100 border-red-200' : 'bg-amber-100 border-amber-200'
                }`}>
                  {getAlertIcon(alert.type)}
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-black text-slate-900 uppercase tracking-tight">
                      {alert.type.replace('_', ' ')}
                    </h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${getAlertBadge(alert.status)}`}>
                      {alert.status}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {format(new Date(alert.created_at), 'HH:mm:ss a')} • {format(new Date(alert.created_at), 'MMM dd')}
                    </span>
                  </div>
                  
                  <p className="text-slate-700 text-sm font-medium">{alert.description}</p>
                  
                  {alert.trips && (
                    <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-slate-500">
                      <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                        <span className="text-slate-400 uppercase text-[9px]">Route</span>
                        {alert.trips.routes.name}
                      </div>
                      <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                        <span className="text-slate-400 uppercase text-[9px]">Vehicle</span>
                        {alert.trips.buses.registration_number}
                      </div>
                      <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                        <span className="text-slate-400 uppercase text-[9px]">Driver</span>
                        {alert.trips.drivers.users.full_name} ({alert.trips.drivers.users.phone_number})
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 justify-center">
                  {alert.status === 'open' && (
                    <button 
                      onClick={() => resolveAlert(alert.id)}
                      className="bg-slate-900 hover:bg-black text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-slate-900/10 transition-all active:scale-95"
                    >
                      Mark Resolved
                    </button>
                  )}
                  {alert.status === 'resolved' && (
                    <div className="text-[10px] text-slate-400 font-bold bg-slate-100 p-2 rounded-lg text-center">
                      Resolved<br/>{format(new Date(alert.resolved_at), 'HH:mm')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncidentCenter;
