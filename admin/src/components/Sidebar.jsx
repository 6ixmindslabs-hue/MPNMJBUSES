import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Bus, 
  Map as MapIcon, 
  Route, 
  LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const drawerItems = [
  { name: 'Fleet Management', path: '/fleet', icon: Bus },
  { name: 'Route Management', path: '/routes', icon: Route },
  { name: 'Trip Management', path: '/trips', icon: MapIcon },
];

const Sidebar = () => {
  const { profile, signOut } = useAuth();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 z-50">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-900/40">
          <Bus size={24} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-white font-bold tracking-tight text-lg leading-tight">MPNMJEC</h1>
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Transport OS</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1.5 mt-4">
        {drawerItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => twMerge(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
              isActive 
                ? "bg-primary-600/10 text-primary-400 border border-primary-600/20" 
                : "hover:bg-slate-800 hover:text-white border border-transparent"
            )}
          >
            <item.icon size={18} className={twMerge(
              "transition-colors",
              "group-hover:text-primary-400"
            )} />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 mt-auto border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-4 mb-2">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white border border-slate-600">
            {profile?.full_name?.charAt(0) || 'A'}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-white truncate">{profile?.full_name || 'Admin User'}</p>
            <p className="text-[10px] text-slate-500 font-medium uppercase truncate">{profile?.role?.replace('_', ' ') || 'Transport Admin'}</p>
          </div>
        </div>
        
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all border border-transparent"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
