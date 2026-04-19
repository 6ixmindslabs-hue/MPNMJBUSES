import 'package:flutter_test/flutter_test.dart';

import 'package:student_app/main.dart';

void main() {
  testWidgets('Student app loads search screen', (WidgetTester tester) async {
    await tester.pumpWidget(const StudentApp());

    expect(find.textContaining('How would you like'), findsOneWidget);
    expect(find.text('Track Instantly'), findsOneWidget);
  });
}
