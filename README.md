# MPNMJEC Bus Tracking System

Local workspace for the MPNMJEC transport platform:

- `backend` - Node.js/Express tracking API and WebSocket server
- `admin` - React/Vite admin dashboard
- `student_app` - Flutter student app
- `driver_app` - Flutter driver app

## Run Backend And Admin Locally

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

This starts:

- Backend: `http://localhost:3001`
- Backend health: `http://localhost:3001/health`
- Admin dashboard: `http://localhost:5173`

Admin dev login:

- Email: `admin@mpnmjec.edu.in`
- Password: `admin12345`

`backend/.env` and `admin/.env.local` are local-only files. They are created with placeholder Supabase values so the projects can boot locally. Replace these values with the real Supabase URL, service-role key, and anon key when you need live database-backed admin data.

## Run Student App Locally

Chrome or web:

```powershell
cd student_app
flutter run -d chrome
```

Android emulator:

```powershell
cd student_app
flutter run --dart-define=TRACKING_API_URL=http://10.0.2.2:3001 --dart-define=TRACKING_WS_URL=ws://10.0.2.2:3001/ws
```

## Run Driver App Locally

Chrome or web:

```powershell
cd driver_app
flutter run -d chrome
```

Android emulator:

```powershell
cd driver_app
flutter run --dart-define=TRACKING_API_URL=http://10.0.2.2:3001 --dart-define=TRACKING_WS_URL=ws://10.0.2.2:3001/ws
```

## Manual Setup Commands

If dependencies need to be refreshed:

```powershell
cd backend; npm ci
cd ..\admin; npm ci
cd ..\student_app; flutter pub get
cd ..\driver_app; flutter pub get
```
