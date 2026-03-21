import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:driver_app/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('renders the driver login screen by default', (WidgetTester tester) async {
    FlutterSecureStorage.setMockInitialValues({});

    await tester.pumpWidget(const DriverApp());

    expect(find.text('Driver Login'), findsOneWidget);
    expect(find.text('LOGIN TO DASHBOARD'), findsOneWidget);
  });
}
