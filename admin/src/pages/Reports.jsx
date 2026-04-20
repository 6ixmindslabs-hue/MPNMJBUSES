import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart3, Download, Calendar, Filter, FileText, TrendingUp, Users, Clock } from 'lucide-react';
import { format, subDays } from 'date-fns';

const Reports = () => {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ 
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  const fetchReport = useCallback(async () => {
    setLoading(true);
    // Fetch trips in date range
    const { data } = await supabase
      .from('trips')
      .select('*, buses(registration_number), routes(name), drivers:driver_id(users(full_name))')
      .gte('scheduled_start_time', `${dateRange.start}T00:00:00Z`)
      .lte('scheduled_start_time', `${dateRange.end}T23:59:59Z`)
      .order('scheduled_start_time', { ascending: false });

    if (data) setReportData(data);
    setLoading(false);
  }, [dateRange.end, dateRange.start]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const stats = {
    totalTrips: reportData.length,
    completedTrips: reportData.filter(t => t.status === 'completed').length,
    cancelledTrips: reportData.filter(t => t.status === 'cancelled').length,
    avgDelay: reportData.length > 0 ? (reportData.reduce((acc, t) => acc + (t.delay_minutes || 0), 0) / reportData.length).toFixed(1) : 0
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reports & Analytics</h2>
          <p className="text-slate-500">Analyze fleet performance, driver attendance, and trip reliability.</p>
        </div>
        <button className="bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-slate-900/10 transition-all active:scale-95">
          <Download size={18} />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <ReportStatCard icon={<FileText className="text-primary-600" size={20} />} label="Total Scheduled" value={stats.totalTrips} />
        <ReportStatCard icon={<TrendingUp className="text-green-600" size={20} />} label="Success Rate" value={`${stats.totalTrips > 0 ? Math.round((stats.completedTrips/stats.totalTrips)*100) : 0}%`} />
        <ReportStatCard icon={<Clock className="text-amber-600" size={20} />} label="Avg. Delay" value={`${stats.avgDelay}m`} />
        <ReportStatCard icon={<Users className="text-indigo-600" size={20} />} label="Drivers Active" value={new Set(reportData.map(t => t.driver_id)).size} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
            <Filter size={16} className="text-slate-400" />
            Date Filter
          </h3>
          <div className="flex items-center gap-3">
             <input 
               type="date" 
               className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600"
               value={dateRange.start}
               onChange={e => setDateRange({...dateRange, start: e.target.value})}
             />
             <span className="text-slate-400 font-bold">to</span>
             <input 
               type="date" 
               className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600"
               value={dateRange.end}
               onChange={e => setDateRange({...dateRange, end: e.target.value})}
             />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-black tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Date & Route</th>
                <th className="px-6 py-4">Vehicle</th>
                <th className="px-6 py-4">Driver</th>
                <th className="px-6 py-4">Performance</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan="5" className="p-12 text-center text-slate-400 italic">Compiling historical data...</td></tr>
              ) : reportData.length === 0 ? (
                <tr><td colSpan="5" className="p-12 text-center text-slate-400 italic">No records for this period</td></tr>
              ) : reportData.map((trip) => (
                <tr key={trip.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900 text-sm">{trip.routes?.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{format(new Date(trip.scheduled_start_time), 'MMM dd, yyyy')}</p>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-600">
                    {trip.buses?.registration_number}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-600">
                    {trip.drivers?.users?.full_name}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`text-[10px] font-black uppercase ${
                        (trip.delay_minutes || 0) > 10 ? 'text-red-500' : (trip.delay_minutes || 0) > 0 ? 'text-amber-500' : 'text-green-600'
                      }`}>
                        Delay: {trip.delay_minutes || 0}m
                      </span>
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${
                          (trip.delay_minutes || 0) > 10 ? 'bg-red-500' : (trip.delay_minutes || 0) > 0 ? 'bg-amber-500' : 'bg-green-500'
                        }`} style={{ width: `${Math.max(10, 100 - (trip.delay_minutes || 0) * 5)}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      trip.status === 'completed' ? 'bg-green-100 text-green-700' : 
                      trip.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {trip.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ReportStatCard = ({ icon, label, value }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
    <div className="p-3 bg-slate-50 rounded-xl">
      {icon}
    </div>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-xl font-black text-slate-900 leading-tight">{value}</p>
    </div>
  </div>
);

export default Reports;
