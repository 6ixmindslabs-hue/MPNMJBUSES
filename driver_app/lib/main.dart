import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/foreground_task_proxy.dart';

import 'screens/login_screen.dart';
import 'screens/trip_screen.dart';
import 'services/gps_tracking_service_mobile.dart';
import 'services/auth_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await GpsTrackingService.initForegroundTask();

  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
  ));

  await AuthService.initialize();

  // Initialize foreground task communication only if supported (non-web)
  if (!kIsWeb) {
    FlutterForegroundTask.initCommunicationPort();
  }

  runApp(const DriverApp());
}

class DriverApp extends StatelessWidget {
  const DriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MPNMJEC Driver',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.light,
        useMaterial3: true,
        fontFamily: 'Inter',
        colorSchemeSeed: const Color(0xFFF59E0B),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
      home: AuthService.isLoggedIn ? const TripScreen() : const LoginScreen(),
    );
  }
}
