# 🚀 Deployment Guide: MPNMJEC Bus Tracking System

This guide will help you deploy the **Backend Tracking Server** and the **Admin Control Panel** to production using Render and Supabase.

---

## 1. Database Setup (Supabase)
Before deploying the code, you must set up your database:
1.  **Create a New Project**: Go to [Supabase](https://supabase.com/) and create a new project.
2.  **Apply Database Schema**:
    *   Navigate to the **SQL Editor** in the Supabase dashboard.
    *   Copy the contents of `admin/supabase_schema.sql` from this project.
    *   Paste it into the SQL Editor and click **Run**.
3.  **Get API Keys**:
    *   Go to **Project Settings** > **API**.
    *   Copy the **Project URL**, **anon public key**, and **service_role secret key**.

---

## 2a. Option A: Deployment on Render (Recommended Unified Approach)
We have provided a `render.yaml` file in the root directory that configures both services automatically.

1.  **Push your code** to GitHub or GitLab.
2.  **Log in to Render**: Go to [Render Dashboard](https://dashboard.render.com/).
3.  **New Blueprints**:
    *   Click **New +** > **Blueprint**.
    *   Connect your repository.
    *   Render will detect the `render.yaml` and show two services: `mpnmjec-tracking-server` and `mpnmjec-admin-panel`.
4.  **Configure Environment Variables**:
    Render will ask for values for the following keys:
    *   `SUPABASE_URL`: Your Supabase Project URL.
    *   `SUPABASE_ANON_KEY`: Your Supabase `anon` key.
    *   `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase `service_role` key (Backend only).
    *   `JWT_SECRET`: A random long string (Backend will generate one if left blank).
5.  **Deploy**: Click **Apply**.

---

## 2b. Option B: Split Deployment (Admin on Vercel + Backend on Render)
For maximum performance and edge serving, many teams deploy the Frontend on Vercel and the Backend on a persistent platform like Render.

### 📡 Backend (Render)
As discussed, **Vercel does NOT support WebSockets**, so you MUST host the Backend Tracking Server on Render.
1. Create a **New +** > **Web Service** on Render.
2. Connect your repo and set the **Root Directory** to `backend`.
3. Set the **Build Command** to `npm install` and **Start Command** to `node index.js`.
4. Add all environment variables from `backend/.env.example`.

### 🖥️ Admin Panel (Vercel)
Vercel is great for the React dashboard.
1. Connect your repo to **Vercel**.
2. Set the **Root Directory** to `admin`.
3. Vercel will auto-detect **Vite** settings.
4. Add environment variables from `admin/.env.example`:
    * `VITE_SUPABASE_URL`
    * `VITE_SUPABASE_ANON_KEY`
    * `VITE_TRACKING_API_URL`: Points to your Render backend URL (e.g., `https://.../api`)
    * `VITE_TRACKING_WS_URL`: Points to your Render backend WSS URL (e.g., `wss://.../ws`)

---

## 3. Post-Deployment Configuration (CRITICAL)
Once the services are deployed, you need to link them:

### A. Link Admin to Backend
1.  Find the URL of your **Backend Tracking Server** (e.g., `https://mpnmjec-tracking-server.onrender.com`).
2.  Go to the **Admin Panel** settings on Render > **Environment**.
3.  Update these variables:
    *   `VITE_TRACKING_API_URL`: `https://your-backend-url.onrender.com/api`
    *   `VITE_TRACKING_WS_URL`: `wss://your-backend-url.onrender.com/ws` (Note the `wss://`)
4.  Save changes. Render will rebuild the admin panel.

### B. Secure the Backend (CORS)
1.  Find the URL of your **Admin Panel** (e.g., `https://mpnmjec-admin-panel.onrender.com`).
2.  Go to the **Backend Server** settings on Render > **Environment**.
3.  Update `ALLOWED_ORIGINS` to your Admin Panel URL.
4.  Save changes.

---

## 4. Testing the Apps
Once deployed, update the `lib/config/constants.dart` (or equivalent) in your Flutter apps with the new production URLs and rebuild the apps.
