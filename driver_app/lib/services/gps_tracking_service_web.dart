// lib/services/gps_tracking_service_web.dart
import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'ws_tracking_service.dart';

class GpsTrackingService {
  static final GpsTrackingService _instance = GpsTrackingService._internal();
  factory GpsTrackingService() => _instance;
  GpsTrackingService._internal();

  StreamSubscription<Position>? _positionSubscription;
  bool _isTracking = false;
  Position? _lastPosition;

  bool get isTracking => _isTracking;

  static Future<void> initForegroundTask() async {
    // No-op on Web
  }

  Future<bool> startTracking() async {
    if (_isTracking) return true;

    // Check permissions
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) return false;

    // Direct geolocator stream for web (no foreground task needed)
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    ).listen((Position pos) {
      _onNewPosition(pos);
    });

    _isTracking = true;
    return true;
  }

  void _onNewPosition(Position pos) {
    if (_lastPosition != null) {
      final double dist = Geolocator.distanceBetween(
        _lastPosition!.latitude, _lastPosition!.longitude,
        pos.latitude, pos.longitude,
      );
      final double timeDelta = (pos.timestamp.millisecondsSinceEpoch -
          _lastPosition!.timestamp.millisecondsSinceEpoch) / 1000.0;
      final double speedKmh = timeDelta > 0 ? (dist / timeDelta) * 3.6 : 0;
      if (speedKmh > 120) return;
    }

    _lastPosition = pos;

    final gpsPayload = {
      'latitude': pos.latitude,
      'longitude': pos.longitude,
      'timestamp': pos.timestamp.toIso8601String(),
      'speed': (pos.speed * 3.6),
      'heading': pos.heading,
      'accuracy': pos.accuracy,
    };

    WsTrackingService().sendGps(gpsPayload);
  }

  Future<void> stopTracking() async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    _isTracking = false;
    _lastPosition = null;
  }
}
