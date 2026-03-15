import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  SafeAreaView, 
  StatusBar,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { 
  Search, 
  Map as MapIcon, 
  Navigation, 
  Clock, 
  ChevronRight, 
  ArrowLeft, 
  Bus as BusIcon,
  Circle,
  CheckCircle2,
  Calendar,
  User
} from 'lucide-react-native';
import io from 'socket.io-client';
import { WebView } from 'react-native-webview';

const BACKEND_URL = 'https://mpnmjbuses.vercel.app';
const Stack = createStackNavigator();

// ── Components ─────────────────────────────────────────────────────────────

const StopTimelineItem = ({ stop, isPassed, isCurrent, isNext, isLast }) => (
  <View style={styles.timelineItem}>
    <View style={styles.timelineLeft}>
      <View style={[styles.timelineDot, isPassed && styles.dotPassed, isCurrent && styles.dotCurrent]}>
        {isPassed ? <CheckCircle2 size={14} color="#16a34a" /> : <Circle size={10} color={isCurrent ? "#f59e0b" : "#e7e5e4"} fill={isCurrent ? "#f59e0b" : "transparent"} />}
      </View>
      {!isLast && <View style={[styles.timelineLine, isPassed && styles.linePassed]} />}
    </View>
    <View style={styles.timelineRight}>
      <Text style={[styles.stopName, isCurrent && styles.textCurrent, isPassed && styles.textPassed]}>{stop.name}</Text>
      <View style={styles.stopMeta}>
        <Clock size={12} color="#a8a29e" />
        <Text style={styles.stopTime}>{stop.arrivalTime} {isCurrent && '• Approaching'}</Text>
      </View>
    </View>
  </View>
);

// ── Screens ────────────────────────────────────────────────────────────────

function LoginScreen({ navigation }) {
  const [studentId, setStudentId] = useState('');
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loginContent}>
        <View style={styles.logoCircle}>
          <BusIcon size={40} color="#fff" />
        </View>
        <Text style={styles.loginTitle}>Campus Tracker</Text>
        <Text style={styles.loginSubtitle}>Real-time college transport</Text>
        
        <View style={styles.loginForm}>
          <View style={styles.inputWrapper}>
            <User size={18} color="#a8a29e" />
            <TextInput 
              style={styles.loginInput}
              placeholder="Student ID / Registration No."
              value={studentId}
              onChangeText={setStudentId}
            />
          </View>
          <TouchableOpacity 
            style={styles.loginButton} 
            onPress={() => navigation.replace('Search')}
          >
            <Text style={styles.loginButtonText}>Enter Dashboard</Text>
            <ChevronRight size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function SearchScreen({ navigation }) {
  const [direction, setDirection] = useState('INBOUND'); // INBOUND (Morning), OUTBOUND (Evening)
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/routes`);
      const data = await resp.json();
      setRoutes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Where to go?</Text>
        <Text style={styles.headerSubtitle}>Select your shift and stop</Text>
      </View>

      <View style={styles.directionToggle}>
        <TouchableOpacity 
          style={[styles.toggleBtn, direction === 'INBOUND' && styles.toggleActive]}
          onPress={() => setDirection('INBOUND')}
        >
          <Calendar size={18} color={direction === 'INBOUND' ? '#fff' : '#78716c'} />
          <Text style={[styles.toggleText, direction === 'INBOUND' && styles.toggleTextActive]}>Morning Plan</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.toggleBtn, direction === 'OUTBOUND' && styles.toggleActive]}
          onPress={() => setDirection('OUTBOUND')}
        >
          <Clock size={18} color={direction === 'OUTBOUND' ? '#fff' : '#78716c'} />
          <Text style={[styles.toggleText, direction === 'OUTBOUND' && styles.toggleTextActive]}>Evening Plan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <Text style={styles.sectionLabel}>AVAILABLE ROUTES</Text>
        {loading ? <ActivityIndicator color="#f59e0b" /> : (
          <FlatList 
            data={routes}
            keyExtractor={item => item.routeId}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.routeCard}
                onPress={() => navigation.navigate('BusList', { routeId: item.routeId, direction })}
              >
                <View style={styles.routeIcon}>
                  <MapIcon size={20} color="#f59e0b" />
                </View>
                <View style={styles.routeDetails}>
                  <Text style={styles.routeName}>{item.name}</Text>
                  <Text style={styles.routeMeta}>{item.stops.length} Stops • {item.routeId}</Text>
                </View>
                <ChevronRight size={20} color="#e7e5e4" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No routes configured yet.</Text>}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function BusListScreen({ route, navigation }) {
  const { routeId, direction } = route.params;
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveBuses();
  }, []);

  const fetchActiveBuses = async () => {
    try {
      const [asResp, fleetResp] = await Promise.all([
        fetch(`${BACKEND_URL}/api/assignments`).then(r => r.json()),
        fetch(`${BACKEND_URL}/api/fleet`).then(r => r.json())
      ]);

      // Filter assignments by route and direction
      const filteredAs = asResp.filter(a => a.routeId === routeId && a.shiftDirection === direction);
      
      // Match with live fleet state
      const results = filteredAs.map(a => {
        const live = fleetResp.find(f => f.busId === a.busId);
        return { ...a, live };
      });

      setBuses(results);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#1c1917" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Available Buses</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.listContent}>
        {loading ? <ActivityIndicator color="#f59e0b" style={{ marginTop: 40 }} /> : (
          <FlatList 
            data={buses}
            keyExtractor={item => item.busId}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.busCard}
                onPress={() => navigation.navigate('LiveTrack', { busId: item.busId, routeId: item.routeId })}
              >
                <View style={styles.busInfo}>
                  <View style={styles.busAvatar}>
                    <BusIcon size={24} color="#fff" />
                  </View>
                  <View>
                    <Text style={styles.busNumber}>Bus #{item.busId}</Text>
                    <View style={styles.statusRow}>
                      <View style={[styles.statusDot, item.live?.sysStatus === 'ONLINE' ? styles.statusOnline : styles.statusOffline]} />
                      <Text style={styles.statusText}>{item.live?.sysStatus || 'OFFLINE'}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.busEta}>
                  <Text style={styles.etaValue}>{item.live?.etaMinutes || '--'}</Text>
                  <Text style={styles.etaUnit}>MINS</Text>
                </View>
                <ChevronRight size={20} color="#e7e5e4" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Navigation size={48} color="#e7e5e4" />
                <Text style={styles.emptyText}>No buses active on this route right now.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function LiveTrackScreen({ route, navigation }) {
  const { busId, routeId } = route.params;
  const [fleetState, setFleetState] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    fetchRouteData();
    
    socketRef.current = io(BACKEND_URL, {
      transports: ['polling']
    });
    socketRef.current.emit('passenger:track', { busId });
    
    socketRef.current.on('bus:position', (state) => {
      setFleetState(state);
    });

    return () => socketRef.current.disconnect();
  }, []);

  const fetchRouteData = async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/routes`);
      const all = await resp.json();
      setRouteData(all.find(r => r.routeId === routeId));
    } catch (err) {
      console.error(err);
    }
  };

  const mapHtml = useMemo(() => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html, #map { height: 100%; margin: 0; padding: 0; background: #fafaf9; }
        .bus-marker {
          background: #f59e0b;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(0,0,0,0.2);
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([13.0827, 80.2707], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        
        var marker = L.circleMarker([0, 0], {
          radius: 10,
          fillColor: "#f59e0b",
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillOpacity: 1
        }).addTo(map);

        window.addEventListener('message', (event) => {
          const data = JSON.parse(event.data);
          if (data.lat && data.lng) {
            marker.setLatLng([data.lat, data.lng]);
            map.panTo([data.lat, data.lng], { animate: true });
          }
        });
      </script>
    </body>
    </html>
  `, []);

  const webviewRef = useRef(null);

  useEffect(() => {
    if (fleetState && webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ lat: fleetState.lat, lng: fleetState.lng }));
    }
  }, [fleetState]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.mapArea}>
        <WebView 
          ref={webviewRef}
          source={{ html: mapHtml }} 
          style={{ flex: 1 }}
        />
        <TouchableOpacity style={styles.mapBackBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#1c1917" />
        </TouchableOpacity>
        
        {fleetState && (
          <View style={styles.mapStatusBadge}>
            <View style={styles.liveIndicator} />
            <Text style={styles.liveText}>LIVE • BUS {busId}</Text>
          </View>
        )}
      </View>

      <View style={styles.timelineArea}>
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineTitle}>Route Timeline</Text>
          {fleetState && (
            <View style={styles.etaPill}>
              <Text style={styles.etaPillText}>{fleetState.etaMinutes} MINS LEFT</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.timelineScroll}>
          {routeData?.stops.map((stop, index) => {
            // Very simple logic for demonstration
            const isPassed = fleetState && index < (fleetState.progressionIndex * routeData.stops.length);
            const isCurrent = fleetState && Math.floor(fleetState.progressionIndex * routeData.stops.length) === index;
            
            return (
              <StopTimelineItem 
                key={index}
                stop={stop}
                isPassed={isPassed}
                isCurrent={isCurrent}
                isLast={index === routeData.stops.length - 1}
              />
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// ── App Main ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="BusList" component={BusListScreen} />
        <Stack.Screen name="LiveTrack" component={LiveTrackScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loginContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1c1917',
  },
  loginSubtitle: {
    fontSize: 16,
    color: '#78716c',
    marginBottom: 40,
  },
  loginForm: {
    width: '100%',
    gap: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f4',
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 60,
  },
  loginInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1c1917',
  },
  loginButton: {
    backgroundColor: '#1c1917',
    height: 60,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  header: {
    padding: 24,
    paddingTop: 40,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#1c1917',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#78716c',
    marginTop: 4,
  },
  directionToggle: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 32,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#f5f5f4',
  },
  toggleActive: {
    backgroundColor: '#f59e0b',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#78716c',
  },
  toggleTextActive: {
    color: '#fff',
  },
  searchSection: {
    flex: 1,
    paddingHorizontal: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#a8a29e',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    marginBottom: 12,
  },
  routeIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#fffbeb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  routeDetails: {
    flex: 1,
  },
  routeName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c1917',
  },
  routeMeta: {
    fontSize: 13,
    color: '#78716c',
    marginTop: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f4',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c1917',
  },
  listContent: {
    flex: 1,
    padding: 20,
  },
  busCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  busInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  busAvatar: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#1c1917',
    justifyContent: 'center',
    alignItems: 'center',
  },
  busNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c1917',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusOnline: { backgroundColor: '#16a34a' },
  statusOffline: { backgroundColor: '#a8a29e' },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#78716c',
    textTransform: 'uppercase',
  },
  busEta: {
    alignItems: 'center',
    marginRight: 16,
  },
  etaValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#f59e0b',
  },
  etaUnit: {
    fontSize: 9,
    fontWeight: '800',
    color: '#a8a29e',
  },
  mapArea: {
    height: Dimensions.get('window').height * 0.45,
    position: 'relative',
  },
  mapBackBtn: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  mapStatusBadge: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timelineArea: {
    flex: 1,
    backgroundColor: '#fafaf9',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 10,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  timelineTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1c1917',
  },
  etaPill: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  etaPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  timelineScroll: {
    paddingBottom: 40,
  },
  timelineItem: {
    flexDirection: 'row',
    height: 80,
  },
  timelineLeft: {
    width: 30,
    alignItems: 'center',
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e7e5e4',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  dotPassed: { borderColor: '#16a34a' },
  dotCurrent: { borderColor: '#f59e0b' },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#e7e5e4',
    marginVertical: 4,
  },
  linePassed: { backgroundColor: '#16a34a' },
  timelineRight: {
    flex: 1,
    paddingLeft: 20,
    paddingTop: 2,
  },
  stopName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1c1917',
  },
  textPassed: { color: '#78716c' },
  textCurrent: { color: '#f59e0b' },
  stopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  stopTime: {
    fontSize: 13,
    color: '#a8a29e',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    gap: 16,
  },
  emptyText: {
    color: '#a8a29e',
    fontSize: 14,
    textAlign: 'center',
  },
});
