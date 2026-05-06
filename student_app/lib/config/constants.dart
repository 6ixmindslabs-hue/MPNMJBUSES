class AppConfig {
  static const String _defaultBackendBase =
      'https://mpnmjec-backend.onrender.com/';

  static String _trimTrailingSlash(String value) {
    return value.endsWith('/')
        ? value.substring(0, value.length - 1)
        : value;
  }

  static String _normalizeApiBase(String value) {
    final normalized = _trimTrailingSlash(value);
    return normalized.endsWith('/api') ? normalized : '$normalized/api';
  }

  static String _normalizeWsBase(String value) {
    final normalized = _trimTrailingSlash(value);
    if (normalized.endsWith('/ws')) return normalized;

    final backendBase = normalized.endsWith('/api')
        ? normalized.substring(0, normalized.length - 4)
        : normalized;
    final wsBase = backendBase.startsWith('https://')
        ? backendBase.replaceFirst('https://', 'wss://')
        : backendBase.startsWith('http://')
            ? backendBase.replaceFirst('http://', 'ws://')
            : backendBase;
    return '$wsBase/ws';
  }

  static String get apiBase {
    const apiOverride =
        String.fromEnvironment('TRACKING_API_URL', defaultValue: '');
    const backendOverride =
        String.fromEnvironment('TRACKING_BACKEND_URL', defaultValue: '');
    return _normalizeApiBase(
      apiOverride.isNotEmpty
          ? apiOverride
          : backendOverride.isNotEmpty
              ? backendOverride
              : _defaultBackendBase,
    );
  }

  static String get wsBase {
    const wsOverride =
        String.fromEnvironment('TRACKING_WS_URL', defaultValue: '');
    const backendOverride =
        String.fromEnvironment('TRACKING_BACKEND_URL', defaultValue: '');
    return _normalizeWsBase(
      wsOverride.isNotEmpty
          ? wsOverride
          : backendOverride.isNotEmpty
              ? backendOverride
              : _defaultBackendBase,
    );
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
