// lib/config/constants.dart
import 'package:flutter/foundation.dart';

class AppConfig {
  static String get apiBase => 'http://localhost:3001/api';
  static String get wsBase => 'ws://localhost:3001/ws';

  // For Android Emulator to access local host
  static String get effectiveApiBase => kIsWeb ? apiBase : (defaultTargetPlatform == TargetPlatform.android ? 'http://10.0.2.2:3001/api' : apiBase);
  static String get effectiveWsBase => kIsWeb ? wsBase : (defaultTargetPlatform == TargetPlatform.android ? 'ws://10.0.2.2:3001/ws' : wsBase);

  // App Settings
  static const int refreshIntervalMs = 2000;
  static const double stopArrivalRadiusMeters = 50.0;
  
  // Design Colors (Lite Theme)
  static const int primaryColor = 0xFF2563EB; // Royal Blue
  static const int secondaryColor = 0xFF0EA5E9; // Sky Blue
  static const int bgLight = 0xFFF8FAFC;
  static const int textDark = 0xFF1E293B;
  static const int textMuted = 0xFF64748B;
  static const int success = 0xFF22C55E;
}
