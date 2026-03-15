import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'db.json');

const INITIAL_DB = {
  drivers: [],
  buses: [],
  routes: [],
  assignments: []
};

export class StorageEngine {
  constructor() {
    this.db = INITIAL_DB;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        this.db = JSON.parse(data);
      } else {
        this.save();
      }
    } catch (err) {
      console.error('[StorageEngine] Load error:', err);
      this.db = INITIAL_DB;
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.db, null, 2));
    } catch (err) {
      console.error('[StorageEngine] Save error:', err);
    }
  }

  // --- Drivers ---
  getDrivers() { return this.db.drivers; }
  addDriver(driver) {
    this.db.drivers.push(driver);
    this.save();
  }
  updateDriver(login, updatedData) {
    const idx = this.db.drivers.findIndex(d => d.login === login);
    if (idx > -1) {
      this.db.drivers[idx] = { ...this.db.drivers[idx], ...updatedData };
      this.save();
      return true;
    }
    return false;
  }
  deleteDriver(login) {
    const originalLen = this.db.drivers.length;
    this.db.drivers = this.db.drivers.filter(d => d.login !== login);
    if (this.db.drivers.length !== originalLen) {
      this.save();
      return true;
    }
    return false;
  }

  // --- Buses ---
  getBuses() { return this.db.buses; }
  addBus(bus) {
    this.db.buses.push(bus);
    this.save();
  }
  updateBus(busId, updatedData) {
    const idx = this.db.buses.findIndex(b => b.busId === busId);
    if (idx > -1) {
      this.db.buses[idx] = { ...this.db.buses[idx], ...updatedData };
      this.save();
      return true;
    }
    return false;
  }
  deleteBus(busId) {
    const originalLen = this.db.buses.length;
    this.db.buses = this.db.buses.filter(b => b.busId !== busId);
    if (this.db.buses.length !== originalLen) {
      this.save();
      return true;
    }
    return false;
  }

  // --- Routes ---
  getRoutes() { return this.db.routes; }
  addRoute(route) {
    this.db.routes.push(route);
    this.save();
  }
  updateRoute(routeId, updatedData) {
    const idx = this.db.routes.findIndex(r => r.routeId === routeId);
    if (idx > -1) {
      this.db.routes[idx] = { ...this.db.routes[idx], ...updatedData };
      this.save();
      return true;
    }
    return false;
  }
  deleteRoute(routeId) {
    const originalLen = this.db.routes.length;
    this.db.routes = this.db.routes.filter(r => r.routeId !== routeId);
    if (this.db.routes.length !== originalLen) {
      this.save();
      return true;
    }
    return false;
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
    this.save();
  }
  deleteAssignment(busId) {
    const originalLen = this.db.assignments.length;
    this.db.assignments = this.db.assignments.filter(a => a.busId !== busId);
    if (this.db.assignments.length !== originalLen) {
      this.save();
      return true;
    }
    return false;
  }
}
