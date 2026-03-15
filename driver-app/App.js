import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  SafeAreaView, 
  StatusBar,
  ActivityIndicator,
  Alert
} from 'react-native';
import { User, Lock, Navigation, Play, Square, LogOut, Bus as BusIcon } from 'lucide-react-native';
import io from 'socket.io-client';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const BACKEND_URL = 'https://mpnmjbuses.vercel.app';
const LOCATION_TASK_NAME = 'background-location-task';

const fetchWithTimeout = async (url, options, timeout = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Background] Location Error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    try {
      const assignmentStr = await AsyncStorage.getItem('assignment');
      const isTracking = await AsyncStorage.getItem('isTracking');
      
      if (isTracking === 'true' && assignmentStr && locations && locations.length > 0) {
        const assignment = JSON.parse(assignmentStr);
        const coords = locations[0].coords;
        
        // Use timeout to prevent background task from hanging indefinitely
        await fetchWithTimeout(`${BACKEND_URL}/api/telemetry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            busId: assignment.busId,
            lat: coords.latitude,
            lng: coords.longitude,
            speed: coords.speed || 0,
            heading: coords.heading || 0,
            accuracy: coords.accuracy || 0,
            timestamp: Date.now()
          })
        }).catch(err => console.error('[Background] Telemetry upload failed:', err.message));
      }
    } catch (e) {
      console.error('[Background] Task execution error:', e);
    }
  }
});

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [driverData, setDriverData] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [location, setLocation] = useState(null);
  
  const socketRef = useRef(null);
  const locationSubscription = useRef(null);

  useEffect(() => {
    checkStorage();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (locationSubscription.current) locationSubscription.current.remove();
    };
  }, []);

  const checkStorage = async () => {
    try {
      const driverStr = await AsyncStorage.getItem('driverData');
      const assignmentStr = await AsyncStorage.getItem('assignment');
      const trackingStr = await AsyncStorage.getItem('isTracking');
      
      if (driverStr) {
        setDriverData(JSON.parse(driverStr));
        setIsAuthenticated(true);
      }
      if (assignmentStr) {
        setAssignment(JSON.parse(assignmentStr));
      }
      if (trackingStr === 'true') {
        setIsTracking(true);
        // Socket connection logic for foreground map
        if (assignmentStr) {
          const parsed = JSON.parse(assignmentStr);
          socketRef.current = io(BACKEND_URL, {
            transports: ['polling'],
            autoConnect: true
          });
          socketRef.current.emit('driver:join', { 
            busId: parsed.busId, 
            routeId: parsed.routeId 
          });
          setupForegroundLocation(parsed);
        }
      }
    } catch (e) {
      console.error('Storage error:', e);
    }
  };

  const setupForegroundLocation = async (activeAssignment) => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
    }
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 5,
      },
      (loc) => {
        const { coords } = loc;
        setLocation(coords);
        if (socketRef.current) {
          socketRef.current.emit('telemetry:update', {
            busId: activeAssignment.busId,
            lat: coords.latitude,
            lng: coords.longitude,
            speed: coords.speed || 0,
            heading: coords.heading || 0,
            accuracy: coords.accuracy || 0,
            timestamp: Date.now()
          });
        }
      }
    );
  };

  const handleLogin = async () => {
    if (!loginId || !password) return;
    setLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/drivers`);
      const drivers = await resp.json();
      const driver = drivers.find(d => d.login === loginId && d.password === password);
      
      if (driver) {
        await AsyncStorage.setItem('driverData', JSON.stringify(driver));
        setDriverData(driver);
        await fetchAssignment(driver.login);
        setIsAuthenticated(true);
      } else {
        Alert.alert('Invalid Credentials', 'Please check your login ID and password.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Connection Error', 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignment = async (id) => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/assignments`);
      const all = await resp.json();
      const myAs = all.find(a => a.driverId === id);
      setAssignment(myAs);
      if (myAs) {
        await AsyncStorage.setItem('assignment', JSON.stringify(myAs));
      } else {
        await AsyncStorage.removeItem('assignment');
      }
    } catch (err) {
      console.error('Fetch assignment error:', err);
    }
  };

  const startTracking = async () => {
    if (!assignment) {
      Alert.alert('No Assignment', 'You have no active assignment to track.');
      return;
    }

    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      Alert.alert('Permission Denied', 'Foreground location access is required.');
      return;
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      Alert.alert('Permission Denied', 'Background location access is required for tracking.');
      return;
    }

    // Start Headless Background Task first, only toggle UI if it succeeds
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 4000,
        distanceInterval: 10,
        deferredUpdatesInterval: 4000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Transport Network Active",
          notificationBody: "Broadcasting your live location...",
          notificationColor: "#f59e0b",
        }
      });

      // successful start
      setIsTracking(true);
      await AsyncStorage.setItem('isTracking', 'true');
      
      // Connect Socket (Foreground update)
      socketRef.current = io(BACKEND_URL, {
        transports: ['polling']
      });
      socketRef.current.emit('driver:join', { 
        busId: assignment.busId, 
        routeId: assignment.routeId 
      });

      // Start UI Watcher
      setupForegroundLocation(assignment);

    } catch (err) {
      console.error("Background location failed to start:", err);
      Alert.alert(
        "Auto-Closing Prevention",
        "Full background tracking requires a specific OS permission. If the app closes, please ensure 'Allow all the time' location is selected in settings."
      );
    }
  };

  const stopTracking = async () => {
    setIsTracking(false);
    await AsyncStorage.removeItem('isTracking');
    
    if (socketRef.current) {
      socketRef.current.emit('driver:lifecycle', { 
        busId: assignment.busId, 
        lifecycle: 'IDLE' 
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    
    const isTaskRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isTaskRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    
    setLocation(null);
  };

  const handleLogOut = async () => {
    if (isTracking) {
      await stopTracking();
    }
    await AsyncStorage.clear();
    setIsAuthenticated(false);
    setDriverData(null);
    setAssignment(null);
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loginCard}>
          <View style={styles.header}>
            <View style={styles.logoIcon}>
              <Navigation size={32} color="#fff" />
            </View>
            <Text style={styles.title}>Captain App</Text>
            <Text style={styles.subtitle}>Fleet Driver Portal</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>LOGIN ID</Text>
            <View style={styles.inputWrapper}>
              <User size={18} color="#a8a29e" style={styles.icon} />
              <TextInput 
                style={styles.input}
                placeholder="driver_01"
                value={loginId}
                onChangeText={setLoginId}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color="#a8a29e" style={styles.icon} />
              <TextInput 
                style={styles.input}
                placeholder="••••••••"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          <TouchableOpacity 
            style={styles.loginBtn}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={styles.loginBtnText}>Log In</Text>
                <Play size={16} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topNav}>
        <View>
          <Text style={styles.driverName}>{driverData?.name}</Text>
          <Text style={styles.driverStatus}>Status: {isTracking ? 'Active Tracking' : 'Standby'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogOut}>
          <LogOut size={20} color="#78716c" />
        </TouchableOpacity>
      </View>

      <View style={styles.main}>
        <View style={styles.assignmentCard}>
          <Text style={styles.sectionTitle}>CURRENT ASSIGNMENT</Text>
          {assignment ? (
            <View style={styles.asDetails}>
              <View style={styles.asRow}>
                <BusIcon size={20} color="#f59e0b" />
                <Text style={styles.asText}>Vehicle: <Text style={styles.bold}>{assignment.busId}</Text></Text>
              </View>
              <View style={styles.asRow}>
                <Navigation size={20} color="#f59e0b" />
                <Text style={styles.asText}>Route: <Text style={styles.bold}>{assignment.routeId}</Text></Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{assignment.shiftDirection}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.noAsText}>No active assignment found for today.</Text>
          )}
        </View>

        {assignment && (
          <View style={styles.trackingSection}>
            <View style={styles.telemetryCard}>
              <View style={styles.telItem}>
                <Text style={styles.telLabel}>LATITUDE</Text>
                <Text style={styles.telValue}>{location?.latitude?.toFixed(6) || '0.000000'}</Text>
              </View>
              <View style={styles.telItem}>
                <Text style={styles.telLabel}>LONGITUDE</Text>
                <Text style={styles.telValue}>{location?.longitude?.toFixed(6) || '0.000000'}</Text>
              </View>
              <View style={styles.telItem}>
                <Text style={styles.telLabel}>SPEED</Text>
                <Text style={styles.telValue}>{((location?.speed || 0) * 3.6).toFixed(1)} km/h</Text>
              </View>
            </View>

            {isTracking ? (
              <TouchableOpacity style={styles.stopBtn} onPress={stopTracking}>
                <Square size={24} color="#fff" fill="#fff" />
                <Text style={styles.stopBtnText}>END TRIP</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.startBtn} onPress={startTracking}>
                <Play size={24} color="#fff" fill="#fff" />
                <Text style={styles.startBtnText}>START TRIP</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafaf9',
  },
  loginCard: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1c1917',
  },
  subtitle: {
    fontSize: 16,
    color: '#78716c',
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#a8a29e',
    marginBottom: 8,
    letterSpacing: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    paddingHorizontal: 16,
    height: 56,
  },
  icon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1c1917',
  },
  loginBtn: {
    backgroundColor: '#f59e0b',
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 8,
  },
  topNav: {
    height: 80,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e7e5e4',
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c1917',
  },
  driverStatus: {
    fontSize: 12,
    color: '#78716c',
    marginTop: 2,
  },
  main: {
    flex: 1,
    padding: 24,
  },
  assignmentCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#a8a29e',
    letterSpacing: 1,
    marginBottom: 16,
  },
  asDetails: {
    gap: 12,
  },
  asRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  asText: {
    fontSize: 16,
    color: '#57534e',
  },
  bold: {
    fontWeight: '700',
    color: '#1c1917',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginTop: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400e',
    textTransform: 'uppercase',
  },
  noAsText: {
    fontSize: 14,
    color: '#a8a29e',
    fontStyle: 'italic',
  },
  trackingSection: {
    flex: 1,
  },
  telemetryCard: {
    backgroundColor: '#1c1917',
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  telItem: {
    alignItems: 'center',
  },
  telLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#78716c',
    marginBottom: 8,
  },
  telValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'System',
  },
  startBtn: {
    backgroundColor: '#16a34a',
    height: 120,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
  stopBtn: {
    backgroundColor: '#dc2626',
    height: 120,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  stopBtnText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
