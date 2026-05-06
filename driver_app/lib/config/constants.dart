class AppConfig {
  static const String _defaultBackendBase =
      'https://mpnmjec-backend.onrender.com/';

  static String _trimTrailingSlash(String value) {
    if (value.endsWith('/')) {
      return value.substring(0, value.length - 1);
    }
    return value;
  }

  static String get trackingServerUrl {
    const override =
        String.fromEnvironment('TRACKING_API_URL', defaultValue: '');
    const backendOverride =
        String.fromEnvironment('TRACKING_BACKEND_URL', defaultValue: '');
    if (override.isNotEmpty) {
      final normalized = _trimTrailingSlash(override);
      return normalized.endsWith('/api') ? normalized : '$normalized/api';
    }

    final backend = _trimTrailingSlash(
      backendOverride.isNotEmpty ? backendOverride : _defaultBackendBase,
    );
    return backend.endsWith('/api') ? backend : '$backend/api';
  }

  static String get trackingWsUrl {
    const override =
        String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    const backendOverride =
        String.fromEnvironment('TRACKING_BACKEND_URL', defaultValue: '');
    final value = _trimTrailingSlash(
      override.isNotEmpty
          ? override
          : backendOverride.isNotEmpty
              ? backendOverride
              : _defaultBackendBase,
    );
    if (value.endsWith('/ws')) return value;

    final backendBase =
        value.endsWith('/api') ? value.substring(0, value.length - 4) : value;
    final wsBase = backendBase.startsWith('https://')
        ? backendBase.replaceFirst('https://', 'wss://')
        : backendBase.startsWith('http://')
            ? backendBase.replaceFirst('http://', 'ws://')
            : backendBase;
    return '$wsBase/ws';
  }

  // Tracking settings
  static const int gpsIntervalMs = 2000;        // GPS every 2 seconds
  static const int wsReconnectDelayMs = 3000;   // Reconnect every 3 seconds on failure
  static const int offlineBufferMaxSize = 500;  // Max GPS points buffered offline
  static const double stopArrivalRadiusMeters = 80.0;
}
