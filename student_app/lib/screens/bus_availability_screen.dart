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

  @override
  void initState() {
    super.initState();
    _fetchActiveTrips();
  }

  Future<void> _fetchActiveTrips() async {
    try {
      final response = await http.get(Uri.parse('${AppConfig.effectiveApiBase}/trips/active'));
      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        
        // Filter by the selected shift and ensure the route matches (in real app, we'd also check if our from-to stops are on this route)
        final routeId = widget.fromStop['route_id'];
        final List<Map<String, dynamic>> filtered = data
            .cast<Map<String, dynamic>>()
            .where((t) => t['schedule_type'] == widget.shift && t['schedules']['routes']['id'] == routeId)
            .toList();

        setState(() {
          _trips = filtered;
          _loading = false;
        });
      }
    } catch (e) {
      debugPrint('Error fetching trips: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Available Buses', style: TextStyle(fontWeight: FontWeight.w900)),
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft, color: Color(0xFF1E293B)),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _trips.isEmpty
              ? _buildNoBusUI()
              : ListView.builder(
                  padding: const EdgeInsets.all(24),
                  itemCount: _trips.length,
                  itemBuilder: (context, index) {
                    final trip = _trips[index];
                    return _buildBusCard(trip);
                  },
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
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF1E293B)),
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
            child: const Text('REFRESH'),
          ),
        ],
      ),
    );
  }

  Widget _buildBusCard(Map<String, dynamic> trip) {
    final schedule = trip['schedules'];
    final bus = schedule['buses'];
    final route = schedule['routes'];

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))
        ],
      ),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => LiveTrackingScreen(trip: trip, stopInfo: widget.fromStop),
            ),
          );
        },
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Row 1: Bus Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      bus['bus_number'] ?? 'N/A',
                      style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF475569), fontSize: 13),
                    ),
                  ),
                  const Row(
                    children: [
                      Icon(LucideIcons.zap, size: 14, color: Colors.green),
                      SizedBox(width: 4),
                      Text(
                        'LIVE',
                        style: TextStyle(fontWeight: FontWeight.w900, color: Colors.green, fontSize: 12),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Row 2: Route Title
              Text(
                bus['bus_name'] ?? 'College Bus',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF1E293B)),
              ),
              Text(
                route['start_location'] + ' to ' + route['end_location'],
                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13, height: 1.4),
              ),

              const SizedBox(height: 20),
              const Divider(color: Color(0xFFE2E8F0)),
              const SizedBox(height: 16),

              // Row 3: Status Details
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'ON-TIME STATUS',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF94A3B8), letterSpacing: 1),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'On Time', // In real app, calculate from telemetry
                        style: TextStyle(fontWeight: FontWeight.w800, color: Colors.blue.shade700, fontSize: 15),
                      ),
                    ],
                  ),
                  SizedBox(
                    height: 44,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => LiveTrackingScreen(trip: trip, stopInfo: widget.fromStop),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      child: const Row(
                        children: [
                          Icon(LucideIcons.navigation, size: 16),
                          SizedBox(width: 8),
                          Text('TRACK', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
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
