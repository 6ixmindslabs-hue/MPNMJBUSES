$ErrorActionPreference = 'Stop'

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$backendDir = Join-Path $root 'backend'
$adminDir = Join-Path $root 'admin'

function Ensure-NodeModules {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path
  )

  if (-not (Test-Path -LiteralPath (Join-Path $Path 'node_modules'))) {
    Push-Location $Path
    try {
      npm ci
    } finally {
      Pop-Location
    }
  }
}

function Ensure-File {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [string] $Content
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
  }
}

Ensure-File -Path (Join-Path $backendDir '.env') -Content @'
NODE_ENV=development
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
JWT_SECRET=local-dev-secret-change-me
SUPABASE_URL=https://placeholder.supabase.co
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key
APP_TIMEZONE=Asia/Kolkata
BUS_OFFLINE_THRESHOLD_SECONDS=300
TRIP_DELAY_THRESHOLD_MINUTES=5
MIN_ETA_SPEED_KMH=18
STOP_ARRIVAL_RADIUS_METERS=80
'@

Ensure-File -Path (Join-Path $adminDir '.env.local') -Content @'
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder-anon-key
VITE_TRACKING_API_URL=https://mpnmjec-backend.onrender.com/api
VITE_TRACKING_WS_URL=wss://mpnmjec-backend.onrender.com/ws
'@

Ensure-NodeModules -Path $backendDir
Ensure-NodeModules -Path $adminDir

$backendCommand = "Set-Location -LiteralPath '$backendDir'; npm run dev"
$adminCommand = "Set-Location -LiteralPath '$adminDir'; npm run dev -- --host 0.0.0.0"

Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand
Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $adminCommand

Write-Output 'Started local services in two PowerShell windows.'
Write-Output 'Backend health: http://localhost:3001/health'
Write-Output 'Admin app:       http://localhost:5173'
Write-Output ''
Write-Output 'Admin tracking is configured for https://mpnmjec-backend.onrender.com by default.'
Write-Output 'For real admin data, replace the placeholder Supabase values in backend/.env and admin/.env.local.'
