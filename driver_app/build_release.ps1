<#
.SYNOPSIS
Builds the release App Bundle for the Google Play Store.

.DESCRIPTION
This script fetches dependencies, generates launcher icons, and runs the Flutter build command 
to create the final .aab file required by the Google Play Store.
#>

$AppDir = $PSScriptRoot

Write-Host "Setting up Play Store Build for driver_app..." -ForegroundColor Cyan

# 1. Get dependencies
Write-Host "`n[1/3] Getting Flutter dependencies..."
Set-Location $AppDir
flutter pub get
if ($LASTEXITCODE -ne 0) {
    Write-Error "flutter pub get failed."
    exit $LASTEXITCODE
}

# 2. Generate icons
Write-Host "`n[2/3] Generating Launcher Icons..."
dart run flutter_launcher_icons
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to generate launcher icons."
    exit $LASTEXITCODE
}

# 3. Build App Bundle
Write-Host "`n[3/3] Building Release App Bundle (.aab)..."
Write-Host "This might take a few minutes. Please wait..."
flutter build appbundle --release
if ($LASTEXITCODE -ne 0) {
    Write-Error "App Bundle build failed. Check the errors above."
    exit $LASTEXITCODE
}

Write-Host "`nSUCCESS! App Bundle generated." -ForegroundColor Green
Write-Host "You can find your .aab file at: " -NoNewline
Write-Host "$AppDir\build\app\outputs\bundle\release\app-release.aab" -ForegroundColor Yellow
