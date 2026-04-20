class AppConfig {
  static const String _defaultApiBase =
      'https://mpnmjec-backend.onrender.com/api';
  static const String _defaultWsBase =
      'wss://mpnmjec-backend.onrender.com/ws';

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
    return _defaultApiBase;
  }

  static String get wsBase {
    const override = String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    if (override.isNotEmpty) return override;
    return _defaultWsBase;
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
