import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Route, Plus, Search, Map as MapIcon, GripVertical, Save, Trash2, Navigation, MapPin as Pin, ChevronRight, Info } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const stopIcon = L.divIcon({
  html: `<div class="w-5 h-5 bg-white border-[3px] border-teal-600 rounded-full shadow-lg flex items-center justify-center">
           <div class="w-1.5 h-1.5 bg-teal-600 rounded-full"></div>
         </div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const RouteManager = () => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRouteData, setNewRouteData] = useState({ name: '', description: '', polyline: [] });

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    setLoading(true);
    const { data: routeData } = await supabase
      .from('routes')
      .select('*, route_stops(*, stops(*))')
      .order('created_at', { ascending: false });
    if (routeData) {
        setRoutes(routeData);
        if (routeData.length > 0) setSelectedRoute(routeData[0]);
    }
    setLoading(false);
  };

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        setNewRouteData(prev => ({
          ...prev,
          polyline: [...prev.polyline, [e.latlng.lat, e.latlng.lng]]
        }));
      },
    });
    return null;
  };

  const handleSaveRoute = async () => {
    const { data } = await supabase.from('routes').insert([{
      name: newRouteData.name,
      description: newRouteData.description,
      polyline: newRouteData.polyline
    }]).select();

    if (data) {
      setRoutes([data[0], ...routes]);
      setShowAddModal(false);
      setNewRouteData({ name: '', description: '', polyline: [] });
    }
  };

  return (
    <div className="h-full flex flex-col gap-8 pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Spatial Intelligence
            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md font-black uppercase tracking-widest">Routing</span>
          </h2>
          <p className="text-slate-500 mt-1 font-medium italic">Architect and optimize transit networks with precision.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-200 transition-all active:scale-95 group"
        >
          <div className="bg-white/20 p-1.5 rounded-xl group-hover:translate-x-1 transition-transform">
             <Navigation size={18} />
          </div>
          Initialize New Path
        </button>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-8 min-h-0">
        {/* Sidebar: Route List */}
        <div className="col-span-12 lg:col-span-4 bg-white rounded-[2.5rem] shadow-premium border border-slate-100 overflow-hidden flex flex-col">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between">
            <div>
               <h3 className="font-black text-slate-900 text-xl tracking-tight">Active Networks</h3>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Configured Transit Paths</p>
            </div>
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-indigo-600 font-black border border-slate-100 italic">
               {routes.length}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {loading ? (
               <div className="py-20 flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin"></div>
                  <p className="text-slate-400 text-sm font-bold animate-pulse">Synchronizing maps...</p>
               </div>
            ) : routes.map(route => (
              <div 
                key={route.id}
                onClick={() => setSelectedRoute(route)}
                className={`group p-6 rounded-[2rem] border-2 transition-all cursor-pointer relative overflow-hidden ${
                  selectedRoute?.id === route.id 
                    ? 'border-indigo-500 bg-indigo-50/30' 
                    : 'border-slate-50 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                {selectedRoute?.id === route.id && (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 -rotate-45 translate-x-16 -translate-y-16 rounded-full pointer-events-none"></div>
                )}
                
                <div className="flex justify-between items-start mb-4">
                   <div className={`p-3 rounded-2xl transition-all ${selectedRoute?.id === route.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-50 text-slate-400'}`}>
                      <Navigation size={20} strokeWidth={2.5} />
                   </div>
                   <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Network ID</span>
                      <span className="text-[11px] font-bold text-slate-600">RT-{route.id.substring(0,6)}</span>
                   </div>
                </div>

                <h4 className="font-black text-slate-900 text-lg tracking-tight group-hover:text-indigo-700 transition-colors uppercase">{route.name}</h4>
                <p className="text-xs text-slate-400 font-medium mt-1 line-clamp-1 italic">{route.description || 'No specialized mission briefing.'}</p>
                
                <div className="mt-6 pt-6 border-t border-slate-100 flex items-center gap-6">
                  <div className="flex flex-col">
                     <span className="text-lg font-black text-slate-900 leading-none">{route.route_stops?.length || 0}</span>
                     <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">Checkpoints</span>
                  </div>
                  <div className="w-[1px] h-8 bg-slate-100"></div>
                  <div className="flex flex-col">
                     <span className="text-lg font-black text-slate-900 leading-none">{route.polyline?.length || 0}</span>
                     <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">Nodes</span>
                  </div>
                  <div className="ml-auto">
                     <button className="w-8 h-8 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-100 transition-all shadow-sm">
                        <Trash2 size={14} />
                     </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Map Stage */}
        <div className="col-span-12 lg:col-span-8 bg-slate-100 rounded-[3rem] shadow-premium border-4 border-white overflow-hidden relative group">
          {selectedRoute ? (
             <>
               <MapContainer center={selectedRoute.polyline?.[0] || [12.9716, 77.5946]} zoom={14} className="h-full w-full grayscale-[0.2] contrast-[1.1]">
                 <TileLayer url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" />
                 <Polyline 
                    positions={selectedRoute.polyline || []} 
                    pathOptions={{ color: '#4f46e5', weight: 6, lineCap: 'round', lineJoin: 'round', dashArray: '1, 12' }} 
                 />
                 <Polyline 
                    positions={selectedRoute.polyline || []} 
                    pathOptions={{ color: '#4f46e5', weight: 3, opacity: 0.8 }} 
                 />

                 {selectedRoute.polyline?.[0] && (
                    <Marker position={selectedRoute.polyline[0]} icon={stopIcon}>
                        <Popup className="premium-popup">Start Point</Popup>
                    </Marker>
                 )}
                 {selectedRoute.polyline?.[selectedRoute.polyline.length - 1] && (
                    <Marker position={selectedRoute.polyline[selectedRoute.polyline.length - 1]} icon={stopIcon}>
                        <Popup className="premium-popup">End Point</Popup>
                    </Marker>
                 )}
               </MapContainer>
               
               {/* Floating Overlay */}
               <div className="absolute top-8 right-8 z-[500] glass p-6 rounded-[2rem] w-64 shadow-2xl border border-white/50 animate-in slide-in-from-right duration-500">
                  <div className="flex items-center gap-3 mb-4">
                     <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                        <Info size={16} />
                     </div>
                     <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Network Intel</span>
                  </div>
                  <div className="space-y-4">
                     <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Status</p>
                        <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">Live & Optimized</span>
                     </div>
                     <div className="h-[1px] bg-slate-100"></div>
                     <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic">
                        "{selectedRoute.description || 'Standard orbital route optimized for rapid transit.'}"
                     </p>
                  </div>
               </div>
             </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white">
               <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 mb-6 border border-slate-100">
                  <Navigation size={48} strokeWidth={1} />
               </div>
               <h3 className="text-2xl font-black text-slate-900 tracking-tight">Intelligence Map Idle</h3>
               <p className="text-sm font-medium mt-2 text-slate-400 italic">Select a network from the left to engage tactical view.</p>
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen Route Builder */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[1000] flex items-center justify-center p-8 animate-in zoom-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-7xl h-[90vh] shadow-2xl flex overflow-hidden border-8 border-white">
            <div className="w-96 p-10 flex flex-col bg-slate-50/80 glass-dark text-white relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>
              
              <h3 className="text-3xl font-black mb-2 tracking-tighter">Path Constructor</h3>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-10">Alpha-Phase Protocol</p>
              
              <div className="space-y-8 flex-1">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 px-1">Network Identifier</label>
                  <input 
                    type="text" 
                    placeholder="E.g. CAMPUS_ALPHA"
                    className="w-full bg-slate-800/50 border-2 border-slate-700/50 rounded-2xl py-4 px-6 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-black text-sm transition-all tracking-wider placeholder:text-slate-600"
                    value={newRouteData.name}
                    onChange={e => setNewRouteData({...newRouteData, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 px-1">Mission Strategy</label>
                  <textarea 
                    rows={4}
                    placeholder="Enter strategic route details..."
                    className="w-full bg-slate-800/50 border-2 border-slate-700/50 rounded-2xl py-4 px-6 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all resize-none placeholder:text-slate-600"
                    value={newRouteData.description}
                    onChange={e => setNewRouteData({...newRouteData, description: e.target.value})}
                  />
                </div>
                
                <div className="glass-dark p-6 rounded-2xl border border-white/5">
                  <div className="flex justify-between items-center mb-4">
                     <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Telemetry Nodes</span>
                     <span className="text-2xl font-black">{newRouteData.polyline.length}</span>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                     <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${Math.min(newRouteData.polyline.length * 10, 100)}%` }}></div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-3 italic">Minimum 2 nodes required for validation.</p>
                </div>
              </div>

              <div className="space-y-3 mt-8">
                {newRouteData.polyline.length > 0 && (
                   <button 
                     onClick={() => setNewRouteData(p => ({...p, polyline: p.polyline.slice(0, -1)}))}
                     className="w-full py-4 bg-slate-800/50 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all border border-slate-700/50 flex items-center justify-center gap-2 group"
                   >
                     <RefreshCw size={14} className="group-active:rotate-180 transition-transform" />
                     Rollback Last Sequence
                   </button>
                )}
                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 bg-transparent hover:bg-white/5 text-slate-400 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >Abort</button>
                  <button 
                    onClick={handleSaveRoute}
                    disabled={!newRouteData.name || newRouteData.polyline.length < 2}
                    className="flex-[1.5] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-20 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 transition-all group active:scale-95"
                  >Initiate Network</button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 bg-slate-900 relative z-0">
               <MapContainer center={[12.9716, 77.5946]} zoom={14} className="h-full w-full">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="grayscale invert opacity-80" />
                  <MapClickHandler />
                  <Polyline positions={newRouteData.polyline} color="#4f46e5" weight={6} opacity={0.6} dashArray="10, 15" />
                  <Polyline positions={newRouteData.polyline} color="#4f46e5" weight={3} />
                  {newRouteData.polyline.map((pos, i) => (
                     <Marker key={i} position={pos} icon={stopIcon} />
                  ))}
               </MapContainer>
               
               <div className="absolute inset-0 pointer-events-none border-[20px] border-black/10 ring-1 ring-inset ring-white/10"></div>
               <div className="absolute top-10 left-10 glass p-4 rounded-2xl z-[500] pointer-events-none flex items-center gap-3">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
                  <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest leading-none">Mapping Surface Active</span>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RouteManager;
