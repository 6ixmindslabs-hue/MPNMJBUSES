// lib/config/constants.dart
import 'package:flutter/foundation.dart';

class AppConfig {
  static String get trackingServerUrl {
    const override = String.fromEnvironment('TRACKING_API_URL', defaultValue: '');
    if (override.isNotEmpty) {
      return override.endsWith('/api') ? override : '$override/api';
    }

    if (kReleaseMode) {
      // TODO: Replace with your actual production backend URL
      return 'https://your-backend.com/api';
    }

    if (kIsWeb) {
      final host = Uri.base.host.isEmpty ? 'localhost' : Uri.base.host;
      return 'http://$host:3001/api';
    }

    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'http://10.0.2.2:3001/api',
      _ => 'http://localhost:3001/api',
    };
  }

  static String get trackingWsUrl {
    const override = String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    if (override.isNotEmpty) return override;

    if (kReleaseMode) {
      // TODO: Replace with your actual production WebSocket URL
      return 'wss://your-backend.com/ws';
    }

    if (kIsWeb) {
      final host = Uri.base.host.isEmpty ? 'localhost' : Uri.base.host;
      final scheme = Uri.base.scheme == 'https' ? 'wss' : 'ws';
      return '$scheme://$host:3001/ws';
    }

    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'ws://10.0.2.2:3001/ws',
      _ => 'ws://localhost:3001/ws',
    };
  }

  // Tracking settings
  static const int gpsIntervalMs = 2000;        // GPS every 2 seconds
  static const int wsReconnectDelayMs = 3000;   // Reconnect every 3 seconds on failure
  static const int offlineBufferMaxSize = 500;  // Max GPS points buffered offline
  static const double stopArrivalRadiusMeters = 80.0;
}
