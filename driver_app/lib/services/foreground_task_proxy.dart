// lib/services/foreground_task_proxy.dart
// Proxy for conditional exports to support web/desktop without flutter_foreground_task crashing.

export 'foreground_task_stub.dart'
    if (dart.library.io) 'package:flutter_foreground_task/flutter_foreground_task.dart';
