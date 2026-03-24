import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:lucide_icons/lucide_icons.dart';
import '../config/constants.dart';
import 'live_tracking_screen.dart';

class BusAvailabilityScreen extends StatefulWidget {
  final Map<String, dynamic> fromStop;
  final Map<String, dynamic> toStop;
  final String shift;

  const BusAvailabilityScreen({
    required this.fromStop,
    required this.toStop,
    required this.shift,
    super.key,
  });

  @override
  State<BusAvailabilityScreen> createState() => _BusAvailabilityScreenState();
}

class _BusAvailabilityScreenState extends State<BusAvailabilityScreen> {
  List<Map<String, dynamic>> _trips = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchActiveTrips();
  }

  Future<void> _fetchActiveTrips() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await http
          .get(Uri.parse('${AppConfig.effectiveApiBase}/trips/active'));
      if (response.statusCode != 200) {
        setState(() {
          _loading = false;
          _error = 'Unable to fetch active buses now.';
        });
        return;
      }

      final List<dynamic> data = jsonDecode(response.body);
      final selectedRouteId =
          (widget.fromStop['route_id'] ?? '').toString().trim();
      final destinationRouteId =
          (widget.toStop['route_id'] ?? '').toString().trim();
      final selectedShift = widget.shift.toLowerCase().trim();

      final List<Map<String, dynamic>> filtered = data
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .where((trip) {
        final schedule =
            Map<String, dynamic>.from(trip['schedules'] ?? const {});
        final route = Map<String, dynamic>.from(schedule['routes'] ?? const {});

        final tripRouteId = (route['id'] ?? '').toString().trim();
        final tripShift =
            (trip['schedule_type'] ?? '').toString().toLowerCase().trim();

        final routeMatches = selectedRouteId.isEmpty
            ? destinationRouteId.isEmpty || tripRouteId == destinationRouteId
            : tripRouteId == selectedRouteId &&
                (destinationRouteId.isEmpty || tripRouteId == destinationRouteId);
        final shiftMatches = tripShift == selectedShift;
        return routeMatches && shiftMatches;
      }).toList();

      setState(() {
        _trips = filtered;
        _loading = false;
      });
    } catch (e) {
      debugPrint('Error fetching trips: $e');
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Network error while loading buses.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Available Buses',
            style: TextStyle(fontWeight: FontWeight.w900)),
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft, color: Color(0xFF1E293B)),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            onPressed: _fetchActiveTrips,
            icon: const Icon(LucideIcons.refreshCcw, size: 18),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildErrorUI()
              : _trips.isEmpty
                  ? _buildNoBusUI()
                  : RefreshIndicator(
                      onRefresh: _fetchActiveTrips,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(24),
                        itemCount: _trips.length,
                        itemBuilder: (context, index) {
                          final trip = _trips[index];
                          return _buildBusCard(trip);
                        },
                      ),
                    ),
    );
  }

  Widget _buildErrorUI() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(LucideIcons.serverCrash,
                size: 64, color: Color(0xFFCBD5E1)),
            const SizedBox(height: 14),
            Text(
              _error ?? 'Could not load active buses.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: Color(0xFF475569), fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
                onPressed: _fetchActiveTrips, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }

  Widget _buildNoBusUI() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(LucideIcons.bus, size: 80, color: Color(0xFFE2E8F0)),
          const SizedBox(height: 24),
          const Text(
            'No Active Buses Found',
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: Color(0xFF1E293B)),
          ),
          const SizedBox(height: 8),
          const Text(
            'There are currently no buses running\nfor this route and shift.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
          ),
          const SizedBox(height: 32),
          ElevatedButton(
            onPressed: _fetchActiveTrips,
            child: const Text('Refresh'),
          ),
        ],
      ),
    );
  }

  Widget _buildBusCard(Map<String, dynamic> trip) {
    final schedule = Map<String, dynamic>.from(trip['schedules'] ?? const {});
    final bus = Map<String, dynamic>.from(schedule['buses'] ?? const {});
    final route = Map<String, dynamic>.from(schedule['routes'] ?? const {});

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 15,
              offset: const Offset(0, 5))
        ],
      ),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) =>
                  LiveTrackingScreen(trip: trip, stopInfo: widget.fromStop),
            ),
          );
        },
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      bus['bus_number']?.toString() ?? 'N/A',
                      style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF475569),
                          fontSize: 13),
                    ),
                  ),
                  Row(
                    children: [
                      Icon(
                        LucideIcons.zap,
                        size: 14,
                        color: (trip['is_online'] == true)
                            ? Colors.green
                            : Colors.red,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        (trip['is_online'] == true) ? 'ONLINE' : 'OFFLINE',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          color: (trip['is_online'] == true)
                              ? Colors.green
                              : Colors.red,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                bus['bus_name']?.toString() ?? 'College Bus',
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFF1E293B)),
              ),
              Text(
                '${route['start_location'] ?? '-'} to ${route['end_location'] ?? '-'}',
                style: const TextStyle(
                    color: Color(0xFF94A3B8), fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 20),
              const Divider(color: Color(0xFFE2E8F0)),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'ON-TIME STATUS',
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFF94A3B8),
                              letterSpacing: 1),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          (trip['delay_status'] ?? 'On Time').toString(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: (trip['delay_status'] == 'Delayed')
                                ? Colors.red.shade700
                                : Colors.blue.shade700,
                            fontSize: 15,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  SizedBox(
                    height: 44,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => LiveTrackingScreen(
                                trip: trip, stopInfo: widget.fromStop),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFF59E0B),
                        foregroundColor: const Color(0xFF1E293B),
                        minimumSize: const Size(0, 44),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(LucideIcons.navigation, size: 16),
                          SizedBox(width: 8),
                          Text('TRACK',
                              style: TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 14)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
