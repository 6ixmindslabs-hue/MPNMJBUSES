# Driver App Play Console Declarations

Use this as copy-ready guidance when completing Play Console forms.

## App Access

The app requires credentials created by the MPNMJEC transport admin. Provide a demo driver login in Play Console App access if Google review needs to test the app.

## Location Permission

Purpose: live bus tracking during official MPNMJEC transport trips.

Why needed: the app sends the driver's bus location to the MPNMJEC tracking backend so students and transport admins can see active bus movement and trip progress.

Background location justification: tracking must continue during an active trip even if the driver locks the screen or briefly switches apps. Tracking is tied to active trip status and should stop when the trip is completed or cancelled.

## Foreground Service Permission

Purpose: keep active trip tracking reliable and visible to the driver while GPS updates are being sent.

## Notification Permission

Purpose: show foreground tracking/service status on Android versions that require notification permission.

## Data Safety Notes

- Location data: collected and transmitted for live bus tracking.
- User IDs/account info: driver account is used for authentication and assignment lookup.
- App activity: trip status changes are transmitted to the backend.
- Ads: no.
- Data selling: no.
- Data deletion: handled by MPNMJEC transport system administrators.
