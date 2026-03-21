import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:http/http.dart' as http;
import 'package:lucide_icons/lucide_icons.dart';
import 'package:intl/intl.dart';
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
  final MapController _mapController = MapController();
  LatLng _busLocation = const LatLng(12.9716, 77.5946);
  List<Map<String, dynamic>> _routeStops = [];
  bool _loadingStops = true;
  bool _loadingLocation = true;
  String? _locationError;
  Timer? _pollingTimer;
  Map<String, dynamic>? _lastTelemetry;
  DateTime? _lastUpdatedAt;

  @override
  void initState() {
    super.initState();
    _fetchRouteStops();
    _fetchLastLocation();
    _startLiveTracking();
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetchRouteStops() async {
    try {
      final routeId = widget.trip['schedules']['routes']['id'];
      final shift = widget.trip['schedule_type'];
      final response = await http.get(Uri.parse('${AppConfig.effectiveApiBase}/stops?route_id=$routeId&schedule_type=$shift'));

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        if (!mounted) return;
        setState(() {
          _routeStops = data.cast<Map<String, dynamic>>();
          _loadingStops = false;
        });
      } else {
        if (!mounted) return;
        setState(() => _loadingStops = false);
      }
    } catch (e) {
      debugPrint('Error fetching stops: $e');
      if (!mounted) return;
      setState(() => _loadingStops = false);
    }
  }

  void _startLiveTracking() {
    _pollingTimer = Timer.periodic(
      const Duration(milliseconds: AppConfig.refreshIntervalMs),
      (_) => _fetchLastLocation(),
    );
  }

  Future<void> _fetchLastLocation() async {
    try {
      final response = await http.get(Uri.parse('${AppConfig.effectiveApiBase}/trips/${widget.trip['id']}/last-location'));
      if (response.statusCode == 200) {
        final data = Map<String, dynamic>.from(jsonDecode(response.body));
        final newLoc = LatLng(
          (data['latitude'] as num).toDouble(),
          (data['longitude'] as num).toDouble(),
        );

        if (!mounted) return;
        setState(() {
          _busLocation = newLoc;
          _lastTelemetry = data;
          _lastUpdatedAt = DateTime.now();
          _locationError = data['is_online'] == false
              ? 'Bus is currently offline (no recent GPS updates).'
              : null;
          _loadingLocation = false;
        });

        _mapController.move(newLoc, _mapController.camera.zoom);
      } else {
        if (!mounted) return;
        setState(() {
          _loadingLocation = false;
          _locationError = 'Waiting for live location data...';
        });
      }
    } catch (e) {
      debugPrint('Error fetching location: $e');
      if (!mounted) return;
      setState(() {
        _loadingLocation = false;
        _locationError = 'Connection lost. Retrying automatically...';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Column(
          children: [
            const Text('WHERE IS MY BUS', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Color(0xFF94A3B8), letterSpacing: 2)),
            Text(
              widget.trip['schedules']['buses']['bus_name']?.toString() ?? 'Bus',
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
            onPressed: () => _mapController.move(_busLocation, _mapController.camera.zoom),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            flex: 2,
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: _busLocation,
                    initialZoom: 15.0,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'in.edu.mpnmjec.student',
                    ),
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: _busLocation,
                          width: 80,
                          height: 80,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Container(
                                width: 24,
                                height: 24,
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF59E0B).withValues(alpha: 0.2),
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const Icon(LucideIcons.bus, color: Color(0xFFF59E0B), size: 32),
                            ],
                          ),
                        ),
                        ..._routeStops.map(
                          (s) => Marker(
                            point: LatLng((s['latitude'] as num).toDouble(), (s['longitude'] as num).toDouble()),
                            width: 40,
                            height: 40,
                            child: const Icon(LucideIcons.circleDot, color: Color(0xFF94A3B8), size: 12),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                Positioned(
                  bottom: 24,
                  left: 24,
                  right: 24,
                  child: _buildLiveOverlay(),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 3,
            child: Container(
              padding: const EdgeInsets.only(top: 24, left: 24, right: 24),
              decoration: const BoxDecoration(
                color: Color(0xFFF8FAFC),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(32),
                  topRight: Radius.circular(32),
                ),
              ),
              child: _loadingStops ? const Center(child: CircularProgressIndicator()) : _buildTimeline(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveOverlay() {
    final speed = (_lastTelemetry?['speed'] as num?)?.toDouble() ?? 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 20, offset: const Offset(0, 10))],
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
                    style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF1E293B), fontSize: 12),
                  ),
                ],
              ),
              Text(
                '${speed.toStringAsFixed(0)} KM/H',
                style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFFF59E0B), fontSize: 14),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (_loadingLocation)
            const Text(
              'Loading live location...',
              style: TextStyle(color: Color(0xFF64748B), fontSize: 12, fontWeight: FontWeight.w600),
            )
          else if (_locationError != null)
            Text(
              _locationError!,
              style: const TextStyle(color: Color(0xFFDC2626), fontSize: 12, fontWeight: FontWeight.w600),
            )
          else if (_lastUpdatedAt != null)
            Text(
              'Updated ${DateFormat('hh:mm:ss a').format(_lastUpdatedAt!)}',
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 12, fontWeight: FontWeight.w600),
            ),
        ],
      ),
    );
  }

  Widget _buildTimeline() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'STATION TIMELINE',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: Color(0xFF94A3B8), letterSpacing: 1.5),
        ),
        const SizedBox(height: 24),
        Expanded(
          child: ListView.builder(
            itemCount: _routeStops.length,
            itemBuilder: (context, index) {
              final stop = _routeStops[index];
              return _buildTimelineItem(stop, index == 0, index == _routeStops.length - 1);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildTimelineItem(Map<String, dynamic> stop, bool isFirst, bool isLast) {
    final stopLocation = LatLng((stop['latitude'] as num).toDouble(), (stop['longitude'] as num).toDouble());
    final distanceToStop = const Distance().as(LengthUnit.Meter, _busLocation, stopLocation);
    final isArrivingNear = distanceToStop < 200;

    final rawArrival = stop['arrival_time']?.toString() ?? '--:--';
    final shortArrival = rawArrival.length >= 5 ? rawArrival.substring(0, 5) : rawArrival;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 60,
          child: Column(
            children: [
              Text(
                shortArrival,
                style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF1E293B), fontSize: 14),
              ),
              const Text('SCH', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10, fontWeight: FontWeight.bold)),
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
                  color: isArrivingNear ? const Color(0xFFF59E0B) : Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFFF59E0B), width: 3),
                ),
                child: isArrivingNear ? const Icon(LucideIcons.zap, color: Colors.white, size: 8) : null,
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
                  color: isArrivingNear ? const Color(0xFFF59E0B) : const Color(0xFF1E293B),
                ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(LucideIcons.mapPin, size: 12, color: isArrivingNear ? const Color(0xFFF59E0B) : const Color(0xFF94A3B8)),
                  const SizedBox(width: 4),
                  Text(
                    isArrivingNear
                        ? 'Arriving now'
                        : '${distanceToStop > 1000 ? '${(distanceToStop / 1000).toStringAsFixed(1)} km' : '${distanceToStop.toStringAsFixed(0)} m'} away',
                    style: TextStyle(
                      color: isArrivingNear ? const Color(0xFFF59E0B) : const Color(0xFF94A3B8),
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (isArrivingNear)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'NEAR YOUR STOP',
                    style: TextStyle(color: Color(0xFFF59E0B), fontWeight: FontWeight.w900, fontSize: 10),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
