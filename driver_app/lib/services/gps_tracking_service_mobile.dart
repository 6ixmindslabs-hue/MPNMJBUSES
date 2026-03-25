import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import '../config/constants.dart';
import 'ws_tracking_service.dart';

// Top-level function to be executed by the background isolate
@pragma('vm:entry-point')
void startCallback() {
  if (!kIsWeb) {
    FlutterForegroundTask.setTaskHandler(GpsTaskHandler());
  }
}

class GpsTaskHandler extends TaskHandler {
  StreamSubscription<Position>? _positionSubscription;
  Position? _lastPosition;
  final WsTrackingService _wsTrackingService = WsTrackingService();
  DateTime? _lastConnectAttemptAt;

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    await _wsTrackingService.connectFromPersistedSession();

    final locationSettings = AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 0,
      intervalDuration: Duration(milliseconds: AppConfig.gpsIntervalMs),
      forceLocationManager: false,
    );

    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen((Position pos) {
      _onNewPosition(pos);
    });
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
      'speed': (pos.speed * 3.6), // Convert m/s to km/h
      'heading': pos.heading,
      'accuracy': pos.accuracy,
    };

    if (_wsTrackingService.state != WsConnectionState.ready) {
      final now = DateTime.now();
      final canRetry = _lastConnectAttemptAt == null ||
          now.difference(_lastConnectAttemptAt!).inSeconds >=
              (AppConfig.wsReconnectDelayMs ~/ 1000);
      if (canRetry) {
        _lastConnectAttemptAt = now;
        unawaited(_wsTrackingService.connectFromPersistedSession());
      }
    }

    unawaited(_wsTrackingService.sendGps(gpsPayload));
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    // This is called by the repeat interval. We are using the stream, so this can be empty.
  }

  @override
  Future<void> onDestroy(DateTime timestamp, {bool? isTimeout}) async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    _lastPosition = null;
  }
}


/// GPS Tracking Service
/// This class now manages the lifecycle of the background task.
class GpsTrackingService {
  static final GpsTrackingService _instance = GpsTrackingService._internal();
  factory GpsTrackingService() => _instance;
  GpsTrackingService._internal();

  bool _isTracking = false;

  bool get isTracking => _isTracking;

  Future<bool> isServiceRunning() {
    return FlutterForegroundTask.isRunningService;
  }

  /// Initialize foreground task notification (for background tracking)
  static Future<void> initForegroundTask() async {
    if (kIsWeb) return;

    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'mpnmjec_tracking_channel',
        channelName: 'MPNMJEC Bus Tracking',
        channelDescription: 'Active trip GPS tracking',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: true,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(5000),
        autoRunOnBoot: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
  }

  /// Start GPS tracking
  Future<bool> startTracking() async {
    if (await FlutterForegroundTask.isRunningService) {
      _isTracking = true;
      return true;
    }

    final foregroundStatus = await Permission.locationWhenInUse.request();
    if (foregroundStatus.isPermanentlyDenied || foregroundStatus.isDenied) {
      return false;
    }

    final backgroundStatus = await Permission.locationAlways.request();
    if (backgroundStatus.isPermanentlyDenied || backgroundStatus.isDenied) {
      return false;
    }

    final notificationStatus = await Permission.notification.request();
    if (notificationStatus.isPermanentlyDenied) {
      return false;
    }

    // Ensure initialization is done (just in case)
    await initForegroundTask();

    final result = await FlutterForegroundTask.startService(
      notificationTitle: 'MPNMJEC Bus Tracking Active',
      notificationText: 'Your trip is being tracked. Tap to open.',
      callback: startCallback,
    );

    if (result is ServiceRequestFailure) {
      return false;
    }

    _isTracking = true;
    return true;
  }

  /// Stop GPS tracking
  Future<void> stopTracking() async {
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.stopService();
    }
    _isTracking = false;
  }
}
