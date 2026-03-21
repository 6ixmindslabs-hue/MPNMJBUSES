import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const TRACKING_API_URL = import.meta.env.VITE_TRACKING_API_URL || 'https://mpnmjec-trackingserver.onrender.com/api';
export const TRACKING_WS_URL = import.meta.env.VITE_TRACKING_WS_URL || 'wss://mpnmjec-trackingserver.onrender.com/ws';
