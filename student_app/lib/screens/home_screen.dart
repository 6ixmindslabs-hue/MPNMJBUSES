// lib/screens/home_screen.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _supabase = Supabase.instance.client;
  final _mapController = MapController();

  List<Map<String, dynamic>> _routes = [];
  List<Map<String, dynamic>> _activeTrips = [];
  Map<String, dynamic>? _selectedRoute;
  Map<String, dynamic>? _focusedTrip;
  
  RealtimeChannel? _telemetryChannel;
  bool _loadingRoutes = true;

  @override
  void initState() {
    super.initState();
    _loadRoutes();
    _loadActiveTrips().then((_) {
      _listenForLiveTelemetry();
    });
  }

  @override
  void dispose() {
    _telemetryChannel?.unsubscribe();
    super.dispose();
  }

  void _listenForLiveTelemetry() {
    if (_telemetryChannel != null) return;

    _telemetryChannel = _supabase.channel('public:telemetry').on(
      RealtimeListenTypes.postgresChanges,
      ChannelFilter(event: 'INSERT', schema: 'public', table: 'telemetry'),
      (payload, [ref]) {
        final newPoint = payload.new;
        if (!mounted) return;

        setState(() {
          final tripIndex = _activeTrips.indexWhere((t) => t['id'] == newPoint['trip_id']);
          if (tripIndex != -1) {
            _activeTrips[tripIndex]['telemetry_cache'] = {
              'latitude': newPoint['latitude'],
              'longitude': newPoint['longitude'],
              'speed': newPoint['speed'],
              'timestamp': newPoint['timestamp'],
            };
            
            // If the focused trip is the one being updated, move the map
            if (_focusedTrip != null && _focusedTrip!['id'] == newPoint['trip_id']) {
              final newLatLng = LatLng(newPoint['latitude'], newPoint['longitude']);
              _mapController.move(newLatLng, _mapController.camera.zoom);
            }
          }
        });
      },
    );
    _telemetryChannel!.subscribe();
  }

  Future<void> _loadRoutes() async {
    try {
      final data = await _supabase.from('routes').select('*');
      if (data != null && mounted) {
        setState(() { 
          _routes = List<Map<String, dynamic>>.from(data); 
          _loadingRoutes = false; 
        });
      }
    } catch (e) {
      // Fallback for demo if DB fails
      if (mounted) {
        setState(() {
          _routes = [{'id': 'demo-r', 'name': 'Demo Virtual Route', 'polyline': [[12.9716, 77.5946], [13.0100, 77.6300]]}];
          _loadingRoutes = false;
        });
      }
    }
  }

  Future<void> _loadActiveTrips() async {
    try {
      final List<dynamic> data = await _supabase
          .from('trips')
          .select('*, routes(name, polyline), buses(registration_number)')
          .in_('status', ['started', 'running', 'paused']);

      final List<Map<String, dynamic>> enrichedTrips = [];
      for (var trip in data) {
        final Map<String, dynamic> t = Map<String, dynamic>.from(trip);
        final telemetry = await _getLatestTelemetry(t['id']);
        t['telemetry_cache'] = telemetry;
        enrichedTrips.add(t);
      }

      if (mounted) {
        setState(() => _activeTrips = enrichedTrips);
      }
    } catch (e) {
      if (mounted && _activeTrips.isEmpty) {
        // Mock moving telemetry for demo
        final now = DateTime.now();
        final lat = 12.9716 + (now.second % 60) * 0.0005;
        final lng = 77.5946 + (now.second % 60) * 0.0005;

        setState(() => _activeTrips = [{
          'id': 'demo-trip-123',
          'status': 'running',
          'buses': {'registration_number': 'KA-01-GHOST'},
          'routes': {'name': 'Demo Virtual Route', 'polyline': [[12.9716, 77.5946], [13.0100, 77.6300]]},
          'delay_minutes': 0,
          'telemetry_cache': {'latitude': lat, 'longitude': lng}
        }]);
      }
    }
  }

  Future<Map<String, dynamic>?> _getLatestTelemetry(String tripId) async {
    final data = await _supabase
        .from('telemetry')
        .select('latitude, longitude, speed, timestamp')
        .eq('trip_id', tripId)
        .order('timestamp', ascending: false)
        .limit(1)
        .maybeSingle();
    return data;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Stack(
        children: [
          // Map fills the whole screen
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: const LatLng(12.9716, 77.5946),
              initialZoom: 13,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'in.edu.mpnmjec.student',
              ),
              // Draw selected route polyline
              if (_selectedRoute != null && _selectedRoute!['polyline'] != null)
                PolylineLayer(polylines: [
                  Polyline(
                    points: (_selectedRoute!['polyline'] as List)
                        .map((c) => LatLng((c is List ? c[0] : c['lat']).toDouble(), (c is List ? c[1] : c['lng']).toDouble()))
                        .toList(),
                    color: const Color(0xFF2563EB),
                    strokeWidth: 4.0,
                  ),
                ]),
              // Bus markers
              MarkerLayer(
                markers: _activeTrips.map((trip) {
                  final telemetry = trip['telemetry_cache']; // We'll add this to the state
                  final pos = telemetry != null 
                    ? LatLng(telemetry['latitude'], telemetry['longitude'])
                    : const LatLng(12.9716, 77.5946);

                  return Marker(
                    point: pos,
                    width: 48, height: 48,
                    child: GestureDetector(
                      onTap: () {
                        setState(() => _focusedTrip = trip);
                        final telemetry = trip['telemetry_cache'];
                        if (telemetry != null) {
                           final pos = LatLng(telemetry['latitude'], telemetry['longitude']);
                          _mapController.move(pos, _mapController.camera.zoom);
                        }
                      },
                      child: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFF2563EB),
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: const Color(0xFF2563EB).withOpacity(0.5), blurRadius: 12)],
                        ),
                        child: const Icon(Icons.directions_bus_rounded, color: Colors.white, size: 26),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),

          // Top bar
          Positioned(
            top: 0, left: 0, right: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 10)],
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.directions_bus_rounded, color: Color(0xFF2563EB), size: 20),
                            const SizedBox(width: 8),
                            const Text('MPNMJEC Bus Tracker', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                            const Spacer(),
                            Container(
                              width: 8, height: 8,
                              decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle),
                            ),
                            const SizedBox(width: 5),
                            Text('${_activeTrips.length} Live', style: const TextStyle(color: Colors.green, fontSize: 12, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Bottom sheet with route selection + focused trip info
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 20, offset: Offset(0, -4))],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 40, height: 4, margin: const EdgeInsets.symmetric(vertical: 10), decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(2))),
                  
                  if (_focusedTrip != null) _buildTripCard(_focusedTrip!)
                  else _buildRouteSelector(),
                  
                  const SizedBox(height: 12),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRouteSelector() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Select Your Route', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Color(0xFF0F172A))),
          const SizedBox(height: 8),
          if (_loadingRoutes)
            const Center(child: CircularProgressIndicator())
          else if (_routes.isEmpty)
            const Text('No routes available', style: TextStyle(color: Color(0xFF64748B)))
          else
            SizedBox(
              height: 100,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _routes.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (ctx, i) {
                  final route = _routes[i];
                  final selected = _selectedRoute?['id'] == route['id'];
                  return GestureDetector(
                    onTap: () => setState(() => _selectedRoute = route),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      width: 160,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: selected ? const Color(0xFF2563EB) : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: selected ? const Color(0xFF2563EB) : Colors.transparent),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Icon(Icons.route_rounded, color: selected ? Colors.white : const Color(0xFF64748B), size: 22),
                          Text(
                            route['name'] ?? 'Route',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              color: selected ? Colors.white : const Color(0xFF0F172A),
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTripCard(Map<String, dynamic> trip) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF1D4ED8), Color(0xFF2563EB)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(trip['routes']?['name'] ?? 'Unknown Route',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16)),
                GestureDetector(
                  onTap: () => setState(() => _focusedTrip = null),
                  child: const Icon(Icons.close, color: Colors.white70, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text('Bus: ${trip['buses']?['registration_number'] ?? 'N/A'}',
              style: const TextStyle(color: Colors.white70, fontSize: 12)),
            const SizedBox(height: 12),
            Row(
              children: [
                _tripInfoChip(Icons.schedule_rounded, 'Delay: ${trip['delay_minutes'] ?? 0} min'),
                const SizedBox(width: 10),
                _tripInfoChip(Icons.location_on_rounded, trip['status'].toString().toUpperCase()),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.my_location_rounded, color: Colors.white),
                  onPressed: () {
                     final telemetry = trip['telemetry_cache'];
                      if (telemetry != null) {
                         final pos = LatLng(telemetry['latitude'], telemetry['longitude']);
                        _mapController.move(pos, _mapController.camera.zoom);
                      }
                  },
                )
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _tripInfoChip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.white, size: 14),
          const SizedBox(width: 5),
          Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
        ],
      ),
    );
  }
}
