class AppConfig {
  static String get trackingServerUrl {
    const override = String.fromEnvironment('TRACKING_API_URL', defaultValue: '');
    if (override.isNotEmpty) {
      return override.endsWith('/api') ? override : '$override/api';
    }
    return 'https://mpnmjec-trackingserver.onrender.com/api';
  }

  static String get trackingWsUrl {
    const override = String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    if (override.isNotEmpty) return override;
    return 'wss://mpnmjec-trackingserver.onrender.com/ws';
  }

  // Tracking settings
  static const int gpsIntervalMs = 2000;        // GPS every 2 seconds
  static const int wsReconnectDelayMs = 3000;   // Reconnect every 3 seconds on failure
  static const int offlineBufferMaxSize = 500;  // Max GPS points buffered offline
  static const double stopArrivalRadiusMeters = 80.0;
}
