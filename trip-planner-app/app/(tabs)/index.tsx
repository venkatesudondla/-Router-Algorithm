import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Platform,
  Alert,
  SafeAreaView,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import axios from 'axios';
import debounce from 'lodash.debounce';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

// API keys
const ORS_API_KEY = '5b3ce3597851110001cf6248ad876dcdd7434c438454f8ab5051e7f5';
const OWM_API_KEY = 'c91e8298823d6e7d08c826d6d8088cbc';

// Spinner component for loading states
const Spinner = () => (
  <View style={styles.spinnerContainer}>
    <ActivityIndicator size="large" />
  </View>
);

// DestinationInput: search + autocomplete via Photon API
const DestinationInput = ({ id, text, coord, onChange }) => {
  const [input, setInput] = useState(text);
  const [results, setResults] = useState([]);

  const searchLocation = useCallback(
    debounce(async (value) => {
      if (!value) return setResults([]);
      try {
        const res = await axios.get('https://photon.komoot.io/api', {
          params: { q: value, limit: 5 },
        });
        setResults(res.data.features || []);
      } catch (err) {
        console.error('Autocomplete error:', err);
      }
    }, 300),
    []
  );

  useEffect(() => {
    searchLocation(input);
  }, [input]);

  const handleSelect = (place) => {
    const name = place.properties.name;
    const label = place.properties.city || place.properties.country || '';
    const display = `${name}, ${label}`;
    const [lon, lat] = place.geometry.coordinates;
    onChange(id, { text: display, coord: { latitude: lat, longitude: lon } });
    setInput(display);
    setResults([]);
  };

  return (
    <View style={styles.destContainer}>
      <Text style={styles.destLabel}>Destination {id}:</Text>
      <TextInput
        style={styles.destInput}
        value={input}
        placeholder="Enter destination..."
        onChangeText={(val) => {
          setInput(val);
          onChange(id, { text: val, coord: null });
        }}
      />
      {results.length > 0 && (
        <View style={styles.suggestionBox}>
          <FlatList
            data={results}
            keyExtractor={(_, idx) => idx.toString()}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handleSelect(item)} style={styles.suggestionItem}>
                <Text>{item.properties.name}, {item.properties.city || item.properties.country}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
};

// RoutePolyline: draw polyline on map
const RoutePolyline = ({ segments }) => (
  segments.length > 0
    ? <Polyline
        coordinates={segments}
        strokeColor="#007bff"
        strokeWidth={4}
      />
    : null
);

// Haversine distance for TSP heuristic
const haversineDistance = (a, b) => {
  const toRad = v => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const R = 6371;
  const x = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
};

// Nearest-neighbor TSP heuristic
const computeTSPOrder = (dests, currentLocation = null) => {
  const n = dests.length;
  if (n < 1) return [];
  
  // Create a new array including current location at the start if provided
  const allPoints = currentLocation 
    ? [{ id: 0, text: 'Current Location', coord: currentLocation }, ...dests]
    : [...dests];
  
  const totalPoints = allPoints.length;
  const visited = Array(totalPoints).fill(false);
  const order = [0]; // Always start with current location (or first destination)
  visited[0] = true;
  let current = 0;

  for (let i = 1; i < totalPoints; i++) {
    let nearest = -1;
    let minDist = Infinity;
    for (let j = 0; j < totalPoints; j++) {
      if (!visited[j] && allPoints[j].coord) {
        const d = haversineDistance(allPoints[current].coord, allPoints[j].coord);
        if (d < minDist) {
          minDist = d;
          nearest = j;
        }
      }
    }
    if (nearest < 0) break;
    visited[nearest] = true;
    order.push(nearest);
    current = nearest;
  }

  // If we started with current location, adjust the order indices
  return currentLocation 
    ? order.filter(idx => idx !== 0).map(idx => idx - 1)
    : order;
};

export default function HomeScreen() {
  const [destinations, setDestinations] = useState([{ id: 1, text: '', coord: null }]);
  const [routeOrder, setRouteOrder] = useState([]);
  const [routeSegments, setRouteSegments] = useState([]);
  const [weatherData, setWeatherData] = useState({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(null);

  // Get user's current location
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = location.coords;
        setCurrentLocation({ latitude, longitude });
      } catch (error) {
        console.error('Error getting location:', error);
        setErrorMsg('Could not get your current location');
      }
    })();
  }, []);

  // update single destination
  const updateDestination = (id, data) => {
    setDestinations(prev => prev.map(d => d.id === id ? { ...d, ...data } : d));
  };

  // add new input field
  const addDestination = () => {
    setDestinations(prev => [...prev, { id: prev.length + 1, text: '', coord: null }]);
  };

  // reset entire planner
  const resetTrip = () => {
    setDestinations([{ id: 1, text: '', coord: null }]);
    setRouteOrder([]);
    setRouteSegments([]);
    setWeatherData({});
    setErrorMsg('');
  };

  // plan trip: TSP + ORS + weather
  const planTrip = async () => {
    setErrorMsg('');
    // validate
    if (destinations.some(d => !d.coord)) {
      setErrorMsg('Please select valid coordinates for all destinations.');
      return;
    }
    if (!currentLocation) {
      setErrorMsg('Waiting for your current location...');
      return;
    }
    setLoading(true);

    try {
      // compute optimized order starting from current location
      const order = computeTSPOrder(destinations, currentLocation);
      setRouteOrder(order);

      // fetch route segments
      let combined = [];
      
      // First segment: from current location to first destination
      const firstDest = destinations[order[0]].coord;
      const initialSegmentRes = await axios.post(
        'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
        { coordinates: [[currentLocation.longitude, currentLocation.latitude], [firstDest.longitude, firstDest.latitude]] },
        { headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' } }
      );
      
      const initialSegment = initialSegmentRes.data.features[0].geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] }));
      combined = combined.concat(initialSegment);

      // Remaining segments between destinations
      for (let i = 0; i < order.length - 1; i++) {
        const from = destinations[order[i]].coord;
        const to = destinations[order[i+1]].coord;

        const res = await axios.post(
          'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
          { coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] },
          { headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' } }
        );

        const segment = res.data.features[0].geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] }));
        if (combined.length && JSON.stringify(combined[combined.length-1]) === JSON.stringify(segment[0])) {
          combined = combined.concat(segment.slice(1));
        } else {
          combined = combined.concat(segment);
        }
      }
      setRouteSegments(combined);

      // fetch weather concurrently
      const weatherResults = {};
      await Promise.all(destinations.map(async d => {
        const { latitude, longitude } = d.coord;
        try {
          const res = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: { lat: latitude, lon: longitude, appid: OWM_API_KEY, units: 'metric' }
          });
          weatherResults[d.id] = res.data;
        } catch (e) {
          console.error(`Weather fetch error for ${d.id}:`, e);
        }
      }));
      setWeatherData(weatherResults);

    } catch (e) {
      console.error('Planning error:', e);
      setErrorMsg('An error occurred during trip planning.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  // initial region for map: current location or first dest or default India
  const initialRegion = currentLocation
    ? { ...currentLocation, latitudeDelta: 0.5, longitudeDelta: 0.5 }
    : destinations[0].coord
      ? { ...destinations[0].coord, latitudeDelta: 0.5, longitudeDelta: 0.5 }
      : { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 5, longitudeDelta: 5 };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {sidebarVisible && (
          <View style={styles.sidebarContainer}>
            <ScrollView style={styles.sidebar} keyboardShouldPersistTaps="handled">
              <Text style={styles.header}>Trip Planner</Text>
              <Text style={styles.subText}>Starting from your current location</Text>

              {destinations.map(d => (
                <DestinationInput key={d.id} id={d.id} text={d.text} coord={d.coord} onChange={updateDestination} />
              ))}

              {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

              <Button title="Add Destination" onPress={addDestination} />
              <View style={styles.space} />
              <Button title={loading ? 'Planning...' : 'Plan Trip'} onPress={planTrip} disabled={loading} />
              <View style={styles.space} />
              <Button title="Reset Trip" onPress={resetTrip} />

              {loading && <Spinner />}

              {routeOrder.length > 0 && (
                <View style={styles.orderContainer}>
                  <Text style={styles.orderHeader}>Optimized Order:</Text>
                  <Text style={styles.orderItem}>Start: Your Current Location</Text>
                  {routeOrder.map(idx => (
                    <Text key={idx} style={styles.orderItem}>
                      {destinations[idx].text}
                    </Text>
                  ))}
                </View>
              )}

              {Object.keys(weatherData).length > 0 && (
                <View style={styles.weatherContainer}>
                  <Text style={styles.weatherHeader}>Weather Info:</Text>
                  {destinations.map(d => d.coord && weatherData[d.id] && (
                    <View key={d.id} style={styles.weatherItem}>
                      <Text style={styles.weatherTitle}>{weatherData[d.id].name}</Text>
                      <Text>☀️ {weatherData[d.id].weather[0].description} - {weatherData[d.id].main.temp}°C</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.hideButton} onPress={toggleSidebar}>
              <Ionicons name="chevron-back-outline" size={24} color="#007bff" />
              <Text style={styles.hideButtonText}>Hide</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.mapContainer}>
          {!sidebarVisible && (
            <TouchableOpacity style={styles.showButton} onPress={toggleSidebar}>
              <Ionicons name="chevron-forward-outline" size={24} color="#007bff" />
            </TouchableOpacity>
          )}
          
          <MapView style={styles.map} initialRegion={initialRegion}>
            {/* Current Location Marker */}
            {currentLocation && (
              <Marker
                coordinate={currentLocation}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.currentLocationMarker} />
              </Marker>
            )}
            
            {destinations.filter(d => d.coord).map(d => (
              <Marker
                key={d.id}
                coordinate={d.coord}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.customMarker} />
              </Marker>
            ))}

            <RoutePolyline segments={routeSegments} />
          </MapView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 25 : 0, // Add padding for notification bar
  },
  container: { 
    flex: 1, 
    flexDirection: 'row',
  },
  sidebarContainer: {
    width: 350,
    backgroundColor: '#f9f9f9',
    position: 'relative',
  },
  sidebar: {
    padding: 16,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subText: { fontSize: 14, color: '#555', marginBottom: 16 },
  destContainer: { marginBottom: 12 },
  destLabel: { fontSize: 14, fontWeight: '600' },
  destInput: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  suggestionBox: {
    maxHeight: 120,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginTop: 4,
  },
  suggestionItem: { padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  error: { color: 'red', marginBottom: 8 },
  space: { height: 10 },
  spinnerContainer: { marginVertical: 16 },
  orderContainer: { marginTop: 16 },
  orderHeader: { fontSize: 16, fontWeight: '600' },
  orderItem: { fontSize: 14, marginLeft: 8 },
  weatherContainer: { marginTop: 16 },
  weatherHeader: { fontSize: 16, fontWeight: '600' },
  weatherItem: { padding: 8, backgroundColor: '#eef6ff', borderRadius: 6, marginBottom: 8 },
  weatherTitle: { fontWeight: 'bold' },
  map: { flex: 1 },
  customMarker: {
    backgroundColor: '#FF5733',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
  },
  currentLocationMarker: {
    backgroundColor: '#4285F4',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
  },
  hideButton: {
    position: 'absolute',
    right: 0,
    top: '50%',
    backgroundColor: '#fff',
    padding: 10,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  hideButtonText: {
    color: '#007bff',
    marginLeft: 4,
  },
  showButton: {
    position: 'absolute',
    left: 0,
    top: '50%',
    zIndex: 999,
    backgroundColor: '#fff',
    padding: 10,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});