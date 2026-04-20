# MPNMJEC Driver Store Listing

## App Name

MPNMJEC Driver

## Short Description

Trip management and live GPS tracking for MPNMJEC transport drivers.

## Full Description

MPNMJEC Driver helps authorized college transport drivers manage assigned trips and send live bus location updates to the MPNMJEC transport tracking system.

Drivers can sign in with credentials created by the transport admin, view their current assignment, start and end trip legs, and stream GPS updates while a college bus trip is active. The app supports foreground location tracking for active trips and offline buffering when network connectivity is temporarily unavailable.

Key features:

- Driver login for authorized transport staff
- View current bus and route assignment
- Start, pause, resume, and complete active trips
- Share live GPS updates for student bus tracking
- Buffer GPS updates during short network outages
- Continue tracking during an active trip using a foreground service

## Category

Maps & Navigation

## Contact Email

Replace with the official support email before publishing.

## Notes For Play Console Answers

- Ads: No
- App access: Requires driver credentials created in the admin panel
- Account creation: No self-service account creation
- Location: Uses driver device location only during transport tracking workflows
- Background location: Used only to continue live bus tracking while an active trip is running
- Notifications: Used for foreground tracking/service status on supported Android versions
- Data collection: Driver account information and trip telemetry are handled by the MPNMJEC tracking backend
- Backend: The app connects to `https://mpnmjec-backend.onrender.com`
