import 'dart:convert';
import 'package:driver_app/main.dart';
import 'package:driver_app/services/auth_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package.flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

import 'trip_screen_test.mocks.dart';

@GenerateMocks([http.Client])
void main() {
  late MockClient client;

  setUp(() {
    client = MockClient();
  });

  testWidgets('renders trip screen and start button when logged in and assigned',
      (WidgetTester tester) async {
    // 1. Mock session
    final session = DriverSession(
      token: 'test_token',
      driver: {'id': 1, 'name': 'Test Driver'},
    );
    FlutterSecureStorage.setMockInitialValues({
      'driver_session': jsonEncode(session.toJson()),
    });

    // 2. Mock HTTP calls
    when(client.get(
      Uri.parse('https://your-backend.com/api/drivers/me/assignment'),
      headers: anyNamed('headers'),
    )).thenAnswer((_) async => http.Response(
          jsonEncode({
            'id': 'trip1',
            'status': 'assigned',
            'shift': 'morning',
            'routes': {'name': 'Test Route'},
            'buses': {'registration_number': 'TEST-BUS'},
          }),
          200,
        ));

    // 3. Override the http client
    final originalClient = http.Client();
    http.Client.defaultClient = client;

    // 4. Initialize services
    await AuthService.initialize();

    // 5. Pump the widget
    await tester.pumpWidget(const DriverApp());
    await tester.pumpAndSettle(); // Wait for async operations

    // 6. Verify UI
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('START TRIP TRACKING'), findsOneWidget);

    // 7. Clean up
    http.Client.defaultClient = originalClient;
  });
}
