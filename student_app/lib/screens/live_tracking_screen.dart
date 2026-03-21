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
  LatLng _busLocation = const LatLng(12.9716, 77.5946); // Default
  List<Map<String, dynamic>> _routeStops = [];
  bool _loadingStops = true;
  Timer? _pollingTimer;
  Map<String, dynamic>? _lastTelemetry;

  @override
  void initState() {
    super.initState();
    _fetchRouteStops();
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
        setState(() {
          _routeStops = data.cast<Map<String, dynamic>>();
          _loadingStops = false;
        });
      }
    } catch (e) {
      debugPrint('Error fetching stops: $e');
    }
  }

  void _startLiveTracking() {
    _pollingTimer = Timer.periodic(const Duration(milliseconds: AppConfig.refreshIntervalMs), (_) async {
      _fetchLastLocation();
    });
  }

  Future<void> _fetchLastLocation() async {
    try {
      final response = await http.get(Uri.parse('${AppConfig.effectiveApiBase}/trips/${widget.trip['id']}/last-location'));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final newLoc = LatLng(data['latitude'], data['longitude']);
        
        setState(() {
          _busLocation = newLoc;
          _lastTelemetry = data;
        });

        // Smoothly pan map to follow bus
        _mapController.move(newLoc, _mapController.camera.zoom);
      }
    } catch (e) {
      debugPrint('Error fetching location: $e');
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
            Text(widget.trip['schedules']['buses']['bus_name'], style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
          ],
        ),
        backgroundColor: Colors.white,
        centerTitle: true,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(
        children: [
          // 🗺️ Map Section (Top 40%)
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
                        // Bus Marker
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
                                  color: const Color(0xFF2563EB).withOpacity(0.2),
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const Icon(LucideIcons.bus, color: Color(0xFF2563EB), size: 32),
                            ],
                          ),
                        ),
                        // Stops Markers
                        ..._routeStops.map((s) => Marker(
                          point: LatLng(s['latitude'], s['longitude']),
                          width: 40,
                          height: 40,
                          child: const Icon(LucideIcons.circleDot, color: Color(0xFF94A3B8), size: 12),
                        )),
                      ],
                    ),
                  ],
                ),
                
                // Floating Stats Overlay
                Positioned(
                  bottom: 24,
                  left: 24,
                  right: 24,
                  child: _buildLiveOverlay(),
                ),
              ],
            ),
          ),

          // 🕒 Timeline Section (Bottom 60%)
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
              child: _loadingStops
                  ? const Center(child: CircularProgressIndicator())
                  : _buildTimeline(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLiveOverlay() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 20, offset: const Offset(0, 10))
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle),
              ),
              const SizedBox(width: 12),
              const Text('LIVE UPDATES', style: TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF1E293B), fontSize: 12)),
            ],
          ),
          Text(
            '${_lastTelemetry?['speed']?.toStringAsFixed(0) ?? 0} KM/H',
            style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF2563EB), fontSize: 14),
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
    // Basic logic to check if stop is passed
    // In real app, we compare bus distance to each stop coordinate
    final stopLocation = LatLng(stop['latitude'], stop['longitude']);
    final distanceToStop = const Distance().as(LengthUnit.Meter, _busLocation, stopLocation);
    final isArrivingNear = distanceToStop < 200; // within 200m
    
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Time Section
        SizedBox(
          width: 60,
          child: Column(
            children: [
              Text(
                stop['arrival_time'].substring(0, 5),
                style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF1E293B), fontSize: 14),
              ),
              const Text('SCH', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
        ),

        // Timeline Line & Connector
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
                  color: isArrivingNear ? const Color(0xFF2563EB) : Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF2563EB), width: 3),
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

        // Stop Details Section
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 2),
              Text(
                stop['stop_name'],
                style: TextStyle(
                  fontWeight: FontWeight.w900, 
                  fontSize: 16, 
                  color: isArrivingNear ? const Color(0xFF2563EB) : const Color(0xFF1E293B),
                ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(LucideIcons.mapPin, size: 12, color: isArrivingNear ? const Color(0xFF2563EB) : const Color(0xFF94A3B8)),
                  const SizedBox(width: 4),
                  Text(
                    isArrivingNear ? 'Arriving Now' : '${distanceToStop > 1000 ? (distanceToStop/1000).toStringAsFixed(1) + ' km' : distanceToStop.toString() + ' m'} away',
                    style: TextStyle(color: isArrivingNear ? const Color(0xFF2563EB) : const Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (isArrivingNear)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF2563EB).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text('ON TIME', style: TextStyle(color: Color(0xFF2563EB), fontWeight: FontWeight.w900, fontSize: 10)),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
