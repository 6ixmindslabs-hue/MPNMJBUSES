class AppConfig {
  static const String _defaultApiBase =
      'https://mpnmjec-backend.onrender.com/api';
  static const String _defaultWsBase =
      'wss://mpnmjec-backend.onrender.com/ws';

  static String _trimTrailingSlash(String value) {
    if (value.endsWith('/')) {
      return value.substring(0, value.length - 1);
    }
    return value;
  }

  static String get trackingServerUrl {
    const override = String.fromEnvironment('TRACKING_API_URL', defaultValue: '');
    if (override.isNotEmpty) {
      final normalized = _trimTrailingSlash(override);
      return normalized.endsWith('/api') ? normalized : '$normalized/api';
    }
    return _defaultApiBase;
  }

  static String get trackingWsUrl {
    const override = String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    if (override.isNotEmpty) return _trimTrailingSlash(override);
    return _defaultWsBase;
  }

  // Tracking settings
  static const int gpsIntervalMs = 2000;        // GPS every 2 seconds
  static const int wsReconnectDelayMs = 3000;   // Reconnect every 3 seconds on failure
  static const int offlineBufferMaxSize = 500;  // Max GPS points buffered offline
  static const double stopArrivalRadiusMeters = 80.0;
}
