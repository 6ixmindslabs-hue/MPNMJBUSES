import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config/constants.dart';

class DriverAuthException implements Exception {
  const DriverAuthException(this.message);

  final String message;

  @override
  String toString() => message;
}

class DriverSession {
  const DriverSession({
    required this.token,
    required this.driver,
  });

  final String token;
  final Map<String, dynamic> driver;

  Map<String, dynamic> toJson() => {
        'token': token,
        'driver': driver,
      };

  factory DriverSession.fromJson(Map<String, dynamic> json) {
    return DriverSession(
      token: json['token'] as String,
      driver: Map<String, dynamic>.from(json['driver'] as Map),
    );
  }
}

class AuthService {
  static const String _sessionStorageKey = 'driver_session';
  static const _storage = FlutterSecureStorage();
  static DriverSession? _session;

  static Future<void> initialize() async {
    final storedSession = await _storage.read(key: _sessionStorageKey);

    if (storedSession == null || storedSession.isEmpty) {
      _session = null;
      return;
    }

    try {
      final decoded = jsonDecode(storedSession) as Map<String, dynamic>;
      _session = DriverSession.fromJson(decoded);
    } catch (_) {
      _session = null;
      await _storage.delete(key: _sessionStorageKey);
    }
  }

  static bool get isLoggedIn => _session != null;

  static Map<String, dynamic>? get currentDriver => _session?.driver;

  static String? get accessToken => _session?.token;

  static Future<void> signIn(String username, String password) async {
    final response = await http.post(
      Uri.parse('${AppConfig.trackingServerUrl}/auth/login'),
      headers: const {
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'username': username,
        'password': password,
      }),
    );

    final payload = _decodeJsonObject(response.body);

    if (response.statusCode != 200) {
      throw DriverAuthException(
        payload['error']?.toString() ?? 'Driver login failed',
      );
    }

    _session = DriverSession(
      token: payload['token'] as String,
      driver: Map<String, dynamic>.from(payload['driver'] as Map),
    );

    await _persistSession();
  }

  static Future<void> signOut() async {
    _session = null;
    await _storage.delete(key: _sessionStorageKey);
  }

  static Future<String?> getWsToken() async {
    final token = accessToken;
    if (token == null) return null;

    final response = await http.post(
      Uri.parse('${AppConfig.trackingServerUrl}/auth/ws-token'),
      headers: _authHeaders(token),
    );

    if (response.statusCode != 200) return null;

    final payload = _decodeJsonObject(response.body);
    return payload['token'] as String?;
  }

  static Future<Map<String, dynamic>?> getAssignedTrip() async {
    final token = accessToken;
    if (token == null) return null;

    final response = await http.get(
      Uri.parse('${AppConfig.trackingServerUrl}/drivers/me/assignment'),
      headers: _authHeaders(token),
    );

    if (response.statusCode == 404) {
      return null;
    }

    if (response.statusCode == 401) {
      await signOut();
      throw const DriverAuthException('Session expired. Please log in again.');
    }

    final payload = _decodeJsonObject(response.body);
    if (response.statusCode != 200) {
      throw DriverAuthException(
        payload['error']?.toString() ?? 'Could not load your assignment',
      );
    }

    return payload;
  }

  static Future<Map<String, dynamic>> startAssignedTrip(String scheduleId) async {
    final token = accessToken;
    if (token == null) {
      throw const DriverAuthException('Session expired. Please log in again.');
    }

    final response = await http.post(
      Uri.parse('${AppConfig.trackingServerUrl}/trips'),
      headers: _authHeaders(token),
      body: jsonEncode({'schedule_id': scheduleId}),
    );

    final payload = _decodeJsonObject(response.body);
    if (response.statusCode != 200) {
      throw DriverAuthException(
        payload['error']?.toString() ?? 'Could not start tracking',
      );
    }

    return payload;
  }

  static Future<void> completeTrip(String tripId) async {
    final token = accessToken;
    if (token == null) {
      throw const DriverAuthException('Session expired. Please log in again.');
    }

    final response = await http.patch(
      Uri.parse('${AppConfig.trackingServerUrl}/trips/$tripId/status'),
      headers: _authHeaders(token),
      body: jsonEncode({'status': 'completed'}),
    );

    final payload = _decodeJsonObject(response.body);
    if (response.statusCode != 200) {
      throw DriverAuthException(
        payload['error']?.toString() ?? 'Could not end tracking',
      );
    }
  }

  static Map<String, String> _authHeaders(String token) => {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      };

  static Map<String, dynamic> _decodeJsonObject(String body) {
    if (body.isEmpty) return <String, dynamic>{};
    return Map<String, dynamic>.from(jsonDecode(body) as Map);
  }

  static Future<void> _persistSession() async {
    if (_session == null) return;

    await _storage.write(
      key: _sessionStorageKey,
      value: jsonEncode(_session!.toJson()),
    );
  }
}
