import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';
const DEFAULT_TRACKING_BACKEND_URL = 'https://mpnmjec-backend.onrender.com/';

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const normalizeApiUrl = (value) => {
  const normalized = trimTrailingSlash(value);
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
};

const normalizeWsUrl = (value) => {
  const normalized = trimTrailingSlash(value);
  const backendBase = normalized.endsWith('/api')
    ? normalized.slice(0, -4)
    : normalized;
  const wsBase = backendBase
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://');

  return wsBase.endsWith('/ws') ? wsBase : `${wsBase}/ws`;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const TRACKING_BACKEND_URL = trimTrailingSlash(
  import.meta.env.VITE_TRACKING_BACKEND_URL || DEFAULT_TRACKING_BACKEND_URL,
);
export const TRACKING_API_URL = normalizeApiUrl(
  import.meta.env.VITE_TRACKING_API_URL || TRACKING_BACKEND_URL,
);
export const TRACKING_WS_URL = normalizeWsUrl(
  import.meta.env.VITE_TRACKING_WS_URL || TRACKING_BACKEND_URL,
);
