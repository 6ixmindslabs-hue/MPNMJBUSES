import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:lucide_icons/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/constants.dart';
import 'bus_availability_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  List<Map<String, dynamic>> _stops = [];
  List<Map<String, dynamic>> _recentSearches = [];
  bool _loading = true;
  String? _loadError;
  String? _fromStopId;
  String? _toStopId;
  String _shift = 'morning';

  static const String _recentSearchesKey = 'student_recent_searches';

  @override
  void initState() {
    super.initState();
    _fetchStops();
    _loadRecentSearches();
  }

  Future<void> _loadRecentSearches() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final String? jsonStr = prefs.getString(_recentSearchesKey);
      if (jsonStr != null) {
        final List<dynamic> decoded = jsonDecode(jsonStr);
        if (mounted) {
          setState(() {
            _recentSearches = decoded.cast<Map<String, dynamic>>();
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading recent searches: $e');
    }
  }

  Future<void> _saveRecentSearch(Map<String, dynamic> fromStop, Map<String, dynamic> toStop) async {
    try {
      final searchEntry = {
        'from_id': fromStop['id'],
        'from_name': fromStop['stop_name'],
        'to_id': toStop['id'],
        'to_name': toStop['stop_name'],
        'shift': _shift,
      };

      final filteredList = _recentSearches.where((s) => 
        !(s['from_id'] == searchEntry['from_id'] && 
          s['to_id'] == searchEntry['to_id'] && 
          s['shift'] == searchEntry['shift'])
      ).toList();

      filteredList.insert(0, searchEntry);
      
      if (filteredList.length > 5) {
        filteredList.removeRange(5, filteredList.length);
      }

      setState(() {
        _recentSearches = filteredList;
      });

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_recentSearchesKey, jsonEncode(filteredList));
    } catch (e) {
      debugPrint('Error saving recent search: $e');
    }
  }

  Future<void> _fetchStops() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });

    try {
      final response =
          await http.get(Uri.parse('${AppConfig.effectiveApiBase}/stops'));
      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        setState(() {
          _stops = data.cast<Map<String, dynamic>>();
          _loading = false;
        });
      } else {
        setState(() {
          _loading = false;
          _loadError = 'Unable to load stops right now.';
        });
      }
    } catch (e) {
      debugPrint('Error fetching stops: $e');
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = 'Network error while loading stops.';
      });
    }
  }

  void _searchBuses() {
    if (_fromStopId == null || _toStopId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Select both pickup and destination stops.')),
      );
      return;
    }

    if (_fromStopId == _toStopId) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Pickup and destination cannot be the same stop.')),
      );
      return;
    }

    final fromStop = _stops.firstWhere((s) => s['id'] == _fromStopId);
    final toStop = _stops.firstWhere((s) => s['id'] == _toStopId);
    final fromRouteId = (fromStop['route_id'] ?? '').toString().trim();
    final toRouteId = (toStop['route_id'] ?? '').toString().trim();

    if (fromRouteId.isEmpty || toRouteId.isEmpty || fromRouteId != toRouteId) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Pickup and destination must belong to the same route for the selected shift.',
          ),
        ),
      );
      return;
    }

    final routeShiftStops = _stops
        .where(
          (stop) =>
              stop['route_id']?.toString() == fromRouteId &&
              stop['schedule_type']?.toString() == _shift,
        )
        .toList()
      ..sort(
        (a, b) => (a['arrival_time'] ?? '')
            .toString()
            .compareTo((b['arrival_time'] ?? '').toString()),
      );
    final fromIndex = routeShiftStops.indexWhere(
      (stop) => stop['id']?.toString() == _fromStopId,
    );
    final toIndex = routeShiftStops.indexWhere(
      (stop) => stop['id']?.toString() == _toStopId,
    );

    if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Choose pickup and destination in the valid $_shift route order.',
          ),
        ),
      );
      return;
    }

    _saveRecentSearch(fromStop, toStop);

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => BusAvailabilityScreen(
          fromStop: fromStop,
          toStop: toStop,
          shift: _shift,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.only(
                  top: 80, left: 32, right: 32, bottom: 48),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFFFACC15), Color(0xFFF59E0B)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.only(
                  bottomLeft: Radius.circular(48),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(LucideIcons.bus,
                          color: Color(0xFF1E293B), size: 44),
                      const Spacer(),
                      IconButton(
                        onPressed: _loading ? null : _fetchStops,
                        icon: const Icon(LucideIcons.refreshCw,
                            color: Color(0xFF1E293B)),
                        tooltip: 'Refresh stops',
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Where are you\ngoing today?',
                    style: Theme.of(context).textTheme.displayLarge?.copyWith(
                          color: const Color(0xFF1E293B),
                          fontSize: 34,
                          letterSpacing: -1,
                          height: 1.1,
                        ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Track your college bus live',
                    style: TextStyle(
                        color: Color(0xFF334155),
                        fontSize: 16,
                        fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _loadError != null
                      ? _buildErrorState()
                      : Column(
                          children: [
                            _buildSelectorCard(
                              icon: LucideIcons.circleDot,
                              iconColor: Colors.blue,
                              label: 'SELECT PICKUP STOP',
                              value: _fromStopId,
                              onChanged: (val) =>
                                  setState(() => _fromStopId = val),
                            ),
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 4),
                              child: Icon(LucideIcons.arrowDownUp,
                                  color: Color(0xFFCBD5E1), size: 18),
                            ),
                            _buildSelectorCard(
                              icon: LucideIcons.mapPin,
                              iconColor: Colors.red,
                              label: 'SELECT DESTINATION',
                              value: _toStopId,
                              onChanged: (val) =>
                                  setState(() => _toStopId = val),
                            ),
                            const SizedBox(height: 16),
                            _buildShiftToggle(),
                            const SizedBox(height: 48),
                            SizedBox(
                              width: double.infinity,
                              height: 64,
                              child: ElevatedButton(
                                onPressed: _searchBuses,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFFF59E0B),
                                  foregroundColor: const Color(0xFF1E293B),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  elevation: 8,
                                  shadowColor: const Color(0xFFF59E0B)
                                      .withValues(alpha: 0.4),
                                ),
                                child: const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(LucideIcons.search, size: 20),
                                    SizedBox(width: 12),
                                    Text(
                                      'FIND AVAILABLE BUSES',
                                      style: TextStyle(
                                          fontWeight: FontWeight.w900,
                                          fontSize: 16,
                                          letterSpacing: 0.5),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            if (_fromStopId != null || _toStopId != null)
                              Text(
                                '${_fromStopId != null ? _selectedStopName(_fromStopId!) : 'Pickup?'}  ->  ${_toStopId != null ? _selectedStopName(_toStopId!) : 'Destination?'}',
                                style: const TextStyle(
                                  color: Color(0xFF64748B),
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                            const SizedBox(height: 32),
                            _buildRecentSearches(),
                          ],
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        children: [
          const Icon(LucideIcons.wifiOff, color: Color(0xFF94A3B8), size: 34),
          const SizedBox(height: 10),
          Text(
            _loadError ?? 'Unable to load stops.',
            textAlign: TextAlign.center,
            style: const TextStyle(
                color: Color(0xFF475569), fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _fetchStops,
              child: const Text('Retry'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSelectorCard({
    required IconData icon,
    required Color iconColor,
    required String label,
    required String? value,
    required Function(String?) onChanged,
  }) {
    final shiftStops = _stops
        .where((s) => s['schedule_type'] == _shift)
        .cast<Map<String, dynamic>>()
        .toList();
    final stopNameCounts = <String, int>{};
    for (final stop in shiftStops) {
      final key = (stop['stop_name'] ?? '').toString().trim().toLowerCase();
      stopNameCounts[key] = (stopNameCounts[key] ?? 0) + 1;
    }

    // Prevent assertion crash if the currently selected value is NOT in the filtered dropdown list
    final bool hasValidValue =
        value != null && shiftStops.any((s) => s['id'] == value);
    final safeValue = hasValidValue ? value : null;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.5,
              color: Color(0xFF94A3B8),
            ),
          ),
          const SizedBox(height: 4),
          DropdownButton<String>(
            value: safeValue,
            isExpanded: true,
            underline: const SizedBox(),
            hint: const Text('Choose a stop...'),
            icon: const Icon(LucideIcons.chevronDown, size: 16),
            onChanged: onChanged,
            items: shiftStops.map((stop) {
              return DropdownMenuItem<String>(
                value: stop['id'],
                child: Text(
                  _displayStopLabel(stop, stopNameCounts),
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 16),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildShiftToggle() {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          _shiftToggleItem('morning', LucideIcons.sun, 'Morning Shift'),
          _shiftToggleItem('evening', LucideIcons.moon, 'Evening Shift'),
        ],
      ),
    );
  }

  Widget _shiftToggleItem(String value, IconData icon, String label) {
    final active = _shift == value;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          if (!active) {
            setState(() {
              _shift = value;
              _fromStopId = null;
              _toStopId = null;
            });
          }
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            boxShadow: active
                ? [
                    BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 4,
                        offset: const Offset(0, 2))
                  ]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon,
                  size: 16,
                  color: active
                      ? const Color(0xFFF59E0B)
                      : const Color(0xFF64748B)),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: active
                      ? const Color(0xFF1E293B)
                      : const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _selectedStopName(String id) {
    final match = _stops.where((s) => s['id'] == id);
    if (match.isEmpty) return 'Unknown stop';

    final stop = Map<String, dynamic>.from(match.first);
    final stopNameCounts = <String, int>{};
    for (final item in _stops.where((s) => s['schedule_type'] == stop['schedule_type'])) {
      final key = (item['stop_name'] ?? '').toString().trim().toLowerCase();
      stopNameCounts[key] = (stopNameCounts[key] ?? 0) + 1;
    }

    return _displayStopLabel(stop, stopNameCounts);
  }

  String _displayStopLabel(
    Map<String, dynamic> stop,
    Map<String, int> stopNameCounts,
  ) {
    final stopName = stop['stop_name']?.toString().trim();
    if (stopName == null || stopName.isEmpty) return 'Unknown stop';

    final duplicateCount = stopNameCounts[stopName.toLowerCase()] ?? 0;
    if (duplicateCount <= 1) {
      return stopName;
    }

    return '$stopName (${_routeLabelForStop(stop)})';
  }

  String _routeLabelForStop(Map<String, dynamic> stop) {
    final route = stop['routes'];
    if (route is Map) {
      final start = route['start_location']?.toString().trim();
      final end = route['end_location']?.toString().trim();
      if ((start?.isNotEmpty ?? false) && (end?.isNotEmpty ?? false)) {
        return '$start -> $end';
      }

      final routeName = route['route_name']?.toString().trim();
      if (routeName?.isNotEmpty ?? false) {
        return routeName!;
      }
    }

    final routeId = stop['route_id']?.toString().trim();
    if (routeId?.isNotEmpty ?? false) {
      return 'Route ${routeId!.substring(0, math.min(routeId.length, 6))}';
    }

    return 'Route';
  }

  Widget _buildRecentSearches() {
    if (_recentSearches.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'RECENT SEARCHES',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                color: Color(0xFF94A3B8),
                letterSpacing: 1.5,
              ),
            ),
            if (_recentSearches.isNotEmpty)
              GestureDetector(
                onTap: () async {
                  final prefs = await SharedPreferences.getInstance();
                  await prefs.remove(_recentSearchesKey);
                  setState(() => _recentSearches.clear());
                },
                child: const Text(
                  'CLEAR',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFFF59E0B),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 104,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _recentSearches.length,
            separatorBuilder: (context, index) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final search = _recentSearches[index];
              final isMorning = search['shift'] == 'morning';
              return GestureDetector(
                onTap: () {
                  final fromExists = _stops.any((s) => s['id'] == search['from_id']);
                  final toExists = _stops.any((s) => s['id'] == search['to_id']);

                  if (!fromExists || !toExists) {
                     ScaffoldMessenger.of(context).showSnackBar(
                       const SnackBar(content: Text('Saved route is no longer available.')),
                     );
                     return;
                  }

                  setState(() {
                    _shift = search['shift'] ?? 'morning';
                    _fromStopId = search['from_id'];
                    _toStopId = search['to_id'];
                  });
                  _searchBuses();
                },
                child: Container(
                  width: 220,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.03),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Row(
                        children: [
                          Icon(
                            isMorning ? LucideIcons.sun : LucideIcons.moon,
                            size: 14,
                            color: isMorning ? const Color(0xFFF59E0B) : const Color(0xFF6366F1),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              search['from_name'] ?? 'Stop',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF1E293B),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      const Padding(
                        padding: EdgeInsets.only(left: 6),
                        child: Icon(LucideIcons.arrowDown, size: 14, color: Color(0xFFCBD5E1)),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(LucideIcons.mapPin, size: 14, color: Colors.transparent),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              search['to_name'] ?? 'Stop',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF64748B),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
