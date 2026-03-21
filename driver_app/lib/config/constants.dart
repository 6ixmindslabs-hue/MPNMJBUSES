// lib/config/constants.dart
import 'package:flutter/foundation.dart';

class AppConfig {
  static String get trackingServerUrl {
    const override = String.fromEnvironment('TRACKING_API_URL', defaultValue: '');
    if (override.isNotEmpty) {
      return override.endsWith('/api') ? override : '$override/api';
    }

    if (kReleaseMode || !kIsWeb) {
      return 'https://mpnmjec-trackingserver.onrender.com/api';
    }

    if (kIsWeb) {
      final host = Uri.base.host.isEmpty ? 'localhost' : Uri.base.host;
      if (host != 'localhost') return 'https://mpnmjec-trackingserver.onrender.com/api';
      return 'http://localhost:3001/api';
    }

    return 'https://mpnmjec-trackingserver.onrender.com/api';
  }

  static String get trackingWsUrl {
    const override = String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    if (override.isNotEmpty) return override;

    if (kReleaseMode || !kIsWeb) {
      return 'wss://mpnmjec-trackingserver.onrender.com/ws';
    }

    if (kIsWeb) {
      final host = Uri.base.host.isEmpty ? 'localhost' : Uri.base.host;
      if (host != 'localhost') return 'wss://mpnmjec-trackingserver.onrender.com/ws';
      return 'ws://localhost:3001/ws';
    }

    return 'wss://mpnmjec-trackingserver.onrender.com/ws';
  }

  // Tracking settings
  static const int gpsIntervalMs = 2000;        // GPS every 2 seconds
  static const int wsReconnectDelayMs = 3000;   // Reconnect every 3 seconds on failure
  static const int offlineBufferMaxSize = 500;  // Max GPS points buffered offline
  static const double stopArrivalRadiusMeters = 80.0;
}
