import 'package:flutter/foundation.dart';

class AppConfig {
  static const String _productionApiBase =
      'https://mpnmjec-trackingserver.onrender.com/api';
  static const String _productionWsBase =
      'wss://mpnmjec-trackingserver.onrender.com/ws';
  static const String _localWebApiBase = 'http://localhost:3001/api';
  static const String _localWebWsBase = 'ws://localhost:3001/ws';

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
    if (kIsWeb && !kReleaseMode) return _localWebApiBase;
    return _productionApiBase;
  }

  static String get trackingWsUrl {
    const override = String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    if (override.isNotEmpty) return _trimTrailingSlash(override);
    if (kIsWeb && !kReleaseMode) return _localWebWsBase;
    return _productionWsBase;
  }

  // Tracking settings
  static const int gpsIntervalMs = 2000;        // GPS every 2 seconds
  static const int wsReconnectDelayMs = 3000;   // Reconnect every 3 seconds on failure
  static const int offlineBufferMaxSize = 500;  // Max GPS points buffered offline
  static const double stopArrivalRadiusMeters = 80.0;
}
