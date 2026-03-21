// lib/services/offline_buffer.dart
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/constants.dart';

/// Manages offline buffering of GPS points when WebSocket is disconnected.
/// Uses SharedPreferences for safe memory sharing between main UI and background tracking isolates.
class OfflineGpsBuffer {
  static const String _storageKey = 'offline_gps_buffer';

  /// Appends a GPS point to the persistent buffer.
  static Future<void> enqueue(Map<String, dynamic> point) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    
    final List<Map<String, dynamic>> existing = await getAll();

    if (existing.length >= AppConfig.offlineBufferMaxSize) {
      // Drop oldest to prevent memory bloat
      existing.removeAt(0);
    }

    existing.add(point);
    await prefs.setString(_storageKey, jsonEncode(existing));
  }

  /// Returns all buffered points in order.
  static Future<List<Map<String, dynamic>>> getAll() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    final stored = prefs.getString(_storageKey);
    
    if (stored == null || stored.isEmpty) {
      return [];
    }
    try {
      final decoded = jsonDecode(stored) as List<dynamic>;
      return decoded.map((e) => e as Map<String, dynamic>).toList();
    } catch (e) {
      // If decoding fails, the buffer is corrupt. Clear it.
      await clear();
      return [];
    }
  }

  /// Clears the buffer after successful flush.
  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    await prefs.remove(_storageKey);
  }

  /// Returns buffer size.
  static Future<int> size() async {
    final all = await getAll();
    return all.length;
  }
}
