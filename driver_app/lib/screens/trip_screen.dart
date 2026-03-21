import 'dart:async';

import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../services/gps_tracking_service.dart';
import '../services/offline_buffer.dart';
import '../services/ws_tracking_service.dart';
import 'login_screen.dart';

class TripScreen extends StatefulWidget {
  const TripScreen({super.key});

  @override
  State<TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends State<TripScreen> {
  final _wsService = WsTrackingService();
  final _gpsService = GpsTrackingService();

  Map<String, dynamic>? _trip;
  bool _loadingTrip = true;
  bool _submitting = false;
  String _tripStatus = 'assigned';
  WsConnectionState _wsState = WsConnectionState.disconnected;
  int _offlineBufferSize = 0;
  Timer? _bufferCheckTimer;

  @override
  void initState() {
    super.initState();

    _wsService.onStateChange = (state) {
      if (mounted) {
        setState(() => _wsState = state);
      }
    };

    _loadTrip();

    _bufferCheckTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      final size = await OfflineGpsBuffer.size();
      if (mounted) {
        setState(() => _offlineBufferSize = size);
      }
    });
  }

  @override
  void dispose() {
    _bufferCheckTimer?.cancel();
    _wsService.onStateChange = null;
    super.dispose();
  }

  Future<void> _loadTrip() async {
    setState(() => _loadingTrip = true);

    try {
      final trip = await AuthService.getAssignedTrip();
      final normalizedStatus = _normalizeStatus(trip?['status']?.toString());

      if (!mounted) return;

      setState(() {
        _trip = trip;
        _tripStatus = normalizedStatus;
        _loadingTrip = false;
      });

      if (trip != null && normalizedStatus == 'running') {
        Future<void>.microtask(_restoreTrackingSession);
      }
    } on DriverAuthException catch (error) {
      if (!mounted) return;
      _showError(error.message);
      setState(() => _loadingTrip = false);
    } catch (_) {
      if (!mounted) return;
      _showError('Could not load your assignment.');
      setState(() => _loadingTrip = false);
    }
  }

  Future<void> _restoreTrackingSession() async {
    if (_trip == null || _tripStatus != 'running' || _gpsService.isTracking) {
      return;
    }

    final wsToken = await AuthService.getWsToken();
    if (wsToken == null) return;

    await _wsService.persistTrackingSession(
      wsToken: wsToken,
      tripId: _trip!['id'].toString(),
    );

    final started = await _gpsService.startTracking();
    if (!started) return;

    final connected = await _wsService.connect(wsToken, _trip!['id'].toString());
    if (!connected) {
      await _gpsService.stopTracking();
      _wsService.disconnect();
      return;
    }

    _wsService.sendStatus('running');
  }

  Future<void> _startTracking() async {
    if (_trip == null || _submitting) return;

    setState(() => _submitting = true);

    try {
      final wsToken = await AuthService.getWsToken();
      if (wsToken == null) {
        throw const DriverAuthException(
          'Could not get tracking token. Please log in again.',
        );
      }

      if ((_trip!['source'] ?? 'schedule') == 'schedule') {
        final startedTrip = await AuthService.startAssignedTrip(
          _trip!['schedule_id'].toString(),
        );

        _trip = {
          ..._trip!,
          'id': startedTrip['id'],
          'status': startedTrip['status'] ?? 'started',
          'source': 'trip',
        };
      }

      await _wsService.persistTrackingSession(
        wsToken: wsToken,
        tripId: _trip!['id'].toString(),
      );

      final trackingStarted = await _gpsService.startTracking();
      if (!trackingStarted) {
        throw const DriverAuthException(
          'Location permission denied. Cannot start tracking.',
        );
      }

      final connected = await _wsService.connect(
        wsToken,
        _trip!['id'].toString(),
      );
      if (!connected) {
        await _gpsService.stopTracking();
        throw const DriverAuthException(
          'Could not connect to live tracking. Please try again.',
        );
      }

      _wsService.sendStatus('running');

      if (!mounted) return;

      setState(() => _tripStatus = 'running');
      _showSnackbar('Tracking started.', Colors.green.shade700);
    } on DriverAuthException catch (error) {
      await _gpsService.stopTracking();
      _wsService.disconnect();
      if (!mounted) return;
      _showError(error.message);
    } catch (_) {
      await _gpsService.stopTracking();
      _wsService.disconnect();
      if (!mounted) return;
      _showError('Could not start tracking.');
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Future<void> _endTracking() async {
    if (_trip == null || _submitting) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text(
          'End Tracking',
          style: TextStyle(color: Color(0xFF1E293B), fontWeight: FontWeight.w800),
        ),
        content: const Text(
          'Are you sure you want to stop tracking for this driver trip?',
          style: TextStyle(color: Color(0xFF64748B)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(
              'Cancel',
              style: TextStyle(color: Color(0xFF94A3B8)),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red.shade700,
            ),
            child: const Text(
              'End Tracking',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    if (!mounted) return;
    setState(() => _submitting = true);

    try {
      await AuthService.completeTrip(_trip!['id'].toString());
      _wsService.sendStatus('completed');
      await _gpsService.stopTracking();
      _wsService.disconnect();
      await OfflineGpsBuffer.clear();
      await _wsService.clearPersistedTrackingSession();

      if (!mounted) return;

      setState(() => _tripStatus = 'completed');
      _showSnackbar('Tracking ended.', Colors.blue.shade700);
    } on DriverAuthException catch (error) {
      if (!mounted) return;
      _showError(error.message);
    } catch (_) {
      if (!mounted) return;
      _showError('Could not end tracking.');
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Future<void> _signOut() async {
    await _gpsService.stopTracking();
    _wsService.disconnect();
    await OfflineGpsBuffer.clear();
    await _wsService.clearPersistedTrackingSession();
    await AuthService.signOut();

    if (!mounted) return;

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  String _normalizeStatus(String? status) {
    switch (status) {
      case 'started':
      case 'paused':
        return 'running';
      case 'running':
      case 'completed':
      case 'cancelled':
      case 'assigned':
        return status!;
      default:
        return 'assigned';
    }
  }

  void _showError(String message) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.white,
        content: Text(
          message,
          style: const TextStyle(color: Color(0xFF1E293B)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _showSnackbar(String message, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: color,
        content: Text(
          message,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: SafeArea(
        child: _loadingTrip
            ? const Center(
                child: CircularProgressIndicator(color: Color(0xFFF59E0B)),
              )
            : _trip == null
                ? _buildNoTripBody()
                : _buildTripBody(),
      ),
    );
  }

  Widget _buildNoTripBody() {
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(
            Icons.directions_bus_outlined,
            color: Color(0xFFCBD5E1),
            size: 80,
          ),
          const SizedBox(height: 24),
          const Text(
            'No Assigned Driver Schedule',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFF1E293B),
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'The admin panel must assign a schedule before this driver can start tracking.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF64748B), height: 1.5),
          ),
          const SizedBox(height: 32),
          SizedBox(
            height: 56,
            child: ElevatedButton.icon(
              onPressed: _loadTrip,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text(
                'CHECK FOR ASSIGNMENTS',
                style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFF59E0B),
                foregroundColor: const Color(0xFF1E293B),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                elevation: 0,
              ),
            ),
          ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: _signOut,
            child: const Text(
              'Sign Out',
              style: TextStyle(color: Color(0xFF94A3B8), fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTripBody() {
    final route = Map<String, dynamic>.from(
      (_trip!['routes'] as Map?) ?? const <String, dynamic>{},
    );
    final bus = Map<String, dynamic>.from(
      (_trip!['buses'] as Map?) ?? const <String, dynamic>{},
    );

    final routeParts = [
      route['start_location']?.toString() ?? '',
      route['end_location']?.toString() ?? '',
    ].where((value) => value.isNotEmpty).toList();

    final routeName = route['name']?.toString().isNotEmpty == true
        ? route['name'].toString()
        : routeParts.join(' -> ');

    final busLabel = bus['registration_number']?.toString().isNotEmpty == true
        ? bus['registration_number'].toString()
        : 'Bus not assigned';

    final driverName = AuthService.currentDriver?['name']?.toString() ?? 'Driver';

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(
              bottom: BorderSide(color: Color(0xFFE2E8F0)),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFACC15), Color(0xFFF59E0B)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.directions_bus_rounded,
                  color: Color(0xFF1E293B),
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      driverName,
                      style: const TextStyle(
                        color: Color(0xFF1E293B),
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      (_trip!['shift'] ?? 'assigned').toString().toUpperCase(),
                      style: const TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: _signOut,
                icon: const Icon(Icons.logout_rounded, color: Color(0xFF1E293B)),
                tooltip: 'Sign Out',
              ),
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                _buildInfoCard(
                  icon: Icons.route_rounded,
                  iconColor: const Color(0xFFF59E0B),
                  title: routeName.isEmpty ? 'Assigned Route' : routeName,
                  subtitle: 'Bus: $busLabel',
                ),
                const SizedBox(height: 12),
                _buildInfoCard(
                  icon: Icons.timelapse_rounded,
                  iconColor: _getStatusColor(),
                  title: 'Tracking Status',
                  subtitle: _tripStatus.toUpperCase(),
                ),
                if (_offlineBufferSize > 0) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade900.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.amber.shade700),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.cloud_off_rounded,
                          color: Colors.amber,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '$_offlineBufferSize GPS points buffered. They will sync when the connection returns.',
                            style: const TextStyle(
                              color: Colors.amber,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                _buildConnectionCard(),
                const SizedBox(height: 28),
                _buildActionArea(),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionArea() {
    if (_tripStatus == 'completed') {
      return _buildInfoCard(
        icon: Icons.check_circle_rounded,
        iconColor: Colors.green,
        title: 'Tracking Completed',
        subtitle: 'This driver trip has been closed successfully.',
      );
    }

    if (_submitting) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFFF59E0B)),
      );
    }

    if (_tripStatus == 'running') {
      return _primaryButton(
        'END ACTIVE TRIP',
        Icons.stop_rounded,
        const [Color(0xFFEF4444), Color(0xFFDC2626)],
        _endTracking,
      );
    }

    return _primaryButton(
      'START TRIP TRACKING',
      Icons.play_arrow_rounded,
      const [Color(0xFF22C55E), Color(0xFF16A34A)],
      _startTracking,
    );
  }

  Widget _buildConnectionCard() {
    final (label, color) = switch (_wsState) {
      WsConnectionState.ready => ('LIVE', Colors.green),
      WsConnectionState.connecting || WsConnectionState.authenticating => (
          'CONNECTING',
          Colors.amber,
        ),
      _ => ('OFFLINE', Colors.red),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.15)),
      ),
      child: Row(
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(color: color.withOpacity(0.45), blurRadius: 8),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Connection: $label',
              style: const TextStyle(
                color: Color(0xFF1E293B),
                fontWeight: FontWeight.w800,
                fontSize: 15,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: iconColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: iconColor),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Color(0xFF1E293B),
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _primaryButton(
    String label,
    IconData icon,
    List<Color> gradientColors,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: gradientColors,
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: gradientColors.last.withOpacity(0.4),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Colors.white, size: 26),
            const SizedBox(width: 10),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _getStatusColor() {
    switch (_tripStatus) {
      case 'running':
        return Colors.green;
      case 'completed':
        return Colors.blue;
      case 'cancelled':
        return Colors.red;
      default:
        return const Color(0xFF64748B);
    }
  }
}
