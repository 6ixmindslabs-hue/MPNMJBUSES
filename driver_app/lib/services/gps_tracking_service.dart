// Export the correct implementation based on the platform.
export 'gps_tracking_service_web.dart'
    if (dart.library.io) 'gps_tracking_service_mobile.dart';
