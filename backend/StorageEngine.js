// ──────────────────────────────────────────────────────────
// StorageEngine — Supabase Backend (Persistent)
// ──────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[StorageEngine] Connected to Supabase Data Layer.');
} else {
  console.error('[StorageEngine] CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

export class StorageEngine {
  constructor() {}

  // --- Drivers ---
  async getDrivers() {
    if (!supabase) return [];
    const { data, error } = await supabase.from('drivers').select('*');
    if (error) { console.error('getDrivers:', error); return []; }
    return data.map(d => ({
      login: d.login,
      name: d.name,
      password: d.password,
      createdAt: d.created_at
    }));
  }
  
  async addDriver(driver) {
    if (!supabase) return;
    await supabase.from('drivers').insert([{
      login: driver.login,
      name: driver.name,
      password: driver.password,
      created_at: driver.createdAt || new Date().toISOString()
    }]);
  }
  
  async updateDriver(login, updatedData) {
    if (!supabase) return false;
    const payload = {};
    if (updatedData.name) payload.name = updatedData.name;
    if (updatedData.password) payload.password = updatedData.password;
    
    const { error } = await supabase.from('drivers').update(payload).eq('login', login);
    return !error;
  }
  
  async deleteDriver(login) {
    if (!supabase) return false;
    const { error } = await supabase.from('drivers').delete().eq('login', login);
    return !error;
  }

  // --- Buses ---
  async getBuses() {
    if (!supabase) return [];
    const { data, error } = await supabase.from('buses').select('*');
    if (error) { console.error('getBuses:', error); return []; }
    return data.map(b => ({
      busId: b.bus_id,
      status: b.status,
      registeredAt: b.registered_at
    }));
  }
  
  async addBus(bus) {
    if (!supabase) return;
    await supabase.from('buses').insert([{
      bus_id: bus.busId,
      status: bus.status || 'IDLE',
      registered_at: bus.registeredAt || new Date().toISOString()
    }]);
  }
  
  async updateBus(busId, updatedData) {
    if (!supabase) return false;
    const payload = {};
    if (updatedData.status) payload.status = updatedData.status;
    
    const { error } = await supabase.from('buses').update(payload).eq('bus_id', busId);
    return !error;
  }
  
  async deleteBus(busId) {
    if (!supabase) return false;
    const { error } = await supabase.from('buses').delete().eq('bus_id', busId);
    return !error;
  }

  // --- Routes ---
  async getRoutes() {
    if (!supabase) return [];
    const { data, error } = await supabase.from('routes').select('*');
    if (error) { console.error('getRoutes:', error); return []; }
    return data.map(r => ({
      routeId: r.route_id,
      name: r.name,
      stops: r.stops || [],
      createdAt: r.created_at
    }));
  }
  
  async addRoute(route) {
    if (!supabase) return;
    await supabase.from('routes').insert([{
      route_id: route.routeId,
      name: route.name,
      stops: route.stops || [],
      created_at: route.createdAt || new Date().toISOString()
    }]);
  }
  
  async updateRoute(routeId, updatedData) {
    if (!supabase) return false;
    const payload = {};
    if (updatedData.name) payload.name = updatedData.name;
    if (updatedData.stops) payload.stops = updatedData.stops;
    
    const { error } = await supabase.from('routes').update(payload).eq('route_id', routeId);
    return !error;
  }
  
  async deleteRoute(routeId) {
    if (!supabase) return false;
    const { error } = await supabase.from('routes').delete().eq('route_id', routeId);
    return !error;
  }

  // --- Assignments ---
  async getAssignments() {
    if (!supabase) return [];
    const { data, error } = await supabase.from('assignments').select('*');
    if (error) { console.error('getAssignments:', error); return []; }
    return data.map(a => ({
      busId: a.bus_id,
      driverId: a.driver_id,
      routeId: a.route_id,
      shiftDirection: a.shift_direction,
      updatedAt: a.updated_at
    }));
  }
  
  async updateAssignment(assignment) {
    if (!supabase) return;
    // Assignments acts as upset typically on bus_id
    const { error } = await supabase.from('assignments').upsert([{
      bus_id: assignment.busId,
      driver_id: assignment.driverId,
      route_id: assignment.routeId,
      shift_direction: assignment.shiftDirection || 'INBOUND',
      updated_at: new Date().toISOString()
    }], { onConflict: 'bus_id' });
    if (error) console.error('updateAssignment:', error);
  }
  
  async deleteAssignment(busId) {
    if (!supabase) return false;
    const { error } = await supabase.from('assignments').delete().eq('bus_id', busId);
    return !error;
  }
}
