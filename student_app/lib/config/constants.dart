// lib/config/constants.dart
import 'package:flutter/foundation.dart';

class AppConfig {
  static String get apiBase => 'https://mpnmjec-trackingserver.onrender.com/api';
  static String get wsBase => 'wss://mpnmjec-trackingserver.onrender.com/ws';

  // Production Ready Environment
  static String get effectiveApiBase => apiBase;
  static String get effectiveWsBase => wsBase;

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
