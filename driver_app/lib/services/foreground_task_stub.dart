// lib/services/foreground_task_stub.dart
// Mock file for Web/Desktop environments where flutter_foreground_task is not supported.

class FlutterForegroundTask {
  static void init({dynamic androidNotificationOptions, dynamic iosNotificationOptions, dynamic foregroundTaskOptions}) {}
  static Future<dynamic> startService({
    String? notificationTitle,
    String? notificationText,
    dynamic callback,
    dynamic androidNotificationOptions,
    dynamic iosNotificationOptions,
    dynamic foregroundTaskOptions,
  }) async => null;
  static Future<void> stopService() async {}
  static Future<void> setTaskHandler(dynamic handler) async {}
  static Future<void> registerOnTaskStartedCallback(dynamic callback) async {}
  static Future<bool> get isRunningService async => false;
  static void initCommunicationPort() {}
}

class AndroidNotificationOptions {
  AndroidNotificationOptions({
    dynamic channelId,
    dynamic channelName,
    dynamic channelDescription,
    dynamic channelImportance,
    dynamic priority,
  });
}

class IOSNotificationOptions {
  const IOSNotificationOptions({dynamic showNotification, dynamic playSound});
}

class ForegroundTaskOptions {
  ForegroundTaskOptions({dynamic eventAction, dynamic autoRunOnBoot, dynamic allowWakeLock, dynamic allowWifiLock});
}

class ForegroundTaskEventAction {
  static dynamic repeat(int interval) => null;
  static dynamic once() => null;
}

class TaskHandler {
  Future<void> onStart(DateTime timestamp, dynamic starter) async {}
  Future<void> onRepeatEvent(DateTime timestamp) async {}
  Future<void> onDestroy(DateTime timestamp, {bool? isTimeout}) async {}
  void onNotificationPressed() {}
}

enum NotificationChannelImportance { low }
enum NotificationPriority { low }

class ServiceRequestFailure {}
class TaskStarter {}
