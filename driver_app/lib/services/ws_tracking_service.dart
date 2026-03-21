// lib/services/ws_tracking_service.dart
import 'dart:async';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;
import '../config/constants.dart';
import 'offline_buffer.dart';

enum WsConnectionState { disconnected, connecting, connected, authenticating, ready }

/// WebSocket Tracking Service
/// Handles:
/// - Connection + automatic reconnection
/// - Authentication handshake
/// - GPS frame transmission
/// - Offline buffer flush on reconnect
/// - PING/PONG heartbeat
class WsTrackingService {
  static final WsTrackingService _instance = WsTrackingService._internal();
  factory WsTrackingService() => _instance;
  WsTrackingService._internal();

  WebSocketChannel? _channel;
  WsConnectionState _state = WsConnectionState.disconnected;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  Completer<bool>? _authCompleter;
  bool _allowReconnect = false;

  String? _wsToken;
  String? _tripId;
  static const String _trackingSessionKey = 'driver_tracking_session';

  // Callbacks
  Function(WsConnectionState)? onStateChange;
  Function(Map<String, dynamic>)? onMessage;

  WsConnectionState get state => _state;

  void _setState(WsConnectionState s) {
    _state = s;
    onStateChange?.call(s);
  }

  Future<bool> connect(String wsToken, String tripId) async {
    if (_state == WsConnectionState.ready && _tripId == tripId) {
      return true;
    }

    _wsToken = wsToken;
    _tripId = tripId;
    _allowReconnect = true;
    _authCompleter = Completer<bool>();
    await _doConnect();

    try {
      return await _authCompleter!.future.timeout(
        const Duration(seconds: 8),
        onTimeout: () => false,
      );
    } finally {
      if (_authCompleter?.isCompleted ?? false) {
        _authCompleter = null;
      }
    }
  }

  Future<void> _doConnect() async {
    if (_state == WsConnectionState.connecting || _state == WsConnectionState.ready) return;
    _setState(WsConnectionState.connecting);

    try {
      _channel = WebSocketChannel.connect(Uri.parse(AppConfig.trackingWsUrl));
      _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
        cancelOnError: false,
      );

      _setState(WsConnectionState.authenticating);

      // Send auth immediately after connect
      _sendRaw({
        'type': 'AUTH',
        'payload': {'token': _wsToken, 'tripId': _tripId}
      });

      // Start heartbeat
      _heartbeatTimer?.cancel();
      _heartbeatTimer = Timer.periodic(
        const Duration(seconds: 25),
        (_) => _sendRaw({'type': 'PING'}),
      );
    } catch (e) {
      _scheduleReconnect();
    }
  }

  void _onMessage(dynamic raw) {
    try {
      final msg = jsonDecode(raw);
      if (msg['type'] == 'AUTH_OK') {
        _setState(WsConnectionState.ready);
        if (!(_authCompleter?.isCompleted ?? true)) {
          _authCompleter?.complete(true);
        }
        // Flush offline buffer
        _flushOfflineBuffer();
      } else if (msg['type'] == 'AUTH_ERR') {
        _allowReconnect = false;
        if (!(_authCompleter?.isCompleted ?? true)) {
          _authCompleter?.complete(false);
        }
        _heartbeatTimer?.cancel();
        _channel?.sink.close(status.normalClosure);
        _setState(WsConnectionState.disconnected);
      } else if (msg['type'] == 'PONG') {
        // Heartbeat acknowledged
      } else {
        onMessage?.call(msg as Map<String, dynamic>);
      }
    } catch (_) {}
  }

  void _onError(Object error) {
    _heartbeatTimer?.cancel();
    if (!(_authCompleter?.isCompleted ?? true)) {
      _authCompleter?.complete(false);
    }
    _setState(WsConnectionState.disconnected);
    if (_allowReconnect) {
      _scheduleReconnect();
    }
  }

  void _onDone() {
    _heartbeatTimer?.cancel();
    if (!(_authCompleter?.isCompleted ?? true)) {
      _authCompleter?.complete(false);
    }
    _setState(WsConnectionState.disconnected);
    if (_allowReconnect) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(
      Duration(milliseconds: AppConfig.wsReconnectDelayMs),
      _doConnect,
    );
  }

  void _sendRaw(Map<String, dynamic> payload) {
    try {
      _channel?.sink.add(jsonEncode(payload));
    } catch (_) {}
  }

  /// Send GPS packet — if not connected, store offline
  Future<void> sendGps(Map<String, dynamic> gpsPayload) async {
    if (_state == WsConnectionState.ready) {
      _sendRaw({'type': 'GPS', 'payload': gpsPayload});
    } else {
      await OfflineGpsBuffer.enqueue(gpsPayload);
    }
  }

  /// Send trip status change
  void sendStatus(String newStatus, {bool panic = false}) {
    _sendRaw({
      'type': 'STATUS',
      'payload': {'tripId': _tripId, 'status': newStatus, 'panic': panic}
    });
  }

  /// Flush buffered points after reconnect
  Future<void> _flushOfflineBuffer() async {
    final points = await OfflineGpsBuffer.getAll();
    if (points.isEmpty) return;

    _sendRaw({'type': 'BATCH', 'payload': {'points': points}});
    await OfflineGpsBuffer.clear();
  }

  Future<void> persistTrackingSession({
    required String wsToken,
    required String tripId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _trackingSessionKey,
      jsonEncode({'wsToken': wsToken, 'tripId': tripId}),
    );
  }

  Future<void> clearPersistedTrackingSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_trackingSessionKey);
  }

  Future<bool> connectFromPersistedSession() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_trackingSessionKey);
    if (raw == null || raw.isEmpty) return false;

    try {
      final decoded = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      final wsToken = decoded['wsToken']?.toString();
      final tripId = decoded['tripId']?.toString();
      if (wsToken == null || wsToken.isEmpty || tripId == null || tripId.isEmpty) {
        return false;
      }
      return await connect(wsToken, tripId);
    } catch (_) {
      return false;
    }
  }

  void disconnect() {
    _allowReconnect = false;
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    _channel?.sink.close(status.normalClosure);
    _setState(WsConnectionState.disconnected);
  }
}
