class AppConfig {
  static String get apiBase {
    const override = String.fromEnvironment('TRACKING_API_URL', defaultValue: '');
    if (override.isNotEmpty) {
      return override.endsWith('/api') ? override : '$override/api';
    }
    return 'https://mpnmjec-trackingserver.onrender.com/api';
  }

  static String get wsBase {
    const override = String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    if (override.isNotEmpty) return override;
    return 'wss://mpnmjec-trackingserver.onrender.com/ws';
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
