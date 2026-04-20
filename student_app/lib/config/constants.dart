import 'package:flutter/foundation.dart';

class AppConfig {
  static const String _productionApiBase =
      'https://mpnmjec-trackingserver.onrender.com/api';
  static const String _productionWsBase =
      'wss://mpnmjec-trackingserver.onrender.com/ws';
  static const String _localWebApiBase = 'http://localhost:3001/api';
  static const String _localWebWsBase = 'ws://localhost:3001/ws';

  static String _normalizeApiBase(String value) {
    final normalized = value.endsWith('/')
        ? value.substring(0, value.length - 1)
        : value;
    return normalized.endsWith('/api') ? normalized : '$normalized/api';
  }

  static String get apiBase {
    const override = String.fromEnvironment('TRACKING_API_URL', defaultValue: '');
    if (override.isNotEmpty) {
      return _normalizeApiBase(override);
    }
    if (kIsWeb && !kReleaseMode) return _localWebApiBase;
    return _productionApiBase;
  }

  static String get wsBase {
    const override = String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    if (override.isNotEmpty) return override;
    if (kIsWeb && !kReleaseMode) return _localWebWsBase;
    return _productionWsBase;
  }

  static String get effectiveApiBase => apiBase;
  static String get effectiveWsBase => wsBase;

  // App Settings
  static const int refreshIntervalMs = 2000;
  static const double stopArrivalRadiusMeters = 50.0;
  
  // Design Colors (Amber/Yellow Premium Theme)
  static const int primaryColor = 0xFFF59E0B; // Amber
  static const int secondaryColor = 0xFFFACC15; // Yellow
  static const int bgLight = 0xFFF8FAFC;
  static const int textDark = 0xFF1E293B;
  static const int textMuted = 0xFF64748B;
  static const int success = 0xFF22C55E;
}
