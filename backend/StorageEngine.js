// ──────────────────────────────────────────────────────────
// StorageEngine — In-Memory (Vercel-compatible)
//
// ⚠️  VERCEL NOTE: Serverless functions are stateless.
//     Data stored here survives only within the same warm
//     function instance. For persistent storage, migrate to
//     Supabase (already in your deps) or another DB.
// ──────────────────────────────────────────────────────────

// Load seed data from db.json at cold-start (read-only is fine)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'db.json');

function loadSeed() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (_) {}
  return { drivers: [], buses: [], routes: [], assignments: [] };
}

// Single in-process store — shared across requests in the same warm instance
const STORE = loadSeed();

export class StorageEngine {
  constructor() {
    this.db = STORE;
  }

  // No-op save — we're in-memory only on Vercel
  save() {}

  // --- Drivers ---
  getDrivers() { return this.db.drivers; }
  addDriver(driver) {
    this.db.drivers.push(driver);
  }
  updateDriver(login, updatedData) {
    const idx = this.db.drivers.findIndex(d => d.login === login);
    if (idx > -1) {
      this.db.drivers[idx] = { ...this.db.drivers[idx], ...updatedData };
      return true;
    }
    return false;
  }
  deleteDriver(login) {
    const originalLen = this.db.drivers.length;
    this.db.drivers = this.db.drivers.filter(d => d.login !== login);
    return this.db.drivers.length !== originalLen;
  }

  // --- Buses ---
  getBuses() { return this.db.buses; }
  addBus(bus) {
    this.db.buses.push(bus);
  }
  updateBus(busId, updatedData) {
    const idx = this.db.buses.findIndex(b => b.busId === busId);
    if (idx > -1) {
      this.db.buses[idx] = { ...this.db.buses[idx], ...updatedData };
      return true;
    }
    return false;
  }
  deleteBus(busId) {
    const originalLen = this.db.buses.length;
    this.db.buses = this.db.buses.filter(b => b.busId !== busId);
    return this.db.buses.length !== originalLen;
  }

  // --- Routes ---
  getRoutes() { return this.db.routes; }
  addRoute(route) {
    this.db.routes.push(route);
  }
  updateRoute(routeId, updatedData) {
    const idx = this.db.routes.findIndex(r => r.routeId === routeId);
    if (idx > -1) {
      this.db.routes[idx] = { ...this.db.routes[idx], ...updatedData };
      return true;
    }
    return false;
  }
  deleteRoute(routeId) {
    const originalLen = this.db.routes.length;
    this.db.routes = this.db.routes.filter(r => r.routeId !== routeId);
    return this.db.routes.length !== originalLen;
  }

  // --- Assignments ---
  getAssignments() { return this.db.assignments; }
  updateAssignment(assignment) {
    const idx = this.db.assignments.findIndex(a => a.busId === assignment.busId);
    if (idx > -1) {
      this.db.assignments[idx] = { ...this.db.assignments[idx], ...assignment };
    } else {
      this.db.assignments.push(assignment);
    }
  }
  deleteAssignment(busId) {
    const originalLen = this.db.assignments.length;
    this.db.assignments = this.db.assignments.filter(a => a.busId !== busId);
    return this.db.assignments.length !== originalLen;
  }
}
