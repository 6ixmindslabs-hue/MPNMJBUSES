import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Play, Database, Zap, Square } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Simulator = () => {
  const { isSimulating, startSim, stopSim } = useAuth();
  const [logs, setLogs] = useState([]);
  const [demoData, setDemoData] = useState(null);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, 50));
  };

  const bootstrapData = async () => {
    addLog('Bootstrapping demo database...', 'info');
    try {
      const { data: route } = await supabase.from('routes').select('*').limit(1).maybeSingle();
      let activeRoute = route;
      if (!activeRoute) {
        const { data: nr } = await supabase.from('routes').insert([{
          name: 'Campus Express (Demo)',
          polyline: [[12.9716, 77.5946], [13.0100, 77.6300]]
        }]).select().single();
        activeRoute = nr;
      }
      let { data: bus } = await supabase.from('buses').select('*').limit(1).maybeSingle();
      if (!bus) {
        const { data: nb } = await supabase.from('buses').insert([{ registration_number: 'KA-01-DEMO', status: 'active' }]).select().single();
        bus = nb;
      }
      let { data: trip } = await supabase.from('trips').select('*').eq('status', 'running').limit(1).maybeSingle();
      if (!trip) {
        const { data: nt } = await supabase.from('trips').insert([{ bus_id: bus.id, route_id: activeRoute.id, status: 'running' }]).select().single();
        trip = nt;
      }
      setDemoData({ trip });
      addLog('Environment ready for LIVE simulation.', 'success');
    } catch (e) {
      addLog('DB Seed failed (Using Virtual Mode instead)', 'warning');
    }
  };

  const handleStart = (virtual) => {
    if (virtual) {
      addLog('Starting PURE VIRTUAL simulation...', 'success');
      startSim();
    } else {
      if (!demoData) return addLog('Click Bootstrap first for Live mode!', 'error');
      addLog('Starting LIVE WebSocket simulation...', 'success');
      startSim(demoData.trip.id);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Operations Simulator</h2>
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
            <Database className="mx-auto mb-3 text-slate-400" />
            <h3 className="font-bold mb-2 text-sm">Real Database Simulation</h3>
            <button onClick={bootstrapData} className="w-full bg-slate-100 hover:bg-slate-200 py-2 rounded-lg text-xs font-bold mb-2">1. Seed Database</button>
            <button onClick={() => handleStart(false)} disabled={isSimulating} className="w-full bg-primary-600 hover:bg-primary-700 text-white py-2 rounded-lg text-xs font-bold transition-all">2. Start Live WS Bus</button>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm text-center bg-indigo-50/20">
            <Zap className="mx-auto mb-3 text-indigo-500" />
            <h3 className="font-bold mb-2 text-sm">Bypass (No-DB) Mode</h3>
            <button onClick={() => handleStart(true)} disabled={isSimulating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg text-sm font-bold shadow-lg shadow-indigo-900/10">Launch Instant Demo</button>
          </div>
          {isSimulating && (
            <button onClick={stopSim} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
              <Square size={16} /> Stop Simulation
            </button>
          )}
        </div>
        <div className="col-span-2 bg-slate-900 rounded-2xl p-4 font-mono text-[11px] h-[400px] overflow-y-auto">
          <p className="text-slate-500 mb-2 border-b border-white/5 pb-2 uppercase tracking-widest text-[9px]">Engine Status Ingest</p>
          {logs.map((l, i) => (
            <div key={i} className={`mb-1 ${l.type === 'success' ? 'text-green-400' : l.type === 'error' ? 'text-red-400' : 'text-slate-300'}`}>
              [{l.time}] {l.msg}
            </div>
          ))}
          {isSimulating && <div className="text-blue-400 animate-pulse mt-2">{">>> Streaming GPS Telemetry to Dashboard..."}</div>}
        </div>
      </div>
    </div>
  );
};

export default Simulator;
