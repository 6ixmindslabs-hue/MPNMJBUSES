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

class _LiveTrackingScreenState extends State<LiveTrackingScreen> {
  static const double _stopArrivalRadiusMeters = 80;

  final MapController _mapController = MapController();

  Timer? _pollingTimer;
  bool _loadingStops = true;
  bool _loadingLocation = true;
  bool _followBus = true;
  bool _mapReady = false;
  bool _hasLoadedFullGeometry = false;

  LatLng _displayBusLocation = const LatLng(12.9716, 77.5946);
  LatLng? _rawBusLocation;
  LatLng? _snappedBusLocation;

  List<Map<String, dynamic>> _routeStops = [];
  List<LatLng> _fullRouteGeometry = [];
  List<LatLng> _passedRouteGeometry = [];
  List<LatLng> _remainingRouteGeometry = [];
  List<LatLng> _nextStopGeometry = [];
  List<LatLng> _recoveryGeometry = [];

  String? _locationError;
  Map<String, dynamic>? _liveSnapshot;
  DateTime? _lastUpdatedAt;
  int _nextStopIndex = 0;
  double _distanceToNextStopMeters = 0;
  double _remainingRouteDistanceMeters = 0;
  double _distanceToRouteMeters = 0;
  int _currentRouteDistanceMeters = 0;
  int? _etaMinutes;
  int _delayMinutes = 0;
  String _delayStatus = 'On Time';

  @override
  void initState() {
    super.initState();
    _fetchLiveRoute(includeFullGeometry: true);
    _startLiveTracking();
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
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
    _mapController.move(_displayBusLocation, zoom ?? _mapController.camera.zoom);
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
      final displayLocation =
          (isOffRoute ? rawLocation ?? snappedLocation : snappedLocation ?? rawLocation) ??
              _displayBusLocation;
      final routeStops = _parseStops(payload['stops']);
      final fullRouteGeometry = _parseGeometry(payload['full_route_geometry']);

      if (!mounted) return;
      setState(() {
        _rawBusLocation = rawLocation;
        _snappedBusLocation = snappedLocation;
        _displayBusLocation = displayLocation;
        _routeStops = routeStops;
        _passedRouteGeometry = _parseGeometry(payload['passed_geometry']);
        _nextStopGeometry = _parseGeometry(payload['next_stop_geometry']);
        _remainingRouteGeometry = _parseGeometry(payload['remaining_geometry']);
        _recoveryGeometry = _parseGeometry(payload['recovery_geometry']);
        if (fullRouteGeometry.isNotEmpty) {
          _fullRouteGeometry = fullRouteGeometry;
          _hasLoadedFullGeometry = true;
        }
        _liveSnapshot = payload;
        _nextStopIndex = _resolveNextStopIndex(routeStops, payload);
        _distanceToNextStopMeters = _parseDouble(payload['distance_to_next_stop_m']);
        _remainingRouteDistanceMeters = _parseDouble(payload['remaining_distance_m']);
        _distanceToRouteMeters = _parseDouble(payload['distance_from_route_m']);
        _currentRouteDistanceMeters = _parseInt(payload['current_route_distance_m']);
        _etaMinutes = payload['eta_minutes'] == null ? null : _parseInt(payload['eta_minutes']);
        _delayMinutes = _parseInt(payload['delay_minutes']);
        _delayStatus = (payload['delay_status'] ?? 'On Time').toString();
        _lastUpdatedAt = payload['last_seen_at'] is String
            ? DateTime.tryParse(payload['last_seen_at'])?.toLocal()
            : null;
        _loadingStops = false;
        _loadingLocation = false;
        _locationError = payload['is_online'] == false
            ? (rawLocation == null && snappedLocation == null
                ? 'Waiting for live GPS from the driver.'
                : 'Bus is offline. Showing the last known route position.')
            : null;
      });

      if (_followBus) {
        _centerOnBus();
      }
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
                            color: const Color(0xFFD7DEE8),
                            strokeWidth: 5,
                            borderColor: Colors.white.withValues(alpha: 0.8),
                            borderStrokeWidth: 2,
                          ),
                        ],
                      ),
                    if (_passedRouteGeometry.length >= 2)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _passedRouteGeometry,
                            color: const Color(0xFF94A3B8).withValues(alpha: 0.5),
                            strokeWidth: 5,
                          ),
                        ],
                      ),
                    if (_remainingRouteGeometry.length >= 2)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _remainingRouteGeometry,
                            strokeWidth: 6,
                            borderColor: Colors.white.withValues(alpha: 0.8),
                            borderStrokeWidth: 2,
                            gradientColors: const [
                              Color(0xFFF59E0B),
                              Color(0xFFEA580C),
                            ],
                          ),
                        ],
                      ),
                    if (_nextStopGeometry.length >= 2)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _nextStopGeometry,
                            strokeWidth: 8,
                            borderColor: Colors.white.withValues(alpha: 0.9),
                            borderStrokeWidth: 2,
                            gradientColors: const [
                              Color(0xFFFDE047),
                              Color(0xFFF59E0B),
                            ],
                          ),
                        ],
                      ),
                    if (_recoveryGeometry.length >= 2)
                      PolylineLayer(
                        polylines: [
                          Polyline(
                            points: _recoveryGeometry,
                            color: const Color(0xFFDC2626),
                            strokeWidth: 4,
                            isDotted: true,
                          ),
                        ],
                      ),
                    MarkerLayer(
                      markers: [
                        if (_liveSnapshot?['is_off_route'] == true &&
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
    final heading = _parseDouble(_liveSnapshot?['heading']);
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
              _liveSnapshot?['is_off_route'] == true
                  ? 'Off route. Recovery path to ${nextStop['stop_name']}  |  ${_formatDistance(_distanceToRouteMeters)} away from route'
                  : 'Next stop: ${nextStop['stop_name']}  |  ${_formatDistance(_distanceToNextStopMeters)}  |  $etaText',
              style: TextStyle(
                color: _liveSnapshot?['is_off_route'] == true
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
    final heading = _parseDouble(_liveSnapshot?['heading']) * (math.pi / 180);

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
          width: isNextStop ? 30 : 24,
          height: isNextStop ? 30 : 24,
          decoration: BoxDecoration(
            color: chipColor,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [
              BoxShadow(
                color: chipColor.withValues(alpha: 0.25),
                blurRadius: isNextStop ? 14 : 8,
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
