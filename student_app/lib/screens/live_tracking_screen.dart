import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../config/constants.dart';

class LiveTrackingScreen extends StatefulWidget {
  final Map<String, dynamic> trip;
  final Map<String, dynamic> stopInfo;

  const LiveTrackingScreen({
    required this.trip,
    required this.stopInfo,
    super.key,
  });

  @override
  State<LiveTrackingScreen> createState() => _LiveTrackingScreenState();
}

class _LiveTrackingScreenState extends State<LiveTrackingScreen>
    with SingleTickerProviderStateMixin {
  static const double _stopArrivalRadiusMeters = 80;
  static const double _stationarySpeedThresholdKmh = 3;
  static const double _microJitterThresholdMeters = 10;
  static const double _routeSnapThresholdMeters = 80;
  static const double _offRouteVisualThresholdMeters = 150;
  static const double _outlierJumpThresholdMeters = 450;
  static const int _minAnimationDurationMs = 700;
  static const int _maxAnimationDurationMs = 2200;
  static const int _animationBufferMs = 250;
  static const int _timelineDelayThresholdMinutes = 5;
  static const double _fallbackTimelineEtaSpeedKmh = 18;
  static const List<int> _alarmLeadMinuteOptions = [5, 10, 15];
  static const String _alarmEnabledPrefKey = 'student_stop_alarm_enabled';
  static const String _alarmLeadMinutesPrefKey =
      'student_stop_alarm_lead_minutes';

  final MapController _mapController = MapController();
  final Distance _distance = const Distance();
  final GlobalKey _timelineStackKey = GlobalKey();

  late final AnimationController _markerAnimationController;
  late final AudioPlayer _alarmPlayer;
  Timer? _pollingTimer;
  bool _loadingStops = true;
  bool _loadingLocation = true;
  bool _followBus = true;
  bool _mapReady = false;
  bool _hasLoadedFullGeometry = false;

  LatLng _displayBusLocation = const LatLng(12.9716, 77.5946);
  LatLng? _targetBusLocation;
  LatLng? _activeNextStopLocation;
  LatLng? _animationStartLocation;
  LatLng? _animationEndLocation;

  List<Map<String, dynamic>> _routeStops = [];
  List<LatLng> _fullRouteGeometry = [];
  List<LatLng> _activeRouteTailGeometry = [];
  List<LatLng> _activeRouteGeometry = [];

  String? _locationError;
  Map<String, dynamic>? _liveSnapshot;
  DateTime? _lastUpdatedAt;
  DateTime? _lastTelemetryTimestamp;
  int _nextStopIndex = 0;
  double _distanceToNextStopMeters = 0;
  double _remainingRouteDistanceMeters = 0;
  double _distanceToRouteMeters = 0;
  int _currentRouteDistanceMeters = 0;
  int? _etaMinutes;
  int _delayMinutes = 0;
  String _delayStatus = 'On Time';
  double _displayHeadingDeg = 0;
  double _targetHeadingDeg = 0;
  double _animationStartHeadingDeg = 0;
  double _animationEndHeadingDeg = 0;
  double _animationStartRouteDistanceMeters = 0;
  double _animationEndRouteDistanceMeters = 0;
  bool _timelineMeasurementScheduled = false;
  bool _needsTimelineMeasurement = true;
  List<GlobalKey> _timelineDotKeys = const [];
  Map<int, Offset> _timelineDotCenters = const {};
  bool _stopAlarmEnabled = false;
  int _alarmLeadMinutes = 5;
  bool _alarmTriggered = false;
  bool _alarmPlaying = false;

  @override
  void initState() {
    super.initState();
    _markerAnimationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: AppConfig.refreshIntervalMs),
    )..addListener(_handleMarkerAnimationTick);
    _alarmPlayer = AudioPlayer();
    unawaited(_initializeAlarmPreferences());
    _fetchLiveRoute(includeFullGeometry: true);
    _startLiveTracking();
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    _markerAnimationController.dispose();
    unawaited(_alarmPlayer.dispose());
    super.dispose();
  }

  void _startLiveTracking() {
    _pollingTimer = Timer.periodic(
      const Duration(milliseconds: AppConfig.refreshIntervalMs),
      (_) => _fetchLiveRoute(),
    );
  }

  void _centerOnBus({double? zoom}) {
    if (!_mapReady) return;
    final targetZoom = zoom ?? _mapController.camera.zoom;
    final centerDistance = _distanceMeters(
      _mapController.camera.center,
      _displayBusLocation,
    );
    final zoomDelta = (_mapController.camera.zoom - targetZoom).abs();
    if (centerDistance < 2 && zoomDelta < 0.01) return;
    _mapController.move(_displayBusLocation, targetZoom);
  }

  void _handleMapEvent(MapEvent event) {
    final isUserDriven = event.source != MapEventSource.mapController &&
        event.source != MapEventSource.nonRotatedSizeChange &&
        event.source != MapEventSource.custom;

    if (isUserDriven && _followBus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() => _followBus = false);
      });
    }
  }

  void _zoomBy(double delta) {
    if (!_mapReady) return;
    final nextZoom = (_mapController.camera.zoom + delta).clamp(5.0, 18.5);
    _mapController.move(_mapController.camera.center, nextZoom);
  }

  void _handleMarkerAnimationTick() {
    final start = _animationStartLocation;
    final end = _animationEndLocation;
    if (start == null || end == null) return;

    final t = Curves.easeOutCubic.transform(_markerAnimationController.value);
    final animatedLocation = _lerpLatLng(start, end, t);
    final animatedHeading = _interpolateAngle(
      _animationStartHeadingDeg,
      _animationEndHeadingDeg,
      t,
    );
    final animatedRouteDistance = _lerpDouble(
      _animationStartRouteDistanceMeters,
      _animationEndRouteDistanceMeters,
      t,
    );

    if (!mounted) return;
    setState(() {
      _displayBusLocation = animatedLocation;
      _displayHeadingDeg = animatedHeading;
      _currentRouteDistanceMeters = animatedRouteDistance.round();
      _activeRouteGeometry = _buildActiveRouteSegment(
        busLocation: animatedLocation,
        routeSegment: _activeRouteTailGeometry,
        nextStopLocation: _activeNextStopLocation,
      );
    });

    if (_followBus) {
      _centerOnBus();
    }
    _evaluateStopAlarm();
  }

  double _distanceMeters(LatLng a, LatLng b) {
    return _distance.as(LengthUnit.Meter, a, b);
  }

  LatLng _lerpLatLng(LatLng a, LatLng b, double t) {
    final clamped = t.clamp(0.0, 1.0).toDouble();
    return LatLng(
      a.latitude + (b.latitude - a.latitude) * clamped,
      a.longitude + (b.longitude - a.longitude) * clamped,
    );
  }

  double _lerpDouble(double a, double b, double t) {
    final clamped = t.clamp(0.0, 1.0).toDouble();
    return a + (b - a) * clamped;
  }

  double _normalizeAngle(double degrees) {
    final normalized = degrees % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  double _shortestAngleDelta(double from, double to) {
    var delta = (_normalizeAngle(to) - _normalizeAngle(from)) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
  }

  double _interpolateAngle(double from, double to, double t) {
    return _normalizeAngle(from + _shortestAngleDelta(from, to) * t);
  }

  double _bearingBetween(LatLng from, LatLng to) {
    final fromLat = from.latitude * math.pi / 180;
    final toLat = to.latitude * math.pi / 180;
    final deltaLng = (to.longitude - from.longitude) * math.pi / 180;

    final y = math.sin(deltaLng) * math.cos(toLat);
    final x = math.cos(fromLat) * math.sin(toLat) -
        math.sin(fromLat) * math.cos(toLat) * math.cos(deltaLng);

    return _normalizeAngle(math.atan2(y, x) * 180 / math.pi);
  }

  ({double x, double y}) _projectToMeters(LatLng origin, LatLng point) {
    final originLatRad = origin.latitude * math.pi / 180;
    return (
      x: ((point.longitude - origin.longitude) *
              math.pi *
              6371000 *
              math.cos(originLatRad)) /
          180,
      y: ((point.latitude - origin.latitude) * math.pi * 6371000) / 180,
    );
  }

  LatLng _projectFromMeters(LatLng origin, ({double x, double y}) point) {
    final originLatRad = origin.latitude * math.pi / 180;
    return LatLng(
      origin.latitude + (point.y / 6371000) * (180 / math.pi),
      origin.longitude +
          (point.x / (6371000 * math.cos(originLatRad))) * (180 / math.pi),
    );
  }

  ({LatLng point, double distanceMeters})? _snapPointToRoute(
    LatLng point,
    List<LatLng> routePoints,
  ) {
    if (routePoints.length < 2) return null;

    ({LatLng point, double distanceMeters})? best;

    for (var index = 0; index < routePoints.length - 1; index += 1) {
      final start = routePoints[index];
      final end = routePoints[index + 1];
      final pointMeters = _projectToMeters(start, point);
      final endMeters = _projectToMeters(start, end);
      final dx = endMeters.x;
      final dy = endMeters.y;
      final lengthSquared = dx * dx + dy * dy;

      if (lengthSquared == 0) continue;

      final t = ((pointMeters.x * dx + pointMeters.y * dy) / lengthSquared)
          .clamp(0.0, 1.0)
          .toDouble();
      final snappedPoint = _projectFromMeters(start, (x: dx * t, y: dy * t));
      final distanceMeters = _distanceMeters(point, snappedPoint);

      if (best == null || distanceMeters < best.distanceMeters) {
        best = (point: snappedPoint, distanceMeters: distanceMeters);
      }
    }

    return best;
  }

  LatLng _resolveMarkerTargetLocation({
    required LatLng baseLocation,
    required List<LatLng> routeGeometry,
    required bool isOffRoute,
    required double distanceFromRouteMeters,
  }) {
    if (routeGeometry.length < 2) return baseLocation;
    if (isOffRoute && distanceFromRouteMeters > _routeSnapThresholdMeters) {
      return baseLocation;
    }

    final snapped = _snapPointToRoute(baseLocation, routeGeometry);
    if (snapped == null) return baseLocation;
    if (isOffRoute && snapped.distanceMeters > _routeSnapThresholdMeters) {
      return baseLocation;
    }

    return snapped.point;
  }

  LatLng _smoothMarkerTarget(LatLng target, double speedKmh) {
    final reference = _targetBusLocation ?? _displayBusLocation;
    final distanceMeters = _distanceMeters(reference, target);

    if (speedKmh <= _stationarySpeedThresholdKmh &&
        distanceMeters <= _microJitterThresholdMeters) {
      return reference;
    }

    if (distanceMeters >= 90) {
      return target;
    }

    double alpha;
    if (speedKmh <= _stationarySpeedThresholdKmh) {
      alpha = distanceMeters >= 24 ? 0.35 : 0.18;
    } else if (speedKmh <= 15) {
      alpha = 0.55;
    } else {
      alpha = 0.72;
    }

    return _lerpLatLng(reference, target, alpha);
  }

  bool _isOutlierJump(
    LatLng target,
    double speedKmh,
    DateTime? telemetryTimestamp,
  ) {
    final reference = _targetBusLocation ?? _displayBusLocation;
    final distanceMeters = _distanceMeters(reference, target);
    if (distanceMeters <= _outlierJumpThresholdMeters) {
      return false;
    }

    final gapMs = telemetryTimestamp != null && _lastTelemetryTimestamp != null
        ? telemetryTimestamp
            .difference(_lastTelemetryTimestamp!)
            .inMilliseconds
            .abs()
        : AppConfig.refreshIntervalMs;
    final gapSeconds = (gapMs.clamp(1000, 15000)) / 1000.0;
    final speedMs =
        (math.max(speedKmh, _stationarySpeedThresholdKmh) * 1000) / 3600;
    final plausibleDistance = math.max(120.0, speedMs * gapSeconds * 4.0);

    return distanceMeters >
        math.max(_outlierJumpThresholdMeters, plausibleDistance + 120.0);
  }

  double _resolveTargetHeading({
    required LatLng from,
    required LatLng to,
    required double speedKmh,
    required double serverHeadingDeg,
  }) {
    final movementDistance = _distanceMeters(from, to);
    if (movementDistance <= _microJitterThresholdMeters ||
        speedKmh <= _stationarySpeedThresholdKmh) {
      return _targetHeadingDeg;
    }

    final movementHeading = _bearingBetween(from, to);
    final difference =
        _shortestAngleDelta(movementHeading, serverHeadingDeg).abs();

    if (difference > 100) {
      return movementHeading;
    }

    return _interpolateAngle(movementHeading, serverHeadingDeg, 0.45);
  }

  Duration _resolveAnimationDuration(
    double distanceMeters,
    double speedKmh,
    DateTime? telemetryTimestamp,
  ) {
    final gapMs = telemetryTimestamp != null && _lastTelemetryTimestamp != null
        ? telemetryTimestamp
            .difference(_lastTelemetryTimestamp!)
            .inMilliseconds
            .abs()
        : AppConfig.refreshIntervalMs;
    final baseDurationMs =
        ((gapMs.clamp(900, _maxAnimationDurationMs) - _animationBufferMs).clamp(
      _minAnimationDurationMs,
      _maxAnimationDurationMs,
    )).round();

    if (distanceMeters <= _microJitterThresholdMeters) {
      return const Duration(milliseconds: _minAnimationDurationMs);
    }

    if (speedKmh <= _stationarySpeedThresholdKmh) {
      return Duration(milliseconds: baseDurationMs);
    }

    final speedMs = (speedKmh * 1000) / 3600;
    final travelDurationMs = speedMs > 0
        ? (distanceMeters / speedMs * 1000).round()
        : baseDurationMs;
    final durationMs = math.min(baseDurationMs, travelDurationMs);

    return Duration(
      milliseconds: durationMs.clamp(
        _minAnimationDurationMs,
        _maxAnimationDurationMs,
      ),
    );
  }

  void _applyMarkerStateImmediately({
    required LatLng location,
    required double headingDeg,
    required double routeDistanceMeters,
  }) {
    _markerAnimationController.stop();
    _animationStartLocation = location;
    _animationEndLocation = location;
    _targetBusLocation = location;
    _displayBusLocation = location;
    _targetHeadingDeg = headingDeg;
    _displayHeadingDeg = headingDeg;
    _animationStartHeadingDeg = headingDeg;
    _animationEndHeadingDeg = headingDeg;
    _animationStartRouteDistanceMeters = routeDistanceMeters;
    _animationEndRouteDistanceMeters = routeDistanceMeters;
    _currentRouteDistanceMeters = routeDistanceMeters.round();
    _activeRouteGeometry = _buildActiveRouteSegment(
      busLocation: location,
      routeSegment: _activeRouteTailGeometry,
      nextStopLocation: _activeNextStopLocation,
    );
  }

  void _animateMarkerTo({
    required LatLng location,
    required double headingDeg,
    required double routeDistanceMeters,
    required double speedKmh,
    required DateTime? telemetryTimestamp,
    required bool immediate,
  }) {
    final currentLocation = _displayBusLocation;
    final travelDistanceMeters = _distanceMeters(currentLocation, location);

    if (immediate || travelDistanceMeters <= 1) {
      if (!mounted) return;
      setState(() {
        _applyMarkerStateImmediately(
          location: location,
          headingDeg: headingDeg,
          routeDistanceMeters: routeDistanceMeters,
        );
      });
      if (_followBus) {
        _centerOnBus();
      }
      return;
    }

    _targetBusLocation = location;
    _targetHeadingDeg = headingDeg;
    _animationStartLocation = currentLocation;
    _animationEndLocation = location;
    _animationStartHeadingDeg = _displayHeadingDeg;
    _animationEndHeadingDeg = headingDeg;
    _animationStartRouteDistanceMeters = _currentRouteDistanceMeters.toDouble();
    _animationEndRouteDistanceMeters = routeDistanceMeters;
    _markerAnimationController.duration = _resolveAnimationDuration(
      travelDistanceMeters,
      speedKmh,
      telemetryTimestamp,
    );
    _markerAnimationController.forward(from: 0);
  }

  LatLng? _parseLocation(dynamic raw) {
    if (raw is Map) {
      final lat = raw['latitude'] ?? raw['lat'];
      final lng = raw['longitude'] ?? raw['lng'] ?? raw['lon'];
      if (lat is num && lng is num) {
        return LatLng(lat.toDouble(), lng.toDouble());
      }
    }
    return null;
  }

  List<LatLng> _parseGeometry(dynamic raw) {
    if (raw is! List) return const [];

    final points = <LatLng>[];
    for (final point in raw) {
      if (point is List && point.length >= 2) {
        final lat = point[0];
        final lng = point[1];
        if (lat is num && lng is num) {
          points.add(LatLng(lat.toDouble(), lng.toDouble()));
        }
        continue;
      }

      if (point is Map) {
        final lat = point['latitude'] ?? point['lat'];
        final lng = point['longitude'] ?? point['lng'] ?? point['lon'];
        if (lat is num && lng is num) {
          points.add(LatLng(lat.toDouble(), lng.toDouble()));
        }
      }
    }

    return points;
  }

  List<Map<String, dynamic>> _parseStops(dynamic raw) {
    if (raw is! List) return const [];

    return raw
        .whereType<Map>()
        .map((stop) => Map<String, dynamic>.from(stop))
        .toList();
  }

  int _parseInt(dynamic value, {int fallback = 0}) {
    if (value is num) return value.round();
    if (value is String) return int.tryParse(value) ?? fallback;
    return fallback;
  }

  double _parseDouble(dynamic value, {double fallback = 0}) {
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? fallback;
    return fallback;
  }

  Future<void> _initializeAlarmPreferences() async {
    await _alarmPlayer.setReleaseMode(ReleaseMode.loop);

    final prefs = await SharedPreferences.getInstance();
    final savedEnabled = prefs.getBool(_alarmEnabledPrefKey) ?? false;
    final savedLeadMinutes = prefs.getInt(_alarmLeadMinutesPrefKey) ?? 5;
    final resolvedLeadMinutes =
        _alarmLeadMinuteOptions.contains(savedLeadMinutes)
            ? savedLeadMinutes
            : 5;

    if (!mounted) return;
    setState(() {
      _stopAlarmEnabled = savedEnabled;
      _alarmLeadMinutes = resolvedLeadMinutes;
    });
    _evaluateStopAlarm();
  }

  Future<void> _setAlarmEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_alarmEnabledPrefKey, enabled);

    if (!mounted) return;
    setState(() {
      _stopAlarmEnabled = enabled;
      _alarmTriggered = false;
    });

    if (!enabled) {
      await _stopAlarmPlayback(resetTrigger: true);
      return;
    }

    _evaluateStopAlarm();
  }

  Future<void> _setAlarmLeadMinutes(int minutes) async {
    if (!_alarmLeadMinuteOptions.contains(minutes)) return;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_alarmLeadMinutesPrefKey, minutes);

    if (!mounted) return;
    setState(() {
      _alarmLeadMinutes = minutes;
      if (!_alarmPlaying) {
        _alarmTriggered = false;
      }
    });
    _evaluateStopAlarm();
  }

  Future<void> _startAlarmPlayback() async {
    if (_alarmPlaying) return;

    try {
      await _alarmPlayer.stop();
      await _alarmPlayer.play(AssetSource('audio/bus_alarm.wav'));
      if (!mounted) return;
      setState(() {
        _alarmPlaying = true;
        _alarmTriggered = true;
      });
    } catch (error) {
      debugPrint('Error playing stop alarm: $error');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not play the stop alarm.')),
      );
    }
  }

  Future<void> _stopAlarmPlayback({bool resetTrigger = false}) async {
    try {
      await _alarmPlayer.stop();
    } catch (error) {
      debugPrint('Error stopping stop alarm: $error');
    }

    if (!mounted) return;
    setState(() {
      _alarmPlaying = false;
      if (resetTrigger) {
        _alarmTriggered = false;
      }
    });
  }

  Map<String, dynamic>? _resolveAlarmTargetStop() {
    if (_routeStops.isEmpty) return null;

    final selectedStopId = widget.stopInfo['id']?.toString();
    if (selectedStopId == null) return null;

    try {
      return _routeStops.firstWhere(
        (stop) => stop['id']?.toString() == selectedStopId,
      );
    } catch (_) {
      return null;
    }
  }

  ({
    Map<String, dynamic> stop,
    double distanceAheadMeters,
    bool isPassedStop,
    int? etaMinutes,
    DateTime? projectedArrival,
    int delayMinutes,
    String delayStatus,
  })? _resolveAlarmTargetMeta() {
    final stop = _resolveAlarmTargetStop();
    if (stop == null) return null;

    final stopRouteDistance = _parseDouble(stop['route_distance_m']);
    final distanceAheadMeters = stopRouteDistance - _currentRouteDistanceMeters;
    final isPassedStop = distanceAheadMeters < -_stopArrivalRadiusMeters;
    final etaMeta = _resolveTimelineEtaMeta(
      scheduledArrivalTime: stop['arrival_time']?.toString(),
      distanceAheadMeters: math.max(0, distanceAheadMeters),
      isPassedStop: isPassedStop,
    );

    return (
      stop: stop,
      distanceAheadMeters: distanceAheadMeters,
      isPassedStop: isPassedStop,
      etaMinutes: etaMeta.etaMinutes,
      projectedArrival: etaMeta.projectedArrival,
      delayMinutes: etaMeta.delayMinutes,
      delayStatus: etaMeta.delayStatus,
    );
  }

  void _evaluateStopAlarm() {
    final targetMeta = _resolveAlarmTargetMeta();
    if (!_stopAlarmEnabled || targetMeta == null) {
      if (_alarmPlaying) {
        unawaited(_stopAlarmPlayback(resetTrigger: !_stopAlarmEnabled));
      }
      return;
    }

    if (targetMeta.isPassedStop) {
      if (_alarmPlaying) {
        unawaited(_stopAlarmPlayback());
      }
      return;
    }

    final etaMinutes = targetMeta.etaMinutes;
    if (etaMinutes == null) return;

    if (_alarmTriggered || _alarmPlaying) return;

    if (etaMinutes <= _alarmLeadMinutes) {
      unawaited(_startAlarmPlayback());
    }
  }

  DateTime? _parseScheduledArrivalTime(String? rawArrival) {
    if (rawArrival == null || rawArrival.isEmpty) return null;

    final parts = rawArrival.split(':');
    if (parts.length < 2) return null;

    final hours = int.tryParse(parts[0]);
    final minutes = int.tryParse(parts[1]);
    final seconds = parts.length >= 3 ? int.tryParse(parts[2]) ?? 0 : 0;
    if (hours == null || minutes == null) return null;

    final now = DateTime.now();
    return DateTime(
      now.year,
      now.month,
      now.day,
      hours,
      minutes,
      seconds,
    );
  }

  int? _calculateTimelineEtaMinutes(double distanceAheadMeters) {
    if (distanceAheadMeters <= _stopArrivalRadiusMeters) {
      return 0;
    }

    if (_liveSnapshot == null || _liveSnapshot?['last_seen_at'] == null) {
      return null;
    }

    final nextStopDistance = _distanceToNextStopMeters;
    if (_etaMinutes != null && nextStopDistance > _stopArrivalRadiusMeters) {
      final minutesPerMeter = _etaMinutes! / nextStopDistance;
      if (minutesPerMeter.isFinite && minutesPerMeter > 0) {
        return math.max(1, (distanceAheadMeters * minutesPerMeter).ceil());
      }
    }

    final liveSpeedKmh = _parseDouble(_liveSnapshot?['speed']);
    final resolvedSpeedKmh = liveSpeedKmh > 0
        ? math.max(liveSpeedKmh, _fallbackTimelineEtaSpeedKmh)
        : _fallbackTimelineEtaSpeedKmh;
    final speedMs = (resolvedSpeedKmh * 1000) / 3600;
    if (speedMs <= 0) return null;

    return math.max(1, (distanceAheadMeters / speedMs / 60).ceil());
  }

  ({
    int? etaMinutes,
    DateTime? projectedArrival,
    int delayMinutes,
    String delayStatus,
  }) _resolveTimelineEtaMeta({
    required String? scheduledArrivalTime,
    required double distanceAheadMeters,
    required bool isPassedStop,
  }) {
    if (isPassedStop) {
      return (
        etaMinutes: null,
        projectedArrival: null,
        delayMinutes: 0,
        delayStatus: 'Passed',
      );
    }

    final etaMinutes = _calculateTimelineEtaMinutes(distanceAheadMeters);
    final projectedArrival = etaMinutes == null
        ? null
        : DateTime.now().add(Duration(minutes: etaMinutes));
    final scheduledArrival = _parseScheduledArrivalTime(scheduledArrivalTime);

    if (projectedArrival == null) {
      return (
        etaMinutes: null,
        projectedArrival: null,
        delayMinutes: 0,
        delayStatus: 'ETA updating',
      );
    }

    if (scheduledArrival == null) {
      return (
        etaMinutes: etaMinutes,
        projectedArrival: projectedArrival,
        delayMinutes: 0,
        delayStatus: 'On Time',
      );
    }

    final delayMinutes = math.max(
      0,
      projectedArrival.difference(scheduledArrival).inMinutes.round(),
    );
    final delayStatus =
        delayMinutes > _timelineDelayThresholdMinutes ? 'Delayed' : 'On Time';

    return (
      etaMinutes: etaMinutes,
      projectedArrival: projectedArrival,
      delayMinutes: delayMinutes,
      delayStatus: delayStatus,
    );
  }

  Color _resolveTimelineStatusColor(String delayStatus) {
    switch (delayStatus) {
      case 'Delayed':
        return const Color(0xFFDC2626);
      case 'ETA updating':
        return const Color(0xFF64748B);
      case 'Passed':
        return const Color(0xFF94A3B8);
      default:
        return const Color(0xFF2563EB);
    }
  }

  void _syncTimelineDotKeys() {
    if (_timelineDotKeys.length == _routeStops.length) return;

    _timelineDotKeys = List<GlobalKey>.generate(
      _routeStops.length,
      (_) => GlobalKey(),
    );
    _timelineDotCenters = const {};
    _needsTimelineMeasurement = true;
  }

  void _scheduleTimelineMeasurement() {
    if (_timelineMeasurementScheduled ||
        !_needsTimelineMeasurement ||
        _routeStops.isEmpty) {
      return;
    }

    _timelineMeasurementScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _timelineMeasurementScheduled = false;
      if (!mounted) return;
      _measureTimelineDots();
    });
  }

  bool _hasMeaningfulTimelineCenterChange(Map<int, Offset> nextCenters) {
    if (_timelineDotCenters.length != nextCenters.length) return true;

    for (final entry in nextCenters.entries) {
      final previous = _timelineDotCenters[entry.key];
      if (previous == null) return true;

      if ((previous.dx - entry.value.dx).abs() > 0.5 ||
          (previous.dy - entry.value.dy).abs() > 0.5) {
        return true;
      }
    }

    return false;
  }

  void _measureTimelineDots() {
    final stackContext = _timelineStackKey.currentContext;
    final stackRenderBox = stackContext?.findRenderObject() as RenderBox?;
    if (stackRenderBox == null || !stackRenderBox.hasSize) {
      _needsTimelineMeasurement = true;
      return;
    }

    final nextCenters = <int, Offset>{};

    for (var index = 0; index < _timelineDotKeys.length; index += 1) {
      final dotContext = _timelineDotKeys[index].currentContext;
      final dotRenderBox = dotContext?.findRenderObject() as RenderBox?;
      if (dotRenderBox == null || !dotRenderBox.hasSize) {
        _needsTimelineMeasurement = true;
        return;
      }

      nextCenters[index] = dotRenderBox.localToGlobal(
        dotRenderBox.size.center(Offset.zero),
        ancestor: stackRenderBox,
      );
    }

    _needsTimelineMeasurement = false;

    if (!_hasMeaningfulTimelineCenterChange(nextCenters)) {
      return;
    }

    if (!mounted) return;
    setState(() {
      _timelineDotCenters = nextCenters;
    });
  }

  Offset? _resolveTimelineBusOffset() {
    if (_routeStops.isEmpty ||
        _timelineDotCenters.length != _routeStops.length) {
      return null;
    }

    final progressDistance = _currentRouteDistanceMeters.toDouble();
    final stopDistances = _routeStops
        .map((stop) => _parseDouble(stop['route_distance_m']))
        .toList(growable: false);

    if (stopDistances.isEmpty) return null;

    var nearestStopIndex = 0;
    var nearestStopDelta = double.infinity;
    for (var index = 0; index < stopDistances.length; index += 1) {
      final delta = (stopDistances[index] - progressDistance).abs();
      if (delta < nearestStopDelta) {
        nearestStopDelta = delta;
        nearestStopIndex = index;
      }
    }

    if (nearestStopDelta <= _stopArrivalRadiusMeters) {
      return _timelineDotCenters[nearestStopIndex];
    }

    if (progressDistance <= stopDistances.first) {
      return _timelineDotCenters[0];
    }

    if (progressDistance >= stopDistances.last) {
      return _timelineDotCenters[stopDistances.length - 1];
    }

    for (var index = 0; index < stopDistances.length - 1; index += 1) {
      final startDistance = stopDistances[index];
      final endDistance = stopDistances[index + 1];

      if (progressDistance > endDistance) continue;

      final startCenter = _timelineDotCenters[index];
      final endCenter = _timelineDotCenters[index + 1];
      if (startCenter == null || endCenter == null) {
        return null;
      }

      final span = endDistance - startDistance;
      if (span.abs() < 0.001) {
        return endCenter;
      }

      final t = ((progressDistance - startDistance) / span)
          .clamp(0.0, 1.0)
          .toDouble();
      return Offset(
        _lerpDouble(startCenter.dx, endCenter.dx, t),
        _lerpDouble(startCenter.dy, endCenter.dy, t),
      );
    }

    return _timelineDotCenters[stopDistances.length - 1];
  }

  int _resolveNextStopIndex(
    List<Map<String, dynamic>> stops,
    Map<String, dynamic> payload,
    double currentRouteDistanceMeters,
  ) {
    if (stops.isEmpty) return 0;

    final nextStop = payload['next_stop'];
    if (nextStop is Map) {
      final nextStopId = nextStop['id']?.toString();
      if (nextStopId != null) {
        final matchIndex = stops.indexWhere(
          (stop) => stop['id']?.toString() == nextStopId,
        );
        if (matchIndex >= 0) return matchIndex;
      }

      final stopSequence = _parseInt(nextStop['stop_sequence'], fallback: 0);
      if (stopSequence > 0 && stopSequence <= stops.length) {
        return stopSequence - 1;
      }
    }

    for (var index = 0; index < stops.length; index += 1) {
      final stopRouteDistance = _parseDouble(stops[index]['route_distance_m']);
      if (stopRouteDistance + _stopArrivalRadiusMeters >= currentRouteDistanceMeters) {
        return index;
      }
    }

    return math.max(stops.length - 1, 0);
  }

  String _formatDistance(double distanceMeters) {
    if (distanceMeters >= 1000) {
      return '${(distanceMeters / 1000).toStringAsFixed(1)} km';
    }
    return '${distanceMeters.toStringAsFixed(0)} m';
  }

  int _nearestPointIndex(LatLng origin, List<LatLng> points) {
    if (points.isEmpty) return 0;

    var nearestIndex = 0;
    var nearestDistance = double.infinity;

    for (var index = 0; index < points.length; index += 1) {
      final distanceMeters = _distanceMeters(origin, points[index]);
      if (distanceMeters < nearestDistance) {
        nearestDistance = distanceMeters;
        nearestIndex = index;
      }
    }

    return nearestIndex;
  }

  LatLng? _resolveNextStopLocation(
    List<Map<String, dynamic>> stops,
    int nextStopIndex,
    Map<String, dynamic> payload,
  ) {
    if (stops.isNotEmpty &&
        nextStopIndex >= 0 &&
        nextStopIndex < stops.length) {
      final stop = stops[nextStopIndex];
      return LatLng(
        _parseDouble(stop['latitude']),
        _parseDouble(stop['longitude']),
      );
    }

    final nextStop = payload['next_stop'];
    if (nextStop is Map) {
      final lat = _parseDouble(nextStop['latitude']);
      final lng = _parseDouble(nextStop['longitude']);
      if (lat != 0 || lng != 0) {
        return LatLng(lat, lng);
      }
    }

    return null;
  }

  List<LatLng> _prependUniquePoint(LatLng head, List<LatLng> tail) {
    if (tail.isEmpty) return [head];

    final distanceToFirst = _distanceMeters(head, tail.first);
    if (distanceToFirst <= 4) {
      return [head, ...tail.skip(1)];
    }

    return [head, ...tail];
  }

  void _appendUniquePoint(List<LatLng> points, LatLng point) {
    if (points.isEmpty || _distanceMeters(points.last, point) > 1) {
      points.add(point);
    }
  }

  LatLng _interpolateRoutePoint(LatLng start, LatLng end, double fraction) {
    final clamped = fraction.clamp(0.0, 1.0).toDouble();
    return LatLng(
      start.latitude + (end.latitude - start.latitude) * clamped,
      start.longitude + (end.longitude - start.longitude) * clamped,
    );
  }

  List<LatLng> _sliceGeometryByDistance(
    List<LatLng> routePoints,
    double startDistanceMeters, [
    double endDistanceMeters = double.infinity,
  ]) {
    if (routePoints.length < 2) return List<LatLng>.from(routePoints);

    final cumulative = <double>[0];
    for (var index = 1; index < routePoints.length; index += 1) {
      cumulative.add(
        cumulative.last +
            _distanceMeters(routePoints[index - 1], routePoints[index]),
      );
    }

    final totalDistance = cumulative.last;
    final startDistance =
        startDistanceMeters.clamp(0.0, totalDistance).toDouble();
    final endDistance = endDistanceMeters.isFinite
        ? endDistanceMeters.clamp(startDistance, totalDistance).toDouble()
        : totalDistance;

    if (endDistance <= startDistance) {
      return const [];
    }

    final sliced = <LatLng>[];

    for (var index = 0; index < routePoints.length - 1; index += 1) {
      final segmentStartDistance = cumulative[index];
      final segmentEndDistance = cumulative[index + 1];
      final segmentLength = segmentEndDistance - segmentStartDistance;
      if (segmentLength <= 0) continue;
      if (segmentEndDistance < startDistance) continue;
      if (segmentStartDistance > endDistance) break;

      final start = routePoints[index];
      final end = routePoints[index + 1];

      if (sliced.isEmpty) {
        if (startDistance <= segmentStartDistance) {
          _appendUniquePoint(sliced, start);
        } else {
          final fraction =
              (startDistance - segmentStartDistance) / segmentLength;
          _appendUniquePoint(
            sliced,
            _interpolateRoutePoint(start, end, fraction),
          );
        }
      }

      if (endDistance <= segmentEndDistance) {
        final fraction = (endDistance - segmentStartDistance) / segmentLength;
        _appendUniquePoint(
          sliced,
          _interpolateRoutePoint(start, end, fraction),
        );
        break;
      }

      _appendUniquePoint(sliced, end);
    }

    return sliced;
  }

  double? _resolveNextStopRouteDistanceMeters() {
    if (_routeStops.isEmpty ||
        _nextStopIndex < 0 ||
        _nextStopIndex >= _routeStops.length) {
      return null;
    }

    final nextStop = _routeStops[_nextStopIndex];
    final routeDistance = nextStop['route_distance_m'];
    if (routeDistance == null) return null;

    return _parseDouble(routeDistance);
  }

  List<Polyline> _buildContextRoutePolylines() {
    if (_fullRouteGeometry.length < 2) return const [];

    final nextStopRouteDistance = _resolveNextStopRouteDistanceMeters();
    if (nextStopRouteDistance == null) {
      return [
        Polyline(
          points: _fullRouteGeometry,
          color: const Color(0xFFCBD5E1).withValues(alpha: 0.4),
          strokeWidth: 2.5,
        ),
      ];
    }

    final contextSegments = <List<LatLng>>[
      _sliceGeometryByDistance(
        _fullRouteGeometry,
        0,
        _currentRouteDistanceMeters.toDouble(),
      ),
    ].where((segment) => segment.length >= 2).toList();

    if (contextSegments.isEmpty) {
      contextSegments.add(_fullRouteGeometry);
    }

    return contextSegments
        .map(
          (segment) => Polyline(
            points: segment,
            color: const Color(0xFFCBD5E1).withValues(alpha: 0.4),
            strokeWidth: 2.5,
          ),
        )
        .toList();
  }

  List<LatLng> _buildActiveRouteSegment({
    required LatLng busLocation,
    required List<LatLng> routeSegment,
    required LatLng? nextStopLocation,
  }) {
    if (routeSegment.length >= 2) {
      final nearestIndex = _nearestPointIndex(busLocation, routeSegment);
      final trimmedSegment = routeSegment.sublist(nearestIndex);
      return _prependUniquePoint(busLocation, trimmedSegment);
    }

    if (routeSegment.length == 1 && nextStopLocation != null) {
      final path = _prependUniquePoint(busLocation, routeSegment);
      if (_distanceMeters(path.last, nextStopLocation) > 4) {
        return [...path, nextStopLocation];
      }
      return path;
    }

    if (nextStopLocation != null) {
      return [busLocation, nextStopLocation];
    }

    return const [];
  }

  Future<void> _fetchLiveRoute({bool includeFullGeometry = false}) async {
    final tripId = widget.trip['id'];
    final shouldIncludeFullGeometry =
        includeFullGeometry || !_hasLoadedFullGeometry;
    final uri = Uri.parse(
      '${AppConfig.effectiveApiBase}/trips/$tripId/live-route',
    ).replace(
      queryParameters: {
        if (shouldIncludeFullGeometry) 'include_full_geometry': 'true',
        'include_recovery_geometry': 'false',
      },
    );

    try {
      final response = await http.get(uri);
      if (response.statusCode != 200) {
        if (!mounted) return;
        setState(() {
          _loadingStops = false;
          _loadingLocation = false;
          _locationError = 'Unable to load live route now.';
        });
        return;
      }

      final payload = Map<String, dynamic>.from(jsonDecode(response.body));
      final rawLocation = _parseLocation(payload['raw_location']);
      final snappedLocation = _parseLocation(payload['snapped_location']);
      final isOffRoute = payload['is_off_route'] == true;
      final routeStops = _parseStops(payload['stops']);
      final fullRouteGeometry = _parseGeometry(payload['full_route_geometry']);
      final routeGeometryForDisplay =
          fullRouteGeometry.isNotEmpty ? fullRouteGeometry : _fullRouteGeometry;
      final routeDistanceMeters = _parseDouble(
        payload['current_route_distance_m'],
      );
      final nextStopIndex = _resolveNextStopIndex(
        routeStops,
        payload,
        routeDistanceMeters,
      );
      final nextStopLocation = _resolveNextStopLocation(
        routeStops,
        nextStopIndex,
        payload,
      );
      final distanceFromRouteMeters = _parseDouble(
        payload['distance_from_route_m'],
      );
      final speedKmh = _parseDouble(payload['speed']);
      final serverHeadingDeg = _normalizeAngle(
        _parseDouble(payload['heading']),
      );
      final telemetryTimestamp = payload['last_seen_at'] is String
          ? DateTime.tryParse(payload['last_seen_at'])?.toLocal()
          : null;
      final baseLocation = (isOffRoute
              ? rawLocation ?? snappedLocation
              : snappedLocation ?? rawLocation) ??
          _displayBusLocation;
      final routeAlignedLocation = _resolveMarkerTargetLocation(
        baseLocation: baseLocation,
        routeGeometry: routeGeometryForDisplay,
        isOffRoute: isOffRoute,
        distanceFromRouteMeters: distanceFromRouteMeters,
      );
      final smoothedLocation = _smoothMarkerTarget(
        routeAlignedLocation,
        speedKmh,
      );
      final referenceLocation = _targetBusLocation ?? _displayBusLocation;
      final targetHeadingDeg = _resolveTargetHeading(
        from: referenceLocation,
        to: smoothedLocation,
        speedKmh: speedKmh,
        serverHeadingDeg: serverHeadingDeg,
      );
      final isOutlier = _isOutlierJump(
        smoothedLocation,
        speedKmh,
        telemetryTimestamp,
      );
      final shouldApplyImmediately = _targetBusLocation == null || isOutlier;

      if (!mounted) return;
      setState(() {
        _routeStops = routeStops;
        _syncTimelineDotKeys();
        _needsTimelineMeasurement = true;
        _activeNextStopLocation = nextStopLocation;
        _activeRouteTailGeometry = _sliceGeometryByDistance(
          routeGeometryForDisplay,
          routeDistanceMeters,
        );
        _activeRouteGeometry = _buildActiveRouteSegment(
          busLocation: _displayBusLocation,
          routeSegment: _activeRouteTailGeometry,
          nextStopLocation: _activeNextStopLocation,
        );
        if (fullRouteGeometry.isNotEmpty) {
          _fullRouteGeometry = fullRouteGeometry;
          _hasLoadedFullGeometry = true;
        }
        _liveSnapshot = payload;
        _nextStopIndex = nextStopIndex;
        _distanceToNextStopMeters = _parseDouble(
          payload['distance_to_next_stop_m'],
        );
        _remainingRouteDistanceMeters = _parseDouble(
          payload['remaining_distance_m'],
        );
        _distanceToRouteMeters = distanceFromRouteMeters;
        _etaMinutes = payload['eta_minutes'] == null
            ? null
            : _parseInt(payload['eta_minutes']);
        _delayMinutes = _parseInt(payload['delay_minutes']);
        _delayStatus = (payload['delay_status'] ?? 'On Time').toString();
        _lastUpdatedAt = telemetryTimestamp;
        _loadingStops = false;
        _loadingLocation = false;
        _locationError = payload['is_online'] == false
            ? (rawLocation == null && snappedLocation == null
                ? 'Waiting for live GPS from the driver.'
                : 'Bus is offline. Showing the last known route position.')
            : null;
      });
      _scheduleTimelineMeasurement();
      _evaluateStopAlarm();

      _animateMarkerTo(
        location: smoothedLocation,
        headingDeg: targetHeadingDeg,
        routeDistanceMeters: routeDistanceMeters,
        speedKmh: speedKmh,
        telemetryTimestamp: telemetryTimestamp,
        immediate: shouldApplyImmediately,
      );
      _lastTelemetryTimestamp = telemetryTimestamp ?? _lastTelemetryTimestamp;
    } catch (error) {
      debugPrint('Error fetching live route: $error');
      if (!mounted) return;
      setState(() {
        _loadingStops = false;
        _loadingLocation = false;
        _locationError = 'Connection lost. Retrying automatically...';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final schedules = Map<String, dynamic>.from(
      widget.trip['schedules'] ?? const {},
    );
    final bus = Map<String, dynamic>.from(schedules['buses'] ?? const {});
    final hasTimelineContent = _loadingStops || _routeStops.isNotEmpty;
    final initialSheetSize = hasTimelineContent ? 0.34 : 0.26;
    final snapSizes = hasTimelineContent
        ? const [0.16, 0.34, 0.58, 0.9]
        : const [0.16, 0.26, 0.42];

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        toolbarHeight: 72,
        title: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'WHERE IS MY BUS',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w900,
                color: Color(0xFF94A3B8),
                letterSpacing: 2,
              ),
            ),
            Text(
              bus['bus_name']?.toString() ?? 'Bus',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
          ],
        ),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.crosshair),
            tooltip: 'Center bus',
            onPressed: () {
              setState(() => _followBus = true);
              _centerOnBus();
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          Positioned.fill(child: _buildLiveMap()),
          Positioned(
            top: 20,
            right: 16,
            child: SafeArea(
              bottom: false,
              child: Column(
                children: [
                  _mapControlButton(
                    icon: LucideIcons.plus,
                    tooltip: 'Zoom in',
                    onTap: () => _zoomBy(1),
                  ),
                  const SizedBox(height: 10),
                  _mapControlButton(
                    icon: LucideIcons.minus,
                    tooltip: 'Zoom out',
                    onTap: () => _zoomBy(-1),
                  ),
                  const SizedBox(height: 10),
                  _mapControlButton(
                    icon: _followBus
                        ? LucideIcons.locateFixed
                        : LucideIcons.locate,
                    tooltip: _followBus ? 'Following bus' : 'Follow bus',
                    active: _followBus,
                    onTap: () {
                      setState(() => _followBus = true);
                      _centerOnBus();
                    },
                  ),
                ],
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: DraggableScrollableSheet(
              expand: false,
              initialChildSize: initialSheetSize,
              minChildSize: 0.16,
              maxChildSize: 0.9,
              snap: true,
              snapSizes: snapSizes,
              builder: (context, scrollController) =>
                  _buildDetailsSheet(scrollController),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveMap() {
    final contextRoutePolylines = _buildContextRoutePolylines();

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: _displayBusLocation,
        initialZoom: 15.0,
        minZoom: 5,
        maxZoom: 18.5,
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.all,
          enableScrollWheel: true,
        ),
        onMapReady: () {
          _mapReady = true;
          if (_followBus) {
            _centerOnBus();
          }
        },
        onMapEvent: _handleMapEvent,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'in.edu.mpnmjec.student',
        ),
        if (contextRoutePolylines.isNotEmpty)
          PolylineLayer(polylines: contextRoutePolylines),
        if (_activeRouteGeometry.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: _activeRouteGeometry,
                color: const Color(0xFFF59E0B),
                strokeWidth: 6.5,
                borderColor: Colors.white.withValues(alpha: 0.88),
                borderStrokeWidth: 2.0,
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            Marker(
              point: _displayBusLocation,
              width: 104,
              height: 104,
              alignment: Alignment.center,
              child: _buildBusMarker(),
            ),
            ..._routeStops.asMap().entries.map(
                  (entry) => Marker(
                    point: LatLng(
                      _parseDouble(entry.value['latitude']),
                      _parseDouble(entry.value['longitude']),
                    ),
                    width: 120,
                    height: 72,
                    alignment: Alignment.bottomCenter,
                    child: _buildStopMarker(entry.value, entry.key),
                  ),
                ),
          ],
        ),
      ],
    );
  }

  Widget _buildDetailsSheet(ScrollController scrollController) {
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(32),
          topRight: Radius.circular(32),
        ),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A0F172A),
            blurRadius: 24,
            offset: Offset(0, -8),
          ),
        ],
      ),
      child: Scrollbar(
        controller: scrollController,
        interactive: true,
        radius: const Radius.circular(999),
        thickness: 4,
        child: CustomScrollView(
          controller: scrollController,
          physics: const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          ),
          slivers: [
            const SliverToBoxAdapter(child: SizedBox(height: 12)),
            SliverToBoxAdapter(child: Center(child: _buildSheetHandle())),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
                child: _buildLiveOverlay(),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 14)),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _buildStopAlarmPanel(),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 20)),
            if (_routeStops.isNotEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'STATION TIMELINE',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 11,
                          color: Color(0xFF94A3B8),
                          letterSpacing: 1.5,
                        ),
                      ),
                      Text(
                        '${_routeStops.length} stops',
                        style: const TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (_routeStops.isNotEmpty)
              const SliverToBoxAdapter(child: SizedBox(height: 18)),
            if (_loadingStops)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: _SheetStateCard(
                    child: SizedBox(
                      height: 96,
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ),
                ),
              )
            else if (_routeStops.isEmpty)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: _SheetStateCard(
                    child: SizedBox(
                      height: 132,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            LucideIcons.mapPin,
                            color: Color(0xFFCBD5E1),
                            size: 30,
                          ),
                          SizedBox(height: 10),
                          Text(
                            'Route details are syncing.',
                            style: TextStyle(
                              color: Color(0xFF1E293B),
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          SizedBox(height: 6),
                          Text(
                            'The live bus card stays active while stop data loads.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              )
            else
              SliverToBoxAdapter(child: _buildTimelineSection(bottomInset)),
            const SliverToBoxAdapter(child: SizedBox(height: 10)),
          ],
        ),
      ),
    );
  }

  Widget _buildTimelineSection(double bottomInset) {
    _syncTimelineDotKeys();
    _scheduleTimelineMeasurement();

    return Padding(
      padding: EdgeInsets.fromLTRB(24, 0, 24, math.max(bottomInset + 24, 32)),
      child: Stack(
        key: _timelineStackKey,
        clipBehavior: Clip.none,
        children: [
          Column(
            children: List<Widget>.generate(_routeStops.length, (index) {
              final stop = _routeStops[index];
              return _buildTimelineItem(
                stop,
                index,
                index == 0,
                index == _routeStops.length - 1,
                dotKey: _timelineDotKeys[index],
              );
            }),
          ),
          _buildTimelineBusOverlay(),
        ],
      ),
    );
  }

  Widget _buildTimelineBusOverlay() {
    final busOffset = _resolveTimelineBusOffset();
    if (busOffset == null) {
      return const SizedBox.shrink();
    }

    const overlaySize = 34.0;

    return Positioned(
      left: busOffset.dx - (overlaySize / 2),
      top: busOffset.dy - (overlaySize / 2),
      child: IgnorePointer(
        child: Container(
          width: overlaySize,
          height: overlaySize,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFFFACC15), Color(0xFFF59E0B), Color(0xFFEA580C)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2.5),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.34),
                blurRadius: 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: const Center(
            child: Icon(
              LucideIcons.bus,
              color: Colors.white,
              size: 20,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSheetHandle() {
    return Container(
      width: 48,
      height: 6,
      decoration: BoxDecoration(
        color: const Color(0xFFCBD5E1),
        borderRadius: BorderRadius.circular(999),
      ),
    );
  }

  Widget _buildLiveOverlay() {
    final speed = _parseDouble(_liveSnapshot?['speed']);
    final heading = _displayHeadingDeg;
    final nextStop =
        _routeStops.isNotEmpty && _nextStopIndex < _routeStops.length
            ? _routeStops[_nextStopIndex]
            : (_liveSnapshot?['next_stop'] is Map
                ? Map<String, dynamic>.from(_liveSnapshot!['next_stop'])
                : null);
    final etaText = _etaMinutes == null
        ? 'ETA updating'
        : _etaMinutes == 0
            ? 'Arriving'
            : 'ETA $_etaMinutes min';
    final delayText =
        _delayStatus == 'Delayed' ? 'Delayed by $_delayMinutes min' : 'On time';
    final isOffRoute = _liveSnapshot?['is_off_route'] == true &&
        _distanceToRouteMeters >= _offRouteVisualThresholdMeters;
    final connectionColor =
        _locationError == null ? const Color(0xFF16A34A) : const Color(0xFFDC2626);
    final connectionLabel =
        _locationError == null ? 'LIVE UPDATES' : 'RECONNECTING';
    final headlineText = nextStop != null
        ? 'Next stop ${nextStop['stop_name']}'
        : 'Live bus tracking is warming up';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 18,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _buildConnectionBadge(
                label: connectionLabel,
                color: connectionColor,
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text(
                      'SPEED',
                      style: TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.1,
                      ),
                    ),
                    Text(
                      '${speed.toStringAsFixed(0)} KM/H',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.end,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF1E293B),
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            headlineText,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xFF1E293B),
              fontSize: 18,
              fontWeight: FontWeight.w900,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            nextStop == null
                ? 'Waiting for stable telemetry and route context.'
                : '${_formatDistance(_distanceToNextStopMeters)} away on the live path.',
            style: const TextStyle(
              color: Color(0xFF64748B),
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (!_followBus) ...[
            const SizedBox(height: 14),
            _buildContextBanner(
              icon: LucideIcons.hand,
              backgroundColor: const Color(0xFFF8FAFC),
              borderColor: const Color(0xFFE2E8F0),
              iconColor: const Color(0xFF475569),
              message:
                  'Follow mode paused. Drag freely, then tap the target button to recenter.',
            ),
          ],
          if (isOffRoute) ...[
            const SizedBox(height: 12),
            _buildContextBanner(
              icon: LucideIcons.navigationOff,
              backgroundColor: const Color(0xFFFEF2F2),
              borderColor: const Color(0xFFFECACA),
              iconColor: const Color(0xFFDC2626),
              textColor: const Color(0xFFB91C1C),
              message:
                  'Off route near ${nextStop?['stop_name'] ?? 'the corridor'} and ${_formatDistance(_distanceToRouteMeters)} away from the planned route.',
            ),
          ],
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final cardWidth = constraints.maxWidth >= 420
                  ? (constraints.maxWidth - 24) / 3
                  : (constraints.maxWidth - 12) / 2;

              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  _buildMetricCard(
                    width: cardWidth,
                    icon: LucideIcons.clock3,
                    label: 'ETA',
                    value: etaText,
                    color: const Color(0xFFF59E0B),
                  ),
                  _buildMetricCard(
                    width: cardWidth,
                    icon: _delayStatus == 'Delayed'
                        ? LucideIcons.timerOff
                        : LucideIcons.badgeCheck,
                    label: 'STATUS',
                    value: delayText,
                    color: _delayStatus == 'Delayed'
                        ? const Color(0xFFDC2626)
                        : const Color(0xFF2563EB),
                  ),
                  _buildMetricCard(
                    width: cardWidth,
                    icon: LucideIcons.navigation,
                    label: 'REMAINING',
                    value: '${_formatDistance(_remainingRouteDistanceMeters)} left',
                    color: const Color(0xFF475569),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 14),
          if (_loadingLocation)
            _buildContextBanner(
              icon: LucideIcons.refreshCw,
              backgroundColor: const Color(0xFFF8FAFC),
              borderColor: const Color(0xFFE2E8F0),
              iconColor: const Color(0xFF64748B),
              message: 'Loading live location...',
            )
          else if (_locationError != null)
            _buildContextBanner(
              icon: LucideIcons.wifiOff,
              backgroundColor: const Color(0xFFFEF2F2),
              borderColor: const Color(0xFFFECACA),
              iconColor: const Color(0xFFDC2626),
              textColor: const Color(0xFFB91C1C),
              message: _locationError!,
            )
          else if (_lastUpdatedAt != null)
            Text(
              'Updated ${DateFormat('hh:mm:ss a').format(_lastUpdatedAt!)}  |  Heading ${heading.toStringAsFixed(0)} deg',
              style: const TextStyle(
                color: Color(0xFF64748B),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStopAlarmPanel() {
    final targetMeta = _resolveAlarmTargetMeta();
    final stopName = (widget.stopInfo['stop_name'] ?? 'your stop').toString();
    final statusColor = _alarmPlaying
        ? const Color(0xFFDC2626)
        : _stopAlarmEnabled
            ? const Color(0xFFF59E0B)
            : const Color(0xFF94A3B8);

    String statusText;
    if (targetMeta == null) {
      statusText = 'This selected stop is not available on the current trip.';
    } else if (targetMeta.isPassedStop) {
      statusText = 'The bus has already passed $stopName.';
    } else if (_alarmPlaying) {
      statusText = 'Alarm ringing now for $stopName.';
    } else if (!_stopAlarmEnabled) {
      statusText = 'Enable an alarm for $stopName before the bus reaches it.';
    } else if (targetMeta.etaMinutes == null) {
      statusText = 'Waiting for a stable live ETA to $stopName.';
    } else {
      statusText =
          'Alarm will ring $_alarmLeadMinutes min before $stopName. Current ETA ${targetMeta.etaMinutes} min.';
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color:
              _alarmPlaying ? const Color(0xFFFCA5A5) : const Color(0xFFFDE68A),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  _alarmPlaying ? LucideIcons.bellRing : LucideIcons.alarmClock,
                  size: 16,
                  color: statusColor,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'STOP ALARM',
                      style: TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                      ),
                    ),
                    Text(
                      stopName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF1E293B),
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
                value: _stopAlarmEnabled,
                onChanged: targetMeta == null ? null : _setAlarmEnabled,
                activeColor: const Color(0xFFF59E0B),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            statusText,
            style: const TextStyle(
              color: Color(0xFF475569),
              fontSize: 12,
              fontWeight: FontWeight.w700,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _alarmLeadMinuteOptions.map((minutes) {
              return ChoiceChip(
                label: Text('$minutes min'),
                selected: _alarmLeadMinutes == minutes,
                onSelected: targetMeta == null
                    ? null
                    : (selected) {
                        if (selected) {
                          _setAlarmLeadMinutes(minutes);
                        }
                      },
                labelStyle: TextStyle(
                  fontWeight: FontWeight.w800,
                  color: _alarmLeadMinutes == minutes
                      ? const Color(0xFF1E293B)
                      : const Color(0xFF475569),
                ),
                selectedColor: const Color(0xFFFCD34D),
                backgroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                  side: BorderSide(
                    color: _alarmLeadMinutes == minutes
                        ? const Color(0xFFF59E0B)
                        : const Color(0xFFE2E8F0),
                  ),
                ),
              );
            }).toList(),
          ),
          if (_alarmPlaying) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _stopAlarmPlayback(),
                icon: const Icon(LucideIcons.bellOff, size: 16),
                label: const Text('STOP ALARM'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFDC2626),
                  foregroundColor: Colors.white,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildConnectionBadge({
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.6,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContextBanner({
    required IconData icon,
    required Color backgroundColor,
    required Color borderColor,
    required Color iconColor,
    required String message,
    Color textColor = const Color(0xFF475569),
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(icon, size: 16, color: iconColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: textColor,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetricCard({
    required double width,
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return SizedBox(
      width: width,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE2E8F0)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 16, color: color),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.0,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    value,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF1E293B),
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      height: 1.2,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTimelineInfoPill({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 10,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBusMarker() {
    final heading = _displayHeadingDeg * (math.pi / 180);

    return Center(
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          const SpinKitRipple(
            color: Color(0xFFF59E0B),
            size: 104.0,
          ),
          Transform.rotate(
            angle: heading,
            child: Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: const Color(0xFFF59E0B).withValues(alpha: 0.3),
                  width: 2,
                ),
              ),
              alignment: Alignment.topCenter,
              child: Container(
                margin: const EdgeInsets.only(top: 2),
                width: 4,
                height: 12,
                decoration: BoxDecoration(
                  color: const Color(0xFFEA580C),
                  borderRadius: BorderRadius.circular(2),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFEA580C).withValues(alpha: 0.5),
                      blurRadius: 4,
                    )
                  ],
                ),
              ),
            ),
          ),
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [
                  Color(0xFFFACC15),
                  Color(0xFFF59E0B),
                  Color(0xFFEA580C),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFF59E0B).withValues(alpha: 0.45),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
              border: Border.all(color: Colors.white, width: 3),
            ),
            child: const Center(
              child: Icon(
                LucideIcons.bus,
                color: Colors.white,
                size: 20,
              ),
            ),
          ),
          Positioned(
            bottom: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(999),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Text(
                _liveSnapshot?['is_off_route'] == true
                    ? 'OFF ROUTE'
                    : 'LIVE BUS',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.9,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStopMarker(Map<String, dynamic> stop, int index) {
    final stopRouteDistance = _parseDouble(stop['route_distance_m']);
    final distanceFromBusOnRoute =
        stopRouteDistance - _currentRouteDistanceMeters;
    final isPassedStop = distanceFromBusOnRoute < -_stopArrivalRadiusMeters;
    final isNextStop = index == _nextStopIndex;
    final isSelectedStop =
        stop['id']?.toString() == widget.stopInfo['id']?.toString();

    final chipColor = isNextStop
        ? const Color(0xFFF59E0B)
        : isSelectedStop
            ? const Color(0xFF2563EB)
            : isPassedStop
                ? const Color(0xFFCBD5E1)
                : const Color(0xFF1E293B);
    final markerSize = isNextStop
        ? 34.0
        : isSelectedStop
            ? 28.0
            : 20.0;
    final markerOpacity = isNextStop
        ? 1.0
        : isSelectedStop
            ? 0.95
            : isPassedStop
                ? 0.45
                : 0.65;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isNextStop || isSelectedStop)
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.12),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Text(
              isNextStop
                  ? 'NEXT: ${stop['stop_name']}'
                  : stop['stop_name']?.toString() ?? 'Stop',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: chipColor,
                fontSize: 10,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        Container(
          width: markerSize,
          height: markerSize,
          decoration: BoxDecoration(
            color: chipColor.withValues(alpha: markerOpacity),
            shape: BoxShape.circle,
            border: Border.all(
              color: Colors.white,
              width: isNextStop ? 3.5 : 2.5,
            ),
            boxShadow: [
              BoxShadow(
                color: chipColor.withValues(alpha: isNextStop ? 0.32 : 0.16),
                blurRadius: isNextStop ? 16 : 6,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Center(
            child: Text(
              '${index + 1}',
              style: TextStyle(
                color: isPassedStop ? const Color(0xFF475569) : Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _mapControlButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
    bool active = false,
  }) {
    return Material(
      color: active ? const Color(0xFFF59E0B) : Colors.white,
      borderRadius: BorderRadius.circular(16),
      elevation: 4,
      shadowColor: Colors.black.withValues(alpha: 0.12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Tooltip(
          message: tooltip,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Icon(
              icon,
              color: active ? const Color(0xFF1E293B) : const Color(0xFF334155),
              size: 20,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTimelineItem(
    Map<String, dynamic> stop,
    int index,
    bool isFirst,
    bool isLast, {
    required GlobalKey dotKey,
  }) {
    final stopRouteDistance = _parseDouble(stop['route_distance_m']);
    final distanceAheadMeters = stopRouteDistance - _currentRouteDistanceMeters;
    final isPassedStop = distanceAheadMeters < -_stopArrivalRadiusMeters;
    final isNextStop = index == _nextStopIndex;
    final isSelectedStop =
        stop['id']?.toString() == widget.stopInfo['id']?.toString();
    final isArrivingNear = isNextStop && _distanceToNextStopMeters <= 200;

    final rawArrival = stop['arrival_time']?.toString() ?? '--:--';
    final shortArrival =
        rawArrival.length >= 5 ? rawArrival.substring(0, 5) : rawArrival;
    final etaMeta = _resolveTimelineEtaMeta(
      scheduledArrivalTime: stop['arrival_time']?.toString(),
      distanceAheadMeters: isNextStop
          ? _distanceToNextStopMeters
          : math.max(0, distanceAheadMeters),
      isPassedStop: isPassedStop,
    );
    final projectedArrivalLabel = etaMeta.projectedArrival == null
        ? null
        : DateFormat('hh:mm a').format(etaMeta.projectedArrival!);
    final etaLabel = etaMeta.etaMinutes == null
        ? 'ETA updating'
        : etaMeta.etaMinutes == 0
            ? 'ETA now'
            : 'ETA ${etaMeta.etaMinutes} min';
    final timelineStatusColor = _resolveTimelineStatusColor(
      etaMeta.delayStatus,
    );
    final timelineStatusLabel = etaMeta.delayStatus == 'Delayed'
        ? 'Delayed ${etaMeta.delayMinutes} min'
        : etaMeta.delayStatus;

    String distanceLabel;
    if (isPassedStop) {
      distanceLabel = 'Passed';
    } else if (isNextStop) {
      distanceLabel = _distanceToNextStopMeters <= _stopArrivalRadiusMeters
          ? 'Arriving now'
          : '${_formatDistance(_distanceToNextStopMeters)} away via route';
    } else if (distanceAheadMeters > 0) {
      distanceLabel = '${_formatDistance(distanceAheadMeters)} ahead';
    } else {
      distanceLabel = 'Up next';
    }

    final dotColor = isPassedStop
        ? const Color(0xFFCBD5E1)
        : isArrivingNear || isNextStop
            ? const Color(0xFFF59E0B)
            : isSelectedStop
                ? const Color(0xFF2563EB)
                : Colors.white;
    final borderColor = isSelectedStop && !isNextStop
        ? const Color(0xFF2563EB)
        : const Color(0xFFF59E0B);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 60,
          child: Column(
            children: [
              Text(
                shortArrival,
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: isPassedStop
                      ? const Color(0xFF94A3B8)
                      : const Color(0xFF1E293B),
                  fontSize: 14,
                ),
              ),
              const Text(
                'SCH',
                style: TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              Container(
                width: 2,
                height: 30,
                color: isFirst ? Colors.transparent : const Color(0xFFE2E8F0),
              ),
              Container(
                key: dotKey,
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: dotColor,
                  shape: BoxShape.circle,
                  border: Border.all(color: borderColor, width: 3),
                ),
                child: isArrivingNear
                    ? const Icon(
                        LucideIcons.zap,
                        color: Colors.white,
                        size: 8,
                      )
                    : null,
              ),
              Container(
                width: 2,
                height: 60,
                color: isLast ? Colors.transparent : const Color(0xFFE2E8F0),
              ),
            ],
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 2),
              Text(
                stop['stop_name']?.toString() ?? 'Stop',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
                  color: isArrivingNear
                      ? const Color(0xFFF59E0B)
                      : isPassedStop
                          ? const Color(0xFF94A3B8)
                          : const Color(0xFF1E293B),
                ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(
                    LucideIcons.mapPin,
                    size: 12,
                    color: isArrivingNear
                        ? const Color(0xFFF59E0B)
                        : const Color(0xFF94A3B8),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      distanceLabel,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: isArrivingNear
                            ? const Color(0xFFF59E0B)
                            : const Color(0xFF94A3B8),
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              if (!isPassedStop) ...[
                const SizedBox(height: 8),
                Text(
                  projectedArrivalLabel == null
                      ? 'Expected arrival updating'
                      : 'Expected $projectedArrivalLabel',
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _buildTimelineInfoPill(
                      icon: LucideIcons.clock3,
                      label: etaLabel,
                      color: const Color(0xFFF59E0B),
                    ),
                    _buildTimelineInfoPill(
                      icon: etaMeta.delayStatus == 'Delayed'
                          ? LucideIcons.timerOff
                          : etaMeta.delayStatus == 'ETA updating'
                              ? LucideIcons.clock3
                              : LucideIcons.badgeCheck,
                      label: timelineStatusLabel,
                      color: timelineStatusColor,
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              if (isArrivingNear || isSelectedStop)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: (isSelectedStop
                            ? const Color(0xFF2563EB)
                            : const Color(0xFFF59E0B))
                        .withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isArrivingNear
                        ? 'NEAR THIS STOP'
                        : isSelectedStop
                            ? 'YOUR STOP'
                            : 'ACTIVE',
                    style: TextStyle(
                      color: isSelectedStop
                          ? const Color(0xFF2563EB)
                          : const Color(0xFFF59E0B),
                      fontWeight: FontWeight.w900,
                      fontSize: 10,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SheetStateCard extends StatelessWidget {
  const _SheetStateCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}

