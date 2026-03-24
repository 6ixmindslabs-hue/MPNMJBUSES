# MPNMJEC Transport Intelligence System — Project Report

## 1. Project Overview
The **MPNMJEC Transport Intelligence System** is a sophisticated, real-time fleet management and tracking solution designed for college transportation. It provides a seamless experience for three distinct user groups: **Admins** (oversight), **Drivers** (operational tracking), and **Students/Staff** (real-time arrival monitoring).

---

## 2. System Architecture
The system follows a modern, distributed architecture:
- **Backend Hub:** Central Node.js server handling WebSocket connections and trip lifecycle logic.
- **Data Layer:** Supabase (PostgreSQL) for persistent storage and real-time database subscriptions.
- **Admin Control Center:** React-based web dashboard for fleet management.
- **Mobile Ecosystem:** Flutter apps for both Drivers (GPS broadcasting) and Students (Live tracking).

---

## 3. Component Breakdown

### A. Backend (Tracking Server)
- **Role:** The "Brain" of the system.
- **Main Technologies:** `Node.js`, `Express`, `ws` (WebSockets), `jsonwebtoken`.
- **Core Logics:**
    - **Live Telemetry Ingestion:** Processes high-frequency GPS data from drivers via WebSockets.
    - **Trip Lifecycle Management:** Manages transition between `started`, `running`, `paused`, and `completed` states.
    - **Live Route Snap:** Snaps raw GPS points to the predefined route geometry to provide smooth UI updates.
    - **ETA & Delay Engine:** Calculates arrival times and delay statuses based on current speed and scheduled stop times.

### B. Admin Panel (Web)
- **Role:** Fleet, Personnel, and Strategy Management.
- **Main Technologies:** `React 19`, `Vite`, `Tailwind CSS`, `Leaflet` (Mapping), `Zustand` (State management).
- **Key Features:**
    - **Synergy Strategy (Scheduling):** Advanced scheduling system for Morning and Evening shifts. (Newly updated with Shift-Aware validation).
    - **Route & Stop Architect:** Point-and-click interface for defining corridors and passenger pickup points.
    - **Mission Monitor:** Real-time dashboard showing the status of all active hardware (buses) and operators (drivers).
    - **Fleet Simulator:** Allows admins to simulate bus movement for system testing.

### C. Driver App (Mobile)
- **Role:** Operational Gateway & GPS Broadcaster.
- **Main Technologies:** `Flutter`, `Geolocator`, `Flutter Foreground Task`.
- **Key Features:**
    - **Background Tracking:** Continues to stream GPS data even when the phone screen is off or the app is minimized.
    - **Shift Selection:** Simple interface for drivers to select their assigned route and start their "Mission."
    - **Real-time Status Sync:** Keeps the driver informed if they are on-route or delayed.

### D. Student App (Mobile)
- **Role:** Passenger Awareness & Live Tracking.
- **Main Technologies:** `Flutter`, `Flutter Map`, `AudioPlayers`.
- **Key Features:**
    - **Live Radar:** Real-time map view showing all active buses.
    - **Intelligent Search:** Quick filter by route name or shift type with local search history.
    - **Bus Alarm:** (Infrastructure ready) For notifying students when a bus is nearing their stop.
    - **ETA Transparency:** Shows exactly how many minutes away the bus is and its delay status.

---

## 4. Database Schema (Supabase)
The database is structured for high-performance tracking and historical auditing:
- `drivers`: Personnel records and authentication.
- `buses`: Hardware records (Capacity, Reg Number).
- `routes`: Geospacial corridors (Start/End locations).
- `stops`: Sequence-based passenger nodes with scheduled arrival times.
- `schedules`: The link between a Driver, Bus, and Route for a specific Shift.
- `trips`: Active instances of a schedule.
- `telemetry`: Historical GPS logs (latitude, longitude, speed, heading).

---

## 5. Core Business Logics

### I. Shift-Aware Assignment
Prevents administrative errors by ensuring a driver isn't double-booked for the same shift (Morning/Evening), while allowing them to be assigned to both shifts for a full day of operations.

### II. Dynamic ETA Logic
ETAs are recalculated on every GPS heartbeat (approx 3-5 seconds). The algorithm considers:
- Distances along the route path (not just "as the crow flies").
- Current vehicle speed.
- Configurable minimum speeds to prevent "infinite ETAs" when the bus is stopped.

### III. Path Smoothing & Snapping
Raw GPS signals are often "jittery." The backend uses Haversine calculations and projection math to snap the bus marker to the road, ensuring a premium visual experience for students.

---

## 6. Library & Tooling Report

| Component | Key Library | Purpose |
| :--- | :--- | :--- |
| **Backend** | `ws` | Real-time high-speed data transfer |
| **Backend** | `jsonwebtoken` | Secure driver authentication |
| **Admin** | `react-leaflet` | Interactive map rendering |
| **Admin** | `zustand` | Lightweight global state management |
| **Mobile** | `geolocator` | High-precision GPS access |
| **Mobile** | `flutter_map` | Open-source map tiling for mobile |
| **Mobile** | `shared_preferences` | Local storage for search history |

---

## 7. Operational Status
The project is currently in a state-of-the-art implementation phase, featuring premium UI aesthetics (glassmorphism/dark mode) and robust backend fail-safes (Active Trip Guards).
