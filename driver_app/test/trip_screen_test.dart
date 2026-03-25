import 'package:driver_app/services/auth_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('driver session preserves daily assignment payloads', () {
    const session = DriverSession(
      token: 'test-token',
      driver: {
        'id': 'driver-1',
        'name': 'Test Driver',
      },
    );

    final restored = DriverSession.fromJson(session.toJson());

    expect(restored.token, 'test-token');
    expect(restored.driver['id'], 'driver-1');
    expect(restored.driver['name'], 'Test Driver');
  });
}
