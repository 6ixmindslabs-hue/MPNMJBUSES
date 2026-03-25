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
      final routeId = _selectedRouteId;
      final activeResponse = await http
          .get(Uri.parse('${AppConfig.effectiveApiBase}/trips/active'));
      if (activeResponse.statusCode != 200) {
        setState(() {
          _loading = false;
          _error = 'Unable to fetch active buses now.';
        });
        return;
      }

      final List<dynamic> activeData = jsonDecode(activeResponse.body);
      final List<Map<String, dynamic>> activeTrips = _dedupeTripsByBus(
        activeData
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .where(_matchesRouteAndShift)
          .map(_normalizeActiveTrip)
          .toList(),
      );

      final schedulesResponse = await http.get(
        Uri.parse(
          '${AppConfig.effectiveApiBase}/schedules?route_id=$routeId&schedule_type=${widget.shift.toLowerCase().trim()}',
        ),
      );

      List<Map<String, dynamic>> merged = activeTrips;
      if (schedulesResponse.statusCode == 200) {
        final List<dynamic> scheduleData = jsonDecode(schedulesResponse.body);
        final scheduledTrips = scheduleData
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .where(_matchesRouteAndShift)
            .map(_normalizeScheduledTrip)
            .toList();

        if (activeTrips.isEmpty) {
          merged = _dedupeTripsByBus(scheduledTrips);
        } else {
          final activeScheduleIds = activeTrips
              .map(_scheduleIdOf)
              .where((id) => id.isNotEmpty)
              .toSet();
          final activeBusIds = activeTrips
              .map(_busIdOf)
              .where((id) => id.isNotEmpty)
              .toSet();
          merged = [
            ...activeTrips,
            ...scheduledTrips.where(
              (schedule) =>
                  !activeScheduleIds.contains(_scheduleIdOf(schedule)) &&
                  !activeBusIds.contains(_busIdOf(schedule)),
            ),
          ];
        }
      }

      setState(() {
        _trips = merged;
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

  String get _selectedRouteId {
    final selectedRouteId = (widget.fromStop['route_id'] ?? '').toString().trim();
    if (selectedRouteId.isNotEmpty) return selectedRouteId;
    return (widget.toStop['route_id'] ?? '').toString().trim();
  }

  bool _matchesRouteAndShift(Map<String, dynamic> item) {
    final selectedRouteId =
        (widget.fromStop['route_id'] ?? '').toString().trim();
    final destinationRouteId =
        (widget.toStop['route_id'] ?? '').toString().trim();
    final selectedShift = widget.shift.toLowerCase().trim();

    final schedule = Map<String, dynamic>.from(item['schedules'] ?? const {});
    final route = Map<String, dynamic>.from(
      item['routes'] ?? schedule['routes'] ?? item['trip_route'] ?? const {},
    );

    final itemRouteId = (item['route_id'] ?? route['id'] ?? '').toString().trim();
    final itemShift = (item['schedule_type'] ?? item['shift'] ?? '')
        .toString()
        .toLowerCase()
        .trim();

    final routeMatches = selectedRouteId.isEmpty
        ? destinationRouteId.isEmpty || itemRouteId == destinationRouteId
        : itemRouteId == selectedRouteId &&
            (destinationRouteId.isEmpty || itemRouteId == destinationRouteId);

    return routeMatches && itemShift == selectedShift;
  }

  Map<String, dynamic> _normalizeActiveTrip(Map<String, dynamic> trip) {
    final schedule = Map<String, dynamic>.from(trip['schedules'] ?? const {});
    return {
      ...trip,
      'schedule_id': trip['schedule_id'] ?? schedule['id'],
      'bus_id': trip['bus_id'] ?? schedule['buses']?['id'],
      'source_type': 'trip',
      'is_trackable': true,
    };
  }

  Map<String, dynamic> _normalizeScheduledTrip(Map<String, dynamic> schedule) {
    return {
      'id': 'schedule-${schedule['id']}',
      'route_id': schedule['route_id'],
      'schedule_id': schedule['id'],
      'bus_id': schedule['bus_id'],
      'schedule_type': schedule['schedule_type'],
      'status': 'scheduled',
      'started_at': null,
      'paused_at': null,
      'completed_at': null,
      'trip_route': null,
      'schedules': {
        'id': schedule['id'],
        'start_time': schedule['start_time'],
        'end_time': schedule['end_time'],
        'schedule_type': schedule['schedule_type'],
        'routes': schedule['routes'],
        'buses': schedule['buses'],
        'drivers': schedule['drivers'],
      },
      'latest_telemetry': null,
      'is_online': false,
      'last_seen_at': null,
      'next_stop': null,
      'eta_minutes': null,
      'delay_minutes': null,
      'delay_status': 'Scheduled',
      'distance_to_next_stop_m': null,
      'source_type': 'schedule',
      'is_trackable': false,
    };
  }

  String _scheduleIdOf(Map<String, dynamic> item) {
    final rootValue = (item['schedule_id'] ?? '').toString().trim();
    if (rootValue.isNotEmpty) return rootValue;

    final schedule = Map<String, dynamic>.from(item['schedules'] ?? const {});
    return (schedule['id'] ?? '').toString().trim();
  }

  String _busIdOf(Map<String, dynamic> item) {
    final rootValue = (item['bus_id'] ?? '').toString().trim();
    if (rootValue.isNotEmpty) return rootValue;

    final schedule = Map<String, dynamic>.from(item['schedules'] ?? const {});
    final bus = Map<String, dynamic>.from(schedule['buses'] ?? const {});
    return (bus['id'] ?? '').toString().trim();
  }

  List<Map<String, dynamic>> _dedupeTripsByBus(List<Map<String, dynamic>> trips) {
    final seenKeys = <String>{};
    final result = <Map<String, dynamic>>[];

    for (final trip in trips) {
      final busId = _busIdOf(trip);
      final scheduleId = _scheduleIdOf(trip);
      final fallbackId = (trip['id'] ?? '').toString().trim();
      final key = busId.isNotEmpty
          ? 'bus::$busId'
          : scheduleId.isNotEmpty
              ? 'schedule::$scheduleId'
              : 'entry::$fallbackId';

      if (seenKeys.add(key)) {
        result.add(trip);
      }
    }

    return result;
  }

  void _openTrip(Map<String, dynamic> trip) {
    final isTrackable = trip['is_trackable'] == true;
    if (!isTrackable) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This morning bus is scheduled but has not started live tracking yet.'),
        ),
      );
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) =>
            LiveTrackingScreen(trip: trip, stopInfo: widget.fromStop),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFFACC15), Color(0xFFF59E0B), Color(0xFFEA580C)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFF59E0B).withValues(alpha: 0.3),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
              border: Border.all(color: Colors.white, width: 1.5),
            ),
            child: const Center(
              child: Icon(LucideIcons.bus, color: Colors.white, size: 16),
            ),
          ),
          const SizedBox(width: 12),
          const Text("Available Buses", style: TextStyle(fontWeight: FontWeight.w900))
        ]),
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
          Opacity(
            opacity: 0.3,
            child: Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFFACC15), Color(0xFFF59E0B), Color(0xFFEA580C)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.2),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
                border: Border.all(color: Colors.white, width: 4),
              ),
              child: const Center(
                child: Icon(LucideIcons.bus, color: Colors.white, size: 60),
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'No Buses Found',
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: Color(0xFF1E293B)),
          ),
          const SizedBox(height: 8),
          const Text(
            'There are currently no buses configured\nfor this route and shift.',
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
    final isTrackable = trip['is_trackable'] == true;
    final isOnline = trip['is_online'] == true;
    final isScheduledOnly = trip['source_type'] == 'schedule';
    final statusLabel = isScheduledOnly
        ? 'SCHEDULED'
        : (isOnline ? 'ONLINE' : 'OFFLINE');
    final statusColor = isScheduledOnly
        ? const Color(0xFFF59E0B)
        : (isOnline ? Colors.green : Colors.red);

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
        onTap: () => _openTrip(trip),
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          bus['bus_number']?.toString() ?? 'N/A',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              color: Color(0xFF475569),
                              fontSize: 13),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        LucideIcons.zap,
                        size: 14,
                        color: statusColor,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        statusLabel,
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          color: statusColor,
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
                '${widget.fromStop['stop_name'] ?? '-'} to ${widget.toStop['stop_name'] ?? '-'}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Color(0xFF94A3B8), fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 20),
              const Divider(color: Color(0xFFE2E8F0)),
              const SizedBox(height: 16),
              LayoutBuilder(
                builder: (context, constraints) {
                  final compact = constraints.maxWidth < 360;
                  final statusBlock = Column(
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
                          color: isScheduledOnly
                              ? const Color(0xFFB45309)
                              : (trip['delay_status'] == 'Delayed')
                                  ? Colors.red.shade700
                                  : Colors.blue.shade700,
                          fontSize: 15,
                        ),
                      ),
                    ],
                  );

                  final trackButton = SizedBox(
                    height: 44,
                    width: compact ? double.infinity : null,
                    child: ElevatedButton(
                      onPressed: isTrackable ? () => _openTrip(trip) : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: isTrackable
                            ? const Color(0xFFF59E0B)
                            : const Color(0xFFE2E8F0),
                        foregroundColor: isTrackable
                            ? const Color(0xFF1E293B)
                            : const Color(0xFF64748B),
                        minimumSize: const Size(0, 44),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            isTrackable
                                ? LucideIcons.navigation
                                : LucideIcons.clock3,
                            size: 16,
                          ),
                          const SizedBox(width: 8),
                          Text(isTrackable ? 'TRACK' : 'WAITING',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 14)),
                        ],
                      ),
                    ),
                  );

                  if (compact) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        statusBlock,
                        const SizedBox(height: 14),
                        trackButton,
                      ],
                    );
                  }

                  return Row(
                    children: [
                      Expanded(child: statusBlock),
                      const SizedBox(width: 12),
                      trackButton,
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

