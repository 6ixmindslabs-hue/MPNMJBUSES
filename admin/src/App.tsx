import React from 'react';
import { useAuth, AuthProvider } from './context/AuthContext';
import { useStore } from './store';
import DriverTab from './components/tabs/DriverTab';
import BusTab from './components/tabs/BusTab';
import RouteTab from './components/tabs/RouteTab';
import StopTab from './components/tabs/StopTab';
import ScheduleTab from './components/tabs/ScheduleTab';
import Login from './pages/Login';
import { ToastContainer } from './components/ui/Toast';
import { LogOut, User, LayoutDashboard } from 'lucide-react';

const ConfigurationPanel = () => {
  const { activeTab, setActiveTab } = useStore();
  const { signOut, user } = useAuth() as any;

  const tabs = [
    { id: 'Driver', label: 'Driver' },
    { id: 'Bus', label: 'Bus' },
    { id: 'Route', label: 'Route' },
    { id: 'Stops', label: 'Stops' },
    { id: 'Schedule', label: 'Schedule' }
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Sticky Header: 64px */}
      <header className="h-[64px] bg-white border-b border-gray-200 sticky top-0 z-[100] flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={20} className="text-gray-900" />
          <h1 className="text-lg font-semibold text-gray-900">Transport Admin Panel</h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <div className="text-right hidden sm:block">
                <p className="text-xs font-medium text-gray-900">{user?.email}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Administrator</p>
             </div>
             <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 border border-gray-200">
                <User size={16} />
             </div>
          </div>
          <button 
            onClick={signOut}
            className="text-gray-500 hover:text-red-600 transition-colors p-1"
            title="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Tab Navigation: Sticky under header */}
      <nav className="bg-white border-b border-gray-200 sticky top-[64px] z-[90] px-8">
        <div className="max-w-[1280px] mx-auto flex gap-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-4 text-sm font-medium border-b-2 transition-all relative ${
                activeTab === tab.id 
                  ? 'text-gray-900 border-gray-900' 
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Container: max-width 1280px, center aligned, 32px padding */}
      <main className="flex-1 w-full max-w-[1280px] mx-auto p-8">
        <div className="animate-fade-in">
          {activeTab === 'Driver' && <DriverTab />}
          {activeTab === 'Bus' && <BusTab />}
          {activeTab === 'Route' && <RouteTab />}
          {activeTab === 'Stops' && <StopTab />}
          {activeTab === 'Schedule' && <ScheduleTab />}
        </div>
      </main>

      <ToastContainer />
    </div>
  );
};

function AppContent() {
  const { user, loading } = useAuth() as any;

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
           <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
           <p className="text-sm font-medium text-gray-600">Syncing resources...</p>
        </div>
      </div>
    );
  }

  return user ? <ConfigurationPanel /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
