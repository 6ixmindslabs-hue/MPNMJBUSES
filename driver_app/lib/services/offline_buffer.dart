// lib/services/offline_buffer.dart
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/constants.dart';

/// Manages offline buffering of GPS points when WebSocket is disconnected.
/// Points are stored in FlutterSecureStorage and flushed when connection is restored.
class OfflineGpsBuffer {
  static const String _storageKey = 'offline_gps_buffer';
  static const _storage = FlutterSecureStorage();

  /// Appends a GPS point to the persistent buffer.
  static Future<void> enqueue(Map<String, dynamic> point) async {
    final List<Map<String, dynamic>> existing = await getAll();

    if (existing.length >= AppConfig.offlineBufferMaxSize) {
      // Drop oldest to prevent memory bloat
      existing.removeAt(0);
    }

    existing.add(point);
    await _storage.write(key: _storageKey, value: jsonEncode(existing));
  }

  /// Returns all buffered points in order.
  static Future<List<Map<String, dynamic>>> getAll() async {
    final stored = await _storage.read(key: _storageKey);
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
    await _storage.delete(key: _storageKey);
  }

  /// Returns buffer size.
  static Future<int> size() async {
    final all = await getAll();
    return all.length;
  }
}
