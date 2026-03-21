import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:lucide_icons/lucide_icons.dart';
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

  final MapController _mapController = MapController();
  final Distance _distance = const Distance();

  late final AnimationController _markerAnimationController;
  Timer? _pollingTimer;
  bool _loadingStops = true;
  bool _loadingLocation = true;
  bool _followBus = true;
  bool _mapReady = false;
  bool _hasLoadedFullGeometry = false;

  LatLng _displayBusLocation = const LatLng(12.9716, 77.5946);
  LatLng? _rawBusLocation;
  LatLng? _snappedBusLocation;
  LatLng? _targetBusLocation;
  LatLng? _activeNextStopLocation;
  LatLng? _animationStartLocation;
  LatLng? _animationEndLocation;

  List<Map<String, dynamic>> _routeStops = [];
  List<LatLng> _fullRouteGeometry = [];
  List<LatLng> _activeRouteTailGeometry = [];
  List<LatLng> _offRouteConnectorTailGeometry = [];
  List<LatLng> _activeRouteGeometry = [];
  List<LatLng> _offRouteConnectorGeometry = [];

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

  @override
  void initState() {
    super.initState();
    _markerAnimationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: AppConfig.refreshIntervalMs),
    )..addListener(_handleMarkerAnimationTick);
    _fetchLiveRoute(includeFullGeometry: true);
    _startLiveTracking();
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    _markerAnimationController.dispose();
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
    final centerDistance = _distanceMeters(_mapController.camera.center, _displayBusLocation);
    final zoomDelta = (_mapController.camera.zoom - targetZoom).abs();
    if (centerDistance < 2 && zoomDelta < 0.01) return;
    _mapController.move(_displayBusLocation, targetZoom);
  }

  void _handleMapEvent(MapEvent event) {
    final isUserDriven =
        event.source != MapEventSource.mapController &&
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
      _offRouteConnectorGeometry = _buildOffRouteConnector(
        busLocation: animatedLocation,
        connectorGeometry: _offRouteConnectorTailGeometry,
      );
    });

    if (_followBus) {
      _centerOnBus();
    }
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
    final x =
        math.cos(fromLat) * math.sin(toLat) -
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

      final t =
          ((pointMeters.x * dx + pointMeters.y * dy) / lengthSquared).clamp(0.0, 1.0).toDouble();
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
        ? telemetryTimestamp.difference(_lastTelemetryTimestamp!).inMilliseconds.abs()
        : AppConfig.refreshIntervalMs;
    final gapSeconds = (gapMs.clamp(1000, 15000)) / 1000.0;
    final speedMs = (math.max(speedKmh, _stationarySpeedThresholdKmh) * 1000) / 3600;
    final plausibleDistance = math.max(120.0, speedMs * gapSeconds * 4.0);

    return distanceMeters > math.max(_outlierJumpThresholdMeters, plausibleDistance + 120.0);
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
    final difference = _shortestAngleDelta(movementHeading, serverHeadingDeg).abs();

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
        ? telemetryTimestamp.difference(_lastTelemetryTimestamp!).inMilliseconds.abs()
        : AppConfig.refreshIntervalMs;
    final baseDurationMs = ((gapMs.clamp(900, _maxAnimationDurationMs) - _animationBufferMs)
            .clamp(_minAnimationDurationMs, _maxAnimationDurationMs))
        .round();

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
      milliseconds: durationMs.clamp(_minAnimationDurationMs, _maxAnimationDurationMs),
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
    _offRouteConnectorGeometry = _buildOffRouteConnector(
      busLocation: location,
      connectorGeometry: _offRouteConnectorTailGeometry,
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

  int _resolveNextStopIndex(List<Map<String, dynamic>> stops, Map<String, dynamic> payload) {
    if (stops.isEmpty) return 0;

    final nextStop = payload['next_stop'];
    if (nextStop is Map) {
      final nextStopId = nextStop['id']?.toString();
      if (nextStopId != null) {
        final matchIndex = stops.indexWhere((stop) => stop['id']?.toString() == nextStopId);
        if (matchIndex >= 0) return matchIndex;
      }

      final stopSequence = _parseInt(nextStop['stop_sequence'], fallback: 0);
      if (stopSequence > 0 && stopSequence <= stops.length) {
        return stopSequence - 1;
      }
    }

    return 0;
  }

  String _formatDistance(double distanceMeters) {
    if (distanceMeters >= 1000) {
      return '${(distanceMeters / 1000).toStringAsFixed(1)} km';
    }
    return '${distanceMeters.toStringAsFixed(0)} m';
  }

  LatLng? _resolveNextStopLocation(
    List<Map<String, dynamic>> stops,
    int nextStopIndex,
    Map<String, dynamic> payload,
  ) {
    if (stops.isNotEmpty && nextStopIndex >= 0 && nextStopIndex < stops.length) {
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

  List<LatLng> _buildActiveRouteSegment({
    required LatLng busLocation,
    required List<LatLng> routeSegment,
    required LatLng? nextStopLocation,
  }) {
    if (routeSegment.length >= 2) {
      return _prependUniquePoint(busLocation, routeSegment);
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

  List<LatLng> _buildOffRouteConnector({
    required LatLng busLocation,
    required List<LatLng> connectorGeometry,
  }) {
    if (connectorGeometry.length >= 2) {
      return _prependUniquePoint(busLocation, connectorGeometry);
    }

    if (connectorGeometry.length == 1) {
      return [busLocation, connectorGeometry.first];
    }

    return const [];
  }

  Future<void> _fetchLiveRoute({bool includeFullGeometry = false}) async {
    final tripId = widget.trip['id'];
    final shouldIncludeFullGeometry = includeFullGeometry || !_hasLoadedFullGeometry;
    final uri = Uri.parse(
      '${AppConfig.effectiveApiBase}/trips/$tripId/live-route'
      '${shouldIncludeFullGeometry ? '?include_full_geometry=true' : ''}',
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
      final routeGeometryForDisplay = fullRouteGeometry.isNotEmpty ? fullRouteGeometry : _fullRouteGeometry;
      final nextStopIndex = _resolveNextStopIndex(routeStops, payload);
      final nextStopLocation = _resolveNextStopLocation(routeStops, nextStopIndex, payload);
      final nextStopGeometry = _parseGeometry(payload['next_stop_geometry']);
      final recoveryGeometry = _parseGeometry(payload['recovery_geometry']);
      final distanceFromRouteMeters = _parseDouble(payload['distance_from_route_m']);
      final speedKmh = _parseDouble(payload['speed']);
      final serverHeadingDeg = _normalizeAngle(_parseDouble(payload['heading']));
      final routeDistanceMeters = _parseDouble(payload['current_route_distance_m']);
      final telemetryTimestamp = payload['last_seen_at'] is String
          ? DateTime.tryParse(payload['last_seen_at'])?.toLocal()
          : null;
      final baseLocation =
          (isOffRoute ? rawLocation ?? snappedLocation : snappedLocation ?? rawLocation) ??
              _displayBusLocation;
      final routeAlignedLocation = _resolveMarkerTargetLocation(
        baseLocation: baseLocation,
        routeGeometry: routeGeometryForDisplay,
        isOffRoute: isOffRoute,
        distanceFromRouteMeters: distanceFromRouteMeters,
      );
      final smoothedLocation = _smoothMarkerTarget(routeAlignedLocation, speedKmh);
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
      final showOffRouteConnector =
          isOffRoute && distanceFromRouteMeters >= _offRouteVisualThresholdMeters;
      final shouldApplyImmediately = _targetBusLocation == null || isOutlier;

      if (!mounted) return;
      setState(() {
        _rawBusLocation = rawLocation;
        _snappedBusLocation = snappedLocation;
        _routeStops = routeStops;
        _activeNextStopLocation = nextStopLocation;
        _activeRouteTailGeometry = nextStopGeometry;
        _offRouteConnectorTailGeometry = showOffRouteConnector ? recoveryGeometry : const [];
        _activeRouteGeometry = _buildActiveRouteSegment(
          busLocation: _displayBusLocation,
          routeSegment: _activeRouteTailGeometry,
          nextStopLocation: _activeNextStopLocation,
        );
        _offRouteConnectorGeometry = _buildOffRouteConnector(
          busLocation: _displayBusLocation,
          connectorGeometry: _offRouteConnectorTailGeometry,
        );
        if (fullRouteGeometry.isNotEmpty) {
          _fullRouteGeometry = fullRouteGeometry;
          _hasLoadedFullGeometry = true;
        }
        _liveSnapshot = payload;
        _nextStopIndex = nextStopIndex;
        _distanceToNextStopMeters = _parseDouble(payload['distance_to_next_stop_m']);
        _remainingRouteDistanceMeters = _parseDouble(payload['remaining_distance_m']);
        _distanceToRouteMeters = distanceFromRouteMeters;
        _etaMinutes = payload['eta_minutes'] == null ? null : _parseInt(payload['eta_minutes']);
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
    final schedules = Map<String, dynamic>.from(widget.trip['schedules'] ?? const {});
    final bus = Map<String, dynamic>.from(schedules['buses'] ?? const {});

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Column(
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
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
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
      body: Column(
        children: [
          Expanded(
            flex: 5,
            child: Stack(
              children: [
                FlutterMap(
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
                    if (_fullRouteGeometry.length >= 2)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _fullRouteGeometry,
                            color: const Color(0xFFCBD5E1).withValues(alpha: 0.65),
                            strokeWidth: 3.5,
                            borderColor: Colors.white.withValues(alpha: 0.5),
                            borderStrokeWidth: 1.25,
                          ),
                        ],
                      ),
                    if (_activeRouteGeometry.length >= 2)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _activeRouteGeometry,
                            strokeWidth: 7,
                            borderColor: Colors.white.withValues(alpha: 0.92),
                            borderStrokeWidth: 2.5,
                            gradientColors: const [
                              Color(0xFFFDE047),
                              Color(0xFFF59E0B),
                              Color(0xFFEA580C),
                            ],
                          ),
                        ],
                      ),
                    if (_offRouteConnectorGeometry.length >= 2)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _offRouteConnectorGeometry,
                            color: const Color(0xFFDC2626),
                            strokeWidth: 4,
                            isDotted: true,
                          ),
                        ],
                      ),
                    MarkerLayer(
                      markers: [
                        if (_liveSnapshot?['is_off_route'] == true &&
                            _distanceToRouteMeters >= _offRouteVisualThresholdMeters &&
                            _snappedBusLocation != null &&
                            _rawBusLocation != null)
                          Marker(
                            point: _snappedBusLocation!,
                            width: 28,
                            height: 28,
                            child: Center(
                              child: Container(
                                width: 14,
                                height: 14,
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: const Color(0xFFDC2626),
                                    width: 3,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        Marker(
                          point: _displayBusLocation,
                          width: 104,
                          height: 104,
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
                            child: _buildStopMarker(entry.value, entry.key),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                Positioned(
                  top: 20,
                  right: 16,
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
                        icon: _followBus ? LucideIcons.locateFixed : LucideIcons.locate,
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
              ],
            ),
          ),
          Expanded(
            flex: 6,
            child: Container(
              padding: const EdgeInsets.only(top: 24, left: 24, right: 24),
              decoration: const BoxDecoration(
                color: Color(0xFFF8FAFC),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(32),
                  topRight: Radius.circular(32),
                ),
              ),
              child: Column(
                children: [
                  _buildLiveOverlay(),
                  const SizedBox(height: 20),
                  Expanded(
                    child: _loadingStops
                        ? const Center(child: CircularProgressIndicator())
                        : _buildTimeline(),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveOverlay() {
    final speed = _parseDouble(_liveSnapshot?['speed']);
    final heading = _displayHeadingDeg;
    final nextStop = _routeStops.isNotEmpty && _nextStopIndex < _routeStops.length
        ? _routeStops[_nextStopIndex]
        : (_liveSnapshot?['next_stop'] is Map
            ? Map<String, dynamic>.from(_liveSnapshot!['next_stop'])
            : null);
    final etaText = _etaMinutes == null
        ? 'ETA updating'
        : _etaMinutes == 0
            ? 'Arriving'
            : 'ETA $_etaMinutes min';
    final delayText = _delayStatus == 'Delayed'
        ? 'Delayed by $_delayMinutes min'
        : 'On time';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: _locationError == null ? Colors.green : Colors.red,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    _locationError == null ? 'LIVE UPDATES' : 'RECONNECTING',
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF1E293B),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
              Text(
                '${speed.toStringAsFixed(0)} KM/H',
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  color: Color(0xFFF59E0B),
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            _followBus
                ? 'Map is following the snapped live route.'
                : 'Follow mode paused. Drag freely, then tap the target button to recenter.',
            style: const TextStyle(
              color: Color(0xFF64748B),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          if (nextStop != null)
            Text(
              _liveSnapshot?['is_off_route'] == true &&
                      _distanceToRouteMeters >= _offRouteVisualThresholdMeters
                  ? 'Off route. Recovery path to ${nextStop['stop_name']}  |  ${_formatDistance(_distanceToRouteMeters)} away from route'
                  : 'Next stop: ${nextStop['stop_name']}  |  ${_formatDistance(_distanceToNextStopMeters)}  |  $etaText',
              style: TextStyle(
                color: _liveSnapshot?['is_off_route'] == true &&
                        _distanceToRouteMeters >= _offRouteVisualThresholdMeters
                    ? const Color(0xFFDC2626)
                    : const Color(0xFF475569),
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          if (nextStop != null) const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _buildInfoPill(
                icon: LucideIcons.clock3,
                label: etaText,
                color: const Color(0xFFF59E0B),
              ),
              _buildInfoPill(
                icon: _delayStatus == 'Delayed' ? LucideIcons.timerOff : LucideIcons.badgeCheck,
                label: delayText,
                color: _delayStatus == 'Delayed' ? const Color(0xFFDC2626) : const Color(0xFF2563EB),
              ),
              _buildInfoPill(
                icon: LucideIcons.navigation,
                label: '${_formatDistance(_remainingRouteDistanceMeters)} left',
                color: const Color(0xFF475569),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (_loadingLocation)
            const Text(
              'Loading live location...',
              style: TextStyle(
                color: Color(0xFF64748B),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            )
          else if (_locationError != null)
            Text(
              _locationError!,
              style: const TextStyle(
                color: Color(0xFFDC2626),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
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

  Widget _buildInfoPill({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11,
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
          Container(
            width: 70,
            height: 70,
            decoration: BoxDecoration(
              color: const Color(0xFFF59E0B).withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
          ),
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFFACC15), Color(0xFFF59E0B), Color(0xFFEA580C)],
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
            child: Transform.rotate(
              angle: heading,
              child: const Icon(
                LucideIcons.bus,
                color: Color(0xFF1E293B),
                size: 22,
              ),
            ),
          ),
          Positioned(
            top: 10,
            child: Container(
              width: 2,
              height: 18,
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B).withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(99),
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
                _liveSnapshot?['is_off_route'] == true ? 'OFF ROUTE' : 'LIVE BUS',
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
    final distanceFromBusOnRoute = stopRouteDistance - _currentRouteDistanceMeters;
    final isPassedStop = distanceFromBusOnRoute < -_stopArrivalRadiusMeters;
    final isNextStop = index == _nextStopIndex;
    final isSelectedStop = stop['id']?.toString() == widget.stopInfo['id']?.toString();

    final chipColor = isNextStop
        ? const Color(0xFFF59E0B)
        : isSelectedStop
            ? const Color(0xFF2563EB)
            : isPassedStop
                ? const Color(0xFFCBD5E1)
                : const Color(0xFF1E293B);
    final markerSize = isNextStop ? 34.0 : isSelectedStop ? 28.0 : 20.0;
    final markerOpacity = isNextStop ? 1.0 : isSelectedStop ? 0.95 : isPassedStop ? 0.45 : 0.65;

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
              isNextStop ? 'NEXT: ${stop['stop_name']}' : stop['stop_name']?.toString() ?? 'Stop',
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

  Widget _buildTimeline() {
    if (_routeStops.isEmpty) {
      return const Center(
        child: Text(
          'No route stops configured yet.',
          style: TextStyle(
            color: Color(0xFF94A3B8),
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
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
        const SizedBox(height: 24),
        Expanded(
          child: ListView.builder(
            itemCount: _routeStops.length,
            itemBuilder: (context, index) {
              final stop = _routeStops[index];
              return _buildTimelineItem(stop, index, index == 0, index == _routeStops.length - 1);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildTimelineItem(
    Map<String, dynamic> stop,
    int index,
    bool isFirst,
    bool isLast,
  ) {
    final stopRouteDistance = _parseDouble(stop['route_distance_m']);
    final distanceAheadMeters = stopRouteDistance - _currentRouteDistanceMeters;
    final isPassedStop = distanceAheadMeters < -_stopArrivalRadiusMeters;
    final isNextStop = index == _nextStopIndex;
    final isSelectedStop = stop['id']?.toString() == widget.stopInfo['id']?.toString();
    final isArrivingNear = isNextStop && _distanceToNextStopMeters <= 200;

    final rawArrival = stop['arrival_time']?.toString() ?? '--:--';
    final shortArrival = rawArrival.length >= 5 ? rawArrival.substring(0, 5) : rawArrival;

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
                  color: isPassedStop ? const Color(0xFF94A3B8) : const Color(0xFF1E293B),
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
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: dotColor,
                  shape: BoxShape.circle,
                  border: Border.all(color: borderColor, width: 3),
                ),
                child: isArrivingNear
                    ? const Icon(LucideIcons.zap, color: Colors.white, size: 8)
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
                  Text(
                    distanceLabel,
                    style: TextStyle(
                      color: isArrivingNear
                          ? const Color(0xFFF59E0B)
                          : const Color(0xFF94A3B8),
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (isArrivingNear || isSelectedStop)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: (isSelectedStop ? const Color(0xFF2563EB) : const Color(0xFFF59E0B))
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
