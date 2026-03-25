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
  final TextEditingController _fromStopController = TextEditingController();
  final TextEditingController _toStopController = TextEditingController();
  final FocusNode _fromStopFocusNode = FocusNode();
  final FocusNode _toStopFocusNode = FocusNode();
  String _fromQuery = '';
  String _toQuery = '';

  static const String _recentSearchesKey = 'student_recent_searches';

  @override
  void initState() {
    super.initState();
    _fromStopFocusNode.addListener(_handleSelectorFocusChange);
    _toStopFocusNode.addListener(_handleSelectorFocusChange);
    _fetchStops();
    _loadRecentSearches();
  }

  @override
  void dispose() {
    _fromStopFocusNode.removeListener(_handleSelectorFocusChange);
    _toStopFocusNode.removeListener(_handleSelectorFocusChange);
    _fromStopController.dispose();
    _toStopController.dispose();
    _fromStopFocusNode.dispose();
    _toStopFocusNode.dispose();
    super.dispose();
  }

  void _handleSelectorFocusChange() {
    if (!mounted) return;
    setState(() {});
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

  Future<void> _saveRecentSearch() async {
    try {
      final fromKey = _fromStopId;
      final toKey = _toStopId;
      if (fromKey == null || toKey == null) return;

      final searchEntry = {
        'from_id': fromKey,
        'from_name': _selectedStopName(fromKey),
        'to_id': toKey,
        'to_name': _selectedStopName(toKey),
      };

      final filteredList = _recentSearches
          .where((s) => !(s['from_id'] == searchEntry['from_id'] &&
              s['to_id'] == searchEntry['to_id']))
          .toList();

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

  String _tripDirectionOf(Map<String, dynamic> stop) {
    return stop['trip_direction'] == 'return' ? 'return' : 'outbound';
  }

  String _tripDirectionLabel(String direction) {
    return direction == 'return' ? 'Return' : 'Outbound';
  }

  List<Map<String, dynamic>> _routeStopsForDirection(
    String routeId,
    String direction,
  ) {
    return _stops
        .where(
          (stop) =>
              stop['route_id']?.toString() == routeId &&
              _tripDirectionOf(stop) == direction,
        )
        .toList()
      ..sort(
        (a, b) => (a['arrival_time'] ?? '')
            .toString()
            .compareTo((b['arrival_time'] ?? '').toString()),
      );
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
        final fetchedStops = data.cast<Map<String, dynamic>>();
        final fetchedLogicalKeys = _logicalStops(fetchedStops)
            .map((stop) => (stop['logical_key'] ?? stop['id']).toString())
            .toSet();
        final nextFromStopId =
            fetchedLogicalKeys.contains(_fromStopId) ? _fromStopId : null;
        final nextToStopId =
            fetchedLogicalKeys.contains(_toStopId) ? _toStopId : null;
        setState(() {
          _stops = fetchedStops;
          _fromStopId = nextFromStopId;
          _toStopId = nextToStopId;
          _loading = false;
        });
        if (_fromStopId != null &&
            _toStopId != null &&
            !_isValidDestinationForCurrentPickup(_toStopId!)) {
          setState(() {
            _toStopId = null;
          });
        }
        _syncStopFieldText();
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

  void _syncStopFieldText() {
    final fromLabel =
        _fromStopId != null ? _selectedStopName(_fromStopId!) : '';
    final toLabel = _toStopId != null ? _selectedStopName(_toStopId!) : '';

    _fromStopController.value = TextEditingValue(
      text: fromLabel,
      selection: TextSelection.collapsed(offset: fromLabel.length),
    );
    _toStopController.value = TextEditingValue(
      text: toLabel,
      selection: TextSelection.collapsed(offset: toLabel.length),
    );
  }

  List<Map<String, dynamic>> _sortedStops([
    List<Map<String, dynamic>>? sourceStops,
  ]) {
    final logicalStops = _logicalStops(sourceStops)
      ..sort(
        (a, b) => (_stopPrimaryLabel(a).toLowerCase() +
                _routeLabelForStop(a).toLowerCase())
            .compareTo(
          _stopPrimaryLabel(b).toLowerCase() +
              _routeLabelForStop(b).toLowerCase(),
        ),
      );
    return logicalStops;
  }

  List<Map<String, dynamic>> _sortedDirectionalStops([
    List<Map<String, dynamic>>? sourceStops,
  ]) {
    final routeStops = (sourceStops ?? _stops).cast<Map<String, dynamic>>()
      ..sort(
        (a, b) => ((a['route_id'] ?? '').toString() +
                (a['trip_direction'] ?? '').toString() +
                (a['arrival_time'] ?? '').toString())
            .compareTo((b['route_id'] ?? '').toString() +
                (b['trip_direction'] ?? '').toString() +
                (b['arrival_time'] ?? '').toString()),
      );
    return routeStops;
  }

  String _normalizedStopName(Map<String, dynamic> stop) {
    return (stop['stop_name'] ?? '').toString().trim().toLowerCase();
  }

  String _logicalStopKey(Map<String, dynamic> stop) {
    final routeId = (stop['route_id'] ?? '').toString().trim();
    return '$routeId|${_normalizedStopName(stop)}';
  }

  List<Map<String, dynamic>> _logicalStops([
    List<Map<String, dynamic>>? sourceStops,
  ]) {
    final logicalStops = <String, Map<String, dynamic>>{};

    for (final stop in _sortedDirectionalStops(sourceStops)) {
      final key = _logicalStopKey(stop);
      logicalStops.putIfAbsent(
        key,
        () => {
          ...Map<String, dynamic>.from(stop),
          'id': key,
          'logical_key': key,
        },
      );
    }

    return logicalStops.values.toList();
  }

  Map<String, dynamic>? _stopById(
    String? stopId, [
    List<Map<String, dynamic>>? sourceStops,
  ]) {
    if (stopId == null) return null;

    for (final stop in _logicalStops(sourceStops)) {
      final stopKey = (stop['logical_key'] ?? stop['id'] ?? '').toString();
      if (stopKey == stopId) {
        return stop;
      }
    }

    return null;
  }

  List<Map<String, dynamic>> _routeStopsForDirectionFromSource(
    String routeId,
    String direction,
    List<Map<String, dynamic>> sourceStops,
  ) {
    return sourceStops
        .where(
          (stop) =>
              stop['route_id']?.toString() == routeId &&
              _tripDirectionOf(stop) == direction,
        )
        .toList()
      ..sort(
        (a, b) => (a['arrival_time'] ?? '')
            .toString()
            .compareTo((b['arrival_time'] ?? '').toString()),
      );
  }

  List<Map<String, dynamic>> _destinationCandidateStops() {
    final sortedStops = _sortedStops();
    final fromStop = _stopById(_fromStopId);
    if (fromStop == null) return sortedStops;

    final routeId = (fromStop['route_id'] ?? '').toString().trim();
    if (routeId.isEmpty) return sortedStops;

    final candidateKeys = <String>{};
    for (final directionalFrom in _sortedDirectionalStops().where(
      (stop) => _logicalStopKey(stop) == _fromStopId,
    )) {
      final direction = _tripDirectionOf(directionalFrom);
      final routeStops =
          _routeStopsForDirectionFromSource(routeId, direction, _stops);
      final fromIndex = routeStops.indexWhere(
        (stop) => stop['id']?.toString() == directionalFrom['id']?.toString(),
      );
      if (fromIndex < 0) continue;

      for (final stop in routeStops.skip(fromIndex + 1)) {
        candidateKeys.add(_logicalStopKey(stop));
      }
    }

    return sortedStops
        .where(
          (stop) => candidateKeys.contains(
            (stop['logical_key'] ?? stop['id'] ?? '').toString(),
          ),
        )
        .toList();
  }

  bool _isValidDestinationForCurrentPickup(String stopId) {
    return _destinationCandidateStops().any(
      (stop) => (stop['logical_key'] ?? stop['id'] ?? '').toString() == stopId,
    );
  }

  String _stopSearchText(
    Map<String, dynamic> stop,
    Map<String, int> stopConflictCounts,
  ) {
    return [
      _stopPrimaryLabel(stop),
      _stopSecondaryLabel(stop, stopConflictCounts),
      _routeLabelForStop(stop),
    ].join(' ').toLowerCase();
  }

  int _stopSearchRank(
    Map<String, dynamic> stop,
    String query,
    Map<String, int> stopConflictCounts,
  ) {
    final normalizedQuery = query.trim().toLowerCase();
    final primaryLabel = _stopPrimaryLabel(stop).toLowerCase();
    final secondaryLabel =
        _stopSecondaryLabel(stop, stopConflictCounts).toLowerCase();
    final routeLabel = _routeLabelForStop(stop).toLowerCase();
    final fullText = _stopSearchText(stop, stopConflictCounts);

    if (normalizedQuery.isEmpty) return 4;
    if (primaryLabel == normalizedQuery) return 0;
    if (primaryLabel.startsWith(normalizedQuery)) return 1;
    if (primaryLabel.contains(normalizedQuery)) return 2;
    if (secondaryLabel.startsWith(normalizedQuery) ||
        routeLabel.startsWith(normalizedQuery)) {
      return 3;
    }
    if (fullText.contains(normalizedQuery)) return 4;
    return 5;
  }

  List<Map<String, dynamic>> _filteredStops({
    required bool forDestination,
    required String query,
  }) {
    final allStops = _sortedStops();
    final stopConflictCounts = _buildStopConflictCounts(allStops);
    final candidateStops =
        forDestination ? _destinationCandidateStops() : allStops;
    final normalizedQuery = query.trim().toLowerCase();

    final filtered = normalizedQuery.isEmpty
        ? candidateStops
        : candidateStops
            .where(
              (stop) => _stopSearchText(stop, stopConflictCounts)
                  .contains(normalizedQuery),
            )
            .toList();

    filtered.sort((a, b) {
      final rankCompare = _stopSearchRank(
              a, normalizedQuery, stopConflictCounts)
          .compareTo(_stopSearchRank(b, normalizedQuery, stopConflictCounts));
      if (rankCompare != 0) return rankCompare;

      return _compactStopLabel(a, stopConflictCounts)
          .toLowerCase()
          .compareTo(_compactStopLabel(b, stopConflictCounts).toLowerCase());
    });

    return filtered.take(6).toList();
  }

  Map<String, dynamic>? _resolveJourneySelection(
    String fromStopKey,
    String toStopKey,
  ) {
    final fromLogicalStop = _stopById(fromStopKey);
    final toLogicalStop = _stopById(toStopKey);
    if (fromLogicalStop == null || toLogicalStop == null) return null;

    final routeId = (fromLogicalStop['route_id'] ?? '').toString().trim();
    final destinationRouteId =
        (toLogicalStop['route_id'] ?? '').toString().trim();
    if (routeId.isEmpty || routeId != destinationRouteId) return null;

    for (final direction in const ['outbound', 'return']) {
      final routeStops = _routeStopsForDirection(routeId, direction);
      Map<String, dynamic>? resolvedFromStop;
      Map<String, dynamic>? resolvedToStop;
      var fromIndex = -1;
      var toIndex = -1;

      for (var index = 0; index < routeStops.length; index += 1) {
        final stop = routeStops[index];
        final stopKey = _logicalStopKey(stop);

        if (resolvedFromStop == null && stopKey == fromStopKey) {
          resolvedFromStop = stop;
          fromIndex = index;
        }
        if (resolvedToStop == null && stopKey == toStopKey) {
          resolvedToStop = stop;
          toIndex = index;
        }
      }

      if (resolvedFromStop != null &&
          resolvedToStop != null &&
          fromIndex >= 0 &&
          toIndex >= 0 &&
          fromIndex < toIndex) {
        return {
          'fromStop': resolvedFromStop,
          'toStop': resolvedToStop,
          'direction': direction,
        };
      }
    }

    return null;
  }

  String? _normalizeStoredStopId(dynamic storedStopId) {
    final rawId = storedStopId?.toString();
    if (rawId == null || rawId.isEmpty) return null;
    if (_stopById(rawId) != null) return rawId;

    for (final stop in _stops) {
      if (stop['id']?.toString() == rawId) {
        return _logicalStopKey(stop);
      }
    }

    return null;
  }

  void _handleFromQueryChanged(String value) {
    setState(() {
      _fromQuery = value;
      final selectedLabel =
          _fromStopId != null ? _selectedStopName(_fromStopId!) : null;
      if (_fromStopId != null && value != selectedLabel) {
        _fromStopId = null;
      }
    });
  }

  void _handleToQueryChanged(String value) {
    setState(() {
      _toQuery = value;
      final selectedLabel =
          _toStopId != null ? _selectedStopName(_toStopId!) : null;
      if (_toStopId != null && value != selectedLabel) {
        _toStopId = null;
      }
    });
  }

  void _selectFromStop(Map<String, dynamic> stop) {
    final selectedId = (stop['logical_key'] ?? stop['id'])?.toString();
    if (selectedId == null) return;

    final selectedLabel =
        _compactStopLabel(stop, _buildStopConflictCounts(_sortedStops()));
    setState(() {
      _fromStopId = selectedId;
      _fromQuery = '';
      _fromStopController.value = TextEditingValue(
        text: selectedLabel,
        selection: TextSelection.collapsed(offset: selectedLabel.length),
      );

      if (_toStopId != null &&
          !_isValidDestinationForCurrentPickup(_toStopId!)) {
        _toStopId = null;
        _toQuery = '';
        _toStopController.clear();
      }
    });
    _fromStopFocusNode.unfocus();
  }

  void _selectToStop(Map<String, dynamic> stop) {
    final selectedId = (stop['logical_key'] ?? stop['id'])?.toString();
    if (selectedId == null) return;

    final selectedLabel =
        _compactStopLabel(stop, _buildStopConflictCounts(_sortedStops()));
    setState(() {
      _toStopId = selectedId;
      _toQuery = '';
      _toStopController.value = TextEditingValue(
        text: selectedLabel,
        selection: TextSelection.collapsed(offset: selectedLabel.length),
      );
    });
    _toStopFocusNode.unfocus();
  }

  void _clearFromStop() {
    setState(() {
      _fromStopId = null;
      _toStopId = null;
      _fromQuery = '';
      _toQuery = '';
      _fromStopController.clear();
      _toStopController.clear();
    });
  }

  void _clearToStop() {
    setState(() {
      _toStopId = null;
      _toQuery = '';
      _toStopController.clear();
    });
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

    final resolvedJourney = _resolveJourneySelection(_fromStopId!, _toStopId!);
    if (resolvedJourney == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Choose pickup and destination in a valid travel order.',
          ),
        ),
      );
      return;
    }

    final fromStop = Map<String, dynamic>.from(resolvedJourney['fromStop']);
    final toStop = Map<String, dynamic>.from(resolvedJourney['toStop']);
    final tripDirection =
        resolvedJourney['direction']?.toString() ?? 'outbound';

    _saveRecentSearch();

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => BusAvailabilityScreen(
          fromStop: fromStop,
          toStop: toStop,
          direction: tripDirection,
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
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [
                              Color(0xFFFACC15),
                              Color(0xFFF59E0B),
                              Color(0xFFEA580C)
                            ],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFFF59E0B)
                                  .withValues(alpha: 0.3),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ],
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: const Center(
                          child: Icon(LucideIcons.bus,
                              color: Colors.white, size: 22),
                        ),
                      ),
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
                            _buildSearchableSelectorCard(
                              icon: LucideIcons.circleDot,
                              iconColor: Colors.blue,
                              label: 'SELECT PICKUP STOP',
                              controller: _fromStopController,
                              focusNode: _fromStopFocusNode,
                              query: _fromQuery,
                              hintText: 'Type pickup stop name...',
                              suggestions: _filteredStops(
                                forDestination: false,
                                query: _fromQuery,
                              ),
                              onChanged: _handleFromQueryChanged,
                              onSelected: _selectFromStop,
                              onClear: _clearFromStop,
                            ),
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 4),
                              child: Icon(LucideIcons.arrowDownUp,
                                  color: Color(0xFFCBD5E1), size: 18),
                            ),
                            _buildSearchableSelectorCard(
                              icon: LucideIcons.mapPin,
                              iconColor: Colors.red,
                              label: 'SELECT DESTINATION',
                              controller: _toStopController,
                              focusNode: _toStopFocusNode,
                              query: _toQuery,
                              hintText: _fromStopId == null
                                  ? 'Choose pickup first or search all stops...'
                                  : 'Type destination stop name...',
                              suggestions: _filteredStops(
                                forDestination: true,
                                query: _toQuery,
                              ),
                              onChanged: _handleToQueryChanged,
                              onSelected: _selectToStop,
                              onClear: _clearToStop,
                              helperText: _fromStopId == null
                                  ? null
                                  : 'Showing valid stops after ${_selectedStopName(_fromStopId!)}',
                            ),
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

  Widget _buildSearchableSelectorCard({
    required IconData icon,
    required Color iconColor,
    required String label,
    required TextEditingController controller,
    required FocusNode focusNode,
    required String query,
    required String hintText,
    required List<Map<String, dynamic>> suggestions,
    required ValueChanged<String> onChanged,
    required ValueChanged<Map<String, dynamic>> onSelected,
    required VoidCallback onClear,
    String? helperText,
  }) {
    final stopConflictCounts = _buildStopConflictCounts(_sortedStops());
    final showSuggestions = focusNode.hasFocus || query.trim().isNotEmpty;

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
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: iconColor, size: 18),
              ),
              const SizedBox(width: 14),
              Expanded(
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
                    TextField(
                      controller: controller,
                      focusNode: focusNode,
                      onChanged: onChanged,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        isDense: true,
                        border: InputBorder.none,
                        hintText: hintText,
                        hintStyle: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF94A3B8),
                        ),
                        suffixIcon: controller.text.isEmpty
                            ? null
                            : IconButton(
                                onPressed: onClear,
                                splashRadius: 18,
                                icon: const Icon(
                                  LucideIcons.x,
                                  size: 16,
                                  color: Color(0xFF94A3B8),
                                ),
                              ),
                      ),
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: Color(0xFF1E293B),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (helperText != null) ...[
            const SizedBox(height: 10),
            Text(
              helperText,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Color(0xFF64748B),
              ),
            ),
          ],
          if (showSuggestions) ...[
            const SizedBox(height: 12),
            if (suggestions.isEmpty && query.trim().isNotEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text(
                  'No matching stops found.',
                  style: TextStyle(
                    color: Color(0xFF64748B),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              )
            else if (suggestions.isNotEmpty)
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  children: [
                    for (var index = 0;
                        index < suggestions.length;
                        index++) ...[
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapDown: (_) => onSelected(suggestions[index]),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                          child: _buildStopDropdownItem(
                            suggestions[index],
                            stopConflictCounts,
                          ),
                        ),
                      ),
                      if (index != suggestions.length - 1)
                        const Divider(height: 1, color: Color(0xFFE2E8F0)),
                    ],
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }

  String _selectedStopName(String id) {
    final stop = _stopById(id);
    if (stop == null) return 'Unknown stop';
    final stopConflictCounts = _buildStopConflictCounts(_sortedStops());

    return _compactStopLabel(stop, stopConflictCounts);
  }

  // ignore: unused_element
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

    return '$stopName (${_tripDirectionLabel(_tripDirectionOf(stop))} • ${_routeLabelForStop(stop)})';
  }

  Map<String, int> _buildStopConflictCounts(List<Map<String, dynamic>> stops) {
    final counts = <String, int>{};
    for (final stop in stops) {
      final key = _stopConflictKey(stop);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  String _stopConflictKey(Map<String, dynamic> stop) {
    return _normalizedStopName(stop);
  }

  String _stopPrimaryLabel(Map<String, dynamic> stop) {
    final stopName = stop['stop_name']?.toString().trim();
    if (stopName == null || stopName.isEmpty) return 'Unknown stop';
    return stopName;
  }

  String _stopSecondaryLabel(
    Map<String, dynamic> stop,
    Map<String, int> stopConflictCounts,
  ) {
    final duplicateCount = stopConflictCounts[_stopConflictKey(stop)] ?? 0;
    if (duplicateCount <= 1) return '';
    return _routeLabelForStop(stop);
  }

  String _compactStopLabel(
    Map<String, dynamic> stop,
    Map<String, int> stopConflictCounts,
  ) {
    final secondaryLabel = _stopSecondaryLabel(stop, stopConflictCounts);
    if (secondaryLabel.isEmpty) return _stopPrimaryLabel(stop);
    return '${_stopPrimaryLabel(stop)} - $secondaryLabel';
  }

  Widget _buildStopDropdownItem(
    Map<String, dynamic> stop,
    Map<String, int> stopConflictCounts,
  ) {
    final secondaryLabel = _stopSecondaryLabel(stop, stopConflictCounts);

    return Align(
      alignment: Alignment.centerLeft,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _stopPrimaryLabel(stop),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: Color(0xFF1E293B),
            ),
          ),
          if (secondaryLabel.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              secondaryLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 12,
                color: Color(0xFF64748B),
              ),
            ),
          ],
        ],
      ),
    );
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
              return GestureDetector(
                onTap: () {
                  final normalizedFromId =
                      _normalizeStoredStopId(search['from_id']);
                  final normalizedToId =
                      _normalizeStoredStopId(search['to_id']);
                  final fromExists = normalizedFromId != null;
                  final toExists = normalizedToId != null;

                  if (!fromExists || !toExists) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                          content: Text('Saved route is no longer available.')),
                    );
                    return;
                  }

                  setState(() {
                    _fromStopId = normalizedFromId;
                    _toStopId = normalizedToId;
                    _fromQuery = '';
                    _toQuery = '';
                  });
                  _syncStopFieldText();
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
                          const Icon(
                            LucideIcons.history,
                            size: 14,
                            color: Color(0xFFF59E0B),
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
                        child: Icon(LucideIcons.arrowDown,
                            size: 14, color: Color(0xFFCBD5E1)),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(LucideIcons.mapPin,
                              size: 14, color: Colors.transparent),
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
