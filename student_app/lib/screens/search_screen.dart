import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:lucide_icons/lucide_icons.dart';
import '../config/constants.dart';
import 'bus_availability_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  // Local state for dropdowns
  List<Map<String, dynamic>> _stops = [];
  bool _loading = true;
  String? _fromStopId;
  String? _toStopId;
  String _shift = 'morning'; // Default

  @override
  void initState() {
    super.initState();
    _fetchStops();
  }

  Future<void> _fetchStops() async {
    try {
      final response = await http.get(Uri.parse('${AppConfig.effectiveApiBase}/stops'));
      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        setState(() {
          _stops = data.cast<Map<String, dynamic>>();
          _loading = false;
        });
      }
    } catch (e) {
      debugPrint('Error fetching stops: $e');
    }
  }

  void _searchBuses() {
    if (_fromStopId == null || _toStopId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select both from and to stops')),
      );
      return;
    }

    // Find the shared route ID if any
    final fromStop = _stops.firstWhere((s) => s['id'] == _fromStopId);
    final toStop = _stops.firstWhere((s) => s['id'] == _toStopId);

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
            // 🎨 Header Gradient
            Container(
              width: double.infinity,
              padding: const EdgeInsets.only(top: 80, left: 32, right: 32, bottom: 48),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)],
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
                  const Icon(LucideIcons.bus, color: Colors.white, size: 48),
                  const SizedBox(height: 24),
                  Text(
                    'Where are you\ngoing today?',
                    style: Theme.of(context).textTheme.displayLarge?.copyWith(
                      color: Colors.white,
                      fontSize: 34,
                      letterSpacing: -1,
                      height: 1.1,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Track your college bus live',
                    style: TextStyle(color: Colors.blue.shade100, fontSize: 16),
                  ),
                ],
              ),
            ),

            // 📍 Selection Form
            Padding(
              padding: const EdgeInsets.all(24),
              child: _loading 
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    children: [
                      _buildSelectorCard(
                        icon: LucideIcons.circleDot,
                        iconColor: Colors.blue,
                        label: 'SELECT PICKUP STOP',
                        value: _fromStopId,
                        onChanged: (val) => setState(() => _fromStopId = val),
                      ),
                      
                      // 🔄 Swap Icon
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 4),
                        child: Icon(LucideIcons.arrowDownUp, color: Color(0xFFCBD5E1), size: 18),
                      ),

                      _buildSelectorCard(
                        icon: LucideIcons.mapPin,
                        iconColor: Colors.red,
                        label: 'SELECT DESTINATION',
                        value: _toStopId,
                        onChanged: (val) => setState(() => _toStopId = val),
                      ),

                      const SizedBox(height: 16),

                      // 🕙 Shift Toggle
                      _buildShiftToggle(),

                      const SizedBox(height: 48),

                      // 🔎 Search Button
                      SizedBox(
                        width: double.infinity,
                        height: 64,
                        child: ElevatedButton(
                          onPressed: _searchBuses,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2563EB),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                            ),
                            elevation: 8,
                            shadowColor: const Color(0xFF2563EB).withOpacity(0.4),
                          ),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(LucideIcons.search, size: 20),
                              SizedBox(width: 12),
                              Text(
                                'FIND AVAILABLE BUSES',
                                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 0.5),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
            ),
          ],
        ),
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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.02),
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
            value: value,
            isExpanded: true,
            underline: const SizedBox(),
            hint: const Text('Choose a stop...'),
            icon: const Icon(LucideIcons.chevronDown, size: 16),
            onChanged: onChanged,
            items: _stops.map((stop) {
              return DropdownMenuItem<String>(
                value: stop['id'],
                child: Text(
                  stop['stop_name'],
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
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
    bool active = _shift == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _shift = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            boxShadow: active ? [
              BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4, offset: const Offset(0, 2))
            ] : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: active ? const Color(0xFF2563EB) : const Color(0xFF64748B)),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: active ? const Color(0xFF1E293B) : const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
