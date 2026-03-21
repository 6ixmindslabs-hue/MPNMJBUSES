import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, Mail, Lock, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { loginDev } = useAuth() as any;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 1. Try Dev Bypass First
    const success = loginDev(email, password);
    if (success) {
      setLoading(false);
      return;
    }

    // 2. Otherwise try real Supabase Auth
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
      }
    } catch (err: any) {
      setError('Connection refused. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6 selection:bg-gray-900 selection:text-white">
      <div className="w-full max-w-[400px]">
        {/* Brand System */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
             <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center text-white shadow-sm ring-4 ring-gray-900/5">
               <LayoutDashboard size={24} />
             </div>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Transport Admin Login</h1>
          <p className="text-sm text-gray-500 mt-1">Authorized personnel only</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-600 font-medium">Email Address</label>
              <div className="relative flex items-center h-10">
                <Mail className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-premium input-with-icon"
                  placeholder="admin@transit.os"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-600 font-medium">Password</label>
              <div className="relative flex items-center h-10">
                <Lock className="absolute left-3 text-gray-400 pointer-events-none" size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-premium input-with-icon tracking-[0.2em]"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-700 bg-red-50 p-3 rounded-lg border border-red-100 animate-slide-up">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span className="text-[11px] font-semibold leading-relaxed uppercase tracking-tight">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-11 text-sm font-bold uppercase tracking-widest shadow-sm translate-y-0 active:translate-y-0.5 transition-transform"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Authenticate Access</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer Audit Log Info */}
        <div className="mt-8 flex flex-col items-center gap-3">
           <div className="flex items-center gap-2 text-gray-400">
              <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] opacity-50">Operational Precision v4.2</span>
              <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
           </div>
           <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Terminal activities are logged for auditing</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
