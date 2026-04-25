<#
.SYNOPSIS
Generates a release keystore and the required key.properties file for the Flutter App.

.DESCRIPTION
This script uses the Java keytool utility to create a new keystore file (upload-keystore.jks) 
and then automatically generates the key.properties file configured for the Flutter build.
#>

$AndroidDir = $PSScriptRoot
$KeystorePath = Join-Path $AndroidDir "upload-keystore.jks"
$KeyPropertiesPath = Join-Path $AndroidDir "key.properties"

# Keystore configuration
$Alias = "upload"
$Password = "mpnmjecdriver123" # Default password, change if you want it more secure
$Validity = 10000

Write-Host "Checking if keystore already exists..."
if (Test-Path $KeystorePath) {
    Write-Warning "Keystore $KeystorePath already exists. Skipping keystore generation to prevent overwriting your existing keys."
} else {
    Write-Host "Generating new keystore at $KeystorePath"
    
    # Run keytool to generate keystore
    # We use basic defaults for the DNAME to make it fully automated
    $keytoolArgs = @(
        "-genkey", "-v", 
        "-keystore", $KeystorePath, 
        "-keyalg", "RSA", 
        "-keysize", "2048", 
        "-validity", $Validity, 
        "-alias", $Alias,
        "-storepass", $Password,
        "-keypass", $Password,
        "-dname", "CN=MPNMJEC Driver App, OU=Android, O=MPNMJEC, L=City, ST=State, C=IN"
    )
    
    & keytool @keytoolArgs
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to generate keystore. Make sure 'keytool' is in your PATH (installed with Java/Android Studio)."
        exit $LASTEXITCODE
    }
    
    Write-Host "Keystore generated successfully." -ForegroundColor Green
}

Write-Host "Generating key.properties..."
if (Test-Path $KeyPropertiesPath) {
    Write-Warning "key.properties already exists. Skipping to prevent overwriting."
} else {
    $KeystoreRelativePath = "upload-keystore.jks"
    $propertiesContent = @"
storePassword=$Password
keyPassword=$Password
keyAlias=$Alias
storeFile=$KeystoreRelativePath
"@

    Set-Content -Path $KeyPropertiesPath -Value $propertiesContent
    Write-Host "key.properties generated successfully." -ForegroundColor Green
}

Write-Host "`nDONE! App signing configuration is ready." -ForegroundColor Cyan
Write-Host "IMPORTANT: Back up upload-keystore.jks and key.properties to a secure location." -ForegroundColor Yellow
