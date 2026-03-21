# 📱 Mobile Apps Installation Guide

To run the Driver and Student apps, follow these steps to create and configure the Flutter projects.

## 1. Prerequisites
- [Install Flutter](https://docs.flutter.dev/get-started/install)
- Ensure you have a code editor (VS Code or Android Studio) with the Flutter plugin.

## 2. Project Creation
In your terminal, run the following commands in the root `BUSTRACKER` folder:

```bash
# Create Driver App
flutter create --org in.edu.mpnmjec driver_app
cd driver_app
flutter pub get

# Create Student App
cd ..
flutter create --org in.edu.mpnmjec student_app
cd student_app
flutter pub get
```

## 3. Configuration (Critical Fixes)

I have already provided the `AndroidManifest.xml` files with the correct permissions. Make sure they are placed in:
- `driver_app/android/app/src/main/AndroidManifest.xml`
- `student_app/android/app/src/main/AndroidManifest.xml`

### Permission Highlights:
The apps require the following to work:
- **Location Permissions**: To track bus movement and show user position on map.
- **Foreground Service**: (Driver App only) To keep tracking location even when the screen is off or the phone is in the driver's pocket.

## 4. Development Login (Bypass Mode)
You can test the apps immediately without setting up a real database:

### Driver App
- **Email**: `driver@mpnmjec.edu.in`
- **Password**: `driver12345`
- *Action*: You will see a "Virtual Trip" and can start simulated movement.

### Student App
- **Email**: `student@mpnmjec.edu.in`
- **Password**: `student12345`
- *Action*: You will see a "KA-01-GHOST" bus moving on your map live.

## 5. Connecting to your PC
If you are running the apps on a **physical phone**, replace `10.0.2.2` in `lib/config/constants.dart` with your computer's local IP address (e.g., `192.168.1.XX`).
