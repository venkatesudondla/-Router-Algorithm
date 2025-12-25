import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import debounce from 'lodash.debounce';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// API keys
const ORS_API_KEY = '5b3ce3597851110001cf6248ad876dcdd7434c438454f8ab5051e7f5';
const OWM_API_KEY = 'c91e8298823d6e7d08c826d6d8088cbc';

// Custom Marker using a CSS styled divIcon
const customMarker = L.divIcon({
  className: 'custom-marker',
  html: '<div style="background: #FF5733; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #fff;"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Simple spinner component (using CSS animations)
const Spinner = () => (
  <div style={{ textAlign: 'center', margin: '10px' }}>
    <div className="spinner" style={{
      border: '4px solid #f3f3f3',
      borderTop: '4px solid #3498db',
      borderRadius: '50%',
      width: '24px',
      height: '24px',
      animation: 'spin 2s linear infinite',
      margin: 'auto'
    }} />
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

// DestinationInput Component:
// A reusable search input with fast Photon API autocomplete.
const DestinationInput = ({ destination, onChange }) => {
  const [input, setInput] = useState(destination.text);
  const [results, setResults] = useState([]);

  // Memoized debounced search for suggestions
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
    }, 200),
    []
  );

  useEffect(() => {
    searchLocation(input);
  }, [input, searchLocation]);

  const handleSelect = (place) => {
    const name = place.properties.name;
    const locationLabel = place.properties.city || place.properties.country || '';
    const text = `${name}, ${locationLabel}`;
    setInput(text);
    setResults([]);
    // Pass back coordinate ([lat, lon]) along with text.
    const coord = place.geometry.coordinates.slice().reverse();
    onChange(destination.id, { text, coord });
  };

  return (
    <div style={{ marginBottom: '12px', width: '320px', position: 'relative' }}>
      <label style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
        Destination {destination.id}:
      </label>
      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          onChange(destination.id, { text: e.target.value, coord: null });
        }}
        placeholder="Enter destination..."
        style={{
          padding: '12px',
          width: '100%',
          borderRadius: '8px',
          border: '1px solid #ccc',
          fontSize: '14px',
          transition: 'all 0.3s ease'
        }}
      />
      {results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '48px',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            zIndex: 1000,
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            transition: 'opacity 0.3s ease'
          }}
        >
          {results.map((r, i) => (
            <div
              key={i}
              onClick={() => handleSelect(r)}
              style={{
                padding: '8px',
                cursor: 'pointer',
                borderBottom: i !== results.length - 1 ? '1px solid #eee' : 'none'
              }}
            >
              {r.properties.name}, {r.properties.city || r.properties.country}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// RoutePolyline Component: Renders the complete polyline for the trip.
const RoutePolyline = ({ routeSegments }) => {
  return routeSegments.length > 0 ? <Polyline positions={routeSegments} color="blue" weight={5} /> : null;
};

// Haversine distance: calculates distance between two coordinates.
const haversineDistance = (coord1, coord2) => {
  const toRad = (val) => (val * Math.PI) / 180;
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// computeTSPOrder: Uses a nearest-neighbor heuristic for an approximate optimal route.
const computeTSPOrder = (destinations) => {
  const n = destinations.length;
  if (n === 0) return [];
  const visited = new Array(n).fill(false);
  const order = [];
  let current = 0;
  order.push(current);
  visited[current] = true;

  for (let count = 1; count < n; count++) {
    let nearest = -1;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && destinations[current].coord && destinations[i].coord) {
        const d = haversineDistance(destinations[current].coord, destinations[i].coord);
        if (d < minDist) {
          minDist = d;
          nearest = i;
        }
      }
    }
    if (nearest === -1) break;
    order.push(nearest);
    visited[nearest] = true;
    current = nearest;
  }
  return order;
};

// Main App Component: Combines inputs, route optimization, weather fetching and real-time map.
function App() {
  const [destinations, setDestinations] = useState([{ id: 1, text: '', coord: null }]);
  const [optimizedOrder, setOptimizedOrder] = useState([]);
  const [routeSegments, setRouteSegments] = useState([]); // Combined polyline points
  const [weatherData, setWeatherData] = useState({}); // key: destination id, value: weather info
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Update destination from the DestinationInput
  const updateDestination = (id, newData) => {
    setDestinations((prev) =>
      prev.map((dest) => (dest.id === id ? { ...dest, ...newData } : dest))
    );
  };

  // Add new destination input field.
  const addDestination = () => {
    setDestinations((prev) => [...prev, { id: prev.length + 1, text: '', coord: null }]);
  };

  // Reset the trip planner.
  const resetTrip = () => {
    setDestinations([{ id: 1, text: '', coord: null }]);
    setOptimizedOrder([]);
    setRouteSegments([]);
    setWeatherData({});
    setErrorMsg('');
  };

  // Plan the trip: validate inputs, compute optimized order, fetch route segments and weather.
  const planTrip = async () => {
    setErrorMsg('');
    // Validate all destinations
    const allValid = destinations.every((dest) => dest.coord !== null);
    if (!allValid) {
      setErrorMsg('Please select valid locations for all destinations.');
      return;
    }
    setLoading(true);
    try {
      // Compute TSP order (array of indices)
      const orderIndices = computeTSPOrder(destinations);
      setOptimizedOrder(orderIndices);

      // Fetch route segments for each consecutive leg via OpenRouteService.
      let combinedPolyline = [];
      for (let i = 0; i < orderIndices.length - 1; i++) {
        const from = destinations[orderIndices[i]].coord;
        const to = destinations[orderIndices[i + 1]].coord;
        try {
          const res = await axios.post(
            'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
            { coordinates: [from.slice().reverse(), to.slice().reverse()] },
            { headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' } }
          );
          const segment = res.data.features[0].geometry.coordinates.map((c) => [c[1], c[0]]);
          if (combinedPolyline.length > 0) {
            // Avoid duplicate point between segments.
            if (
              JSON.stringify(combinedPolyline[combinedPolyline.length - 1]) ===
              JSON.stringify(segment[0])
            ) {
              combinedPolyline = combinedPolyline.concat(segment.slice(1));
            } else {
              combinedPolyline = combinedPolyline.concat(segment);
            }
          } else {
            combinedPolyline = segment;
          }
        } catch (err) {
          console.error('Error fetching route segment:', err);
        }
      }
      setRouteSegments(combinedPolyline);

      // Fetch weather for each destination concurrently from OpenWeatherMap.
      const weatherResults = {};
      await Promise.all(
        destinations.map(async (dest) => {
          try {
            const res = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
              params: {
                lat: dest.coord[0],
                lon: dest.coord[1],
                appid: OWM_API_KEY,
                units: 'metric',
              },
            });
            weatherResults[dest.id] = res.data;
          } catch (err) {
            console.error(`Error fetching weather for destination ${dest.id}:`, err);
          }
        })
      );
      setWeatherData(weatherResults);
    } catch (error) {
      console.error('Error in planning trip:', error);
      setErrorMsg('An error occurred while planning your trip.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', fontFamily: 'Arial, sans-serif' }}>
      {/* Sidebar */}
      <div
        style={{
          width: '350px',
          padding: '20px',
          overflowY: 'auto',
          boxShadow: '2px 0 5px rgba(0,0,0,0.1)',
          backgroundColor: '#f9f9f9'
        }}
      >
        <h2 style={{ textAlign: 'center' }}>Trip Planner</h2>
        <p style={{ fontSize: '12px', color: '#555', marginBottom: '15px', textAlign: 'center' }}>
          Enter your desired destinations and click "Plan Trip" to see the best route and current weather at each stop.
        </p>
        {destinations.map((dest) => (
          <div key={dest.id} style={{ marginBottom: '16px' }}>
            <DestinationInput destination={dest} onChange={updateDestination} />
            {weatherData[dest.id] && (
              <div
                style={{
                  fontSize: '12px',
                  marginTop: '4px',
                  padding: '6px',
                  background: '#eef6ff',
                  borderRadius: '4px',
                  border: '1px solid #cce0ff'
                }}
              >
                <div>
                  <strong>{weatherData[dest.id].name}</strong>
                </div>
                <div>
                  {/* Using Unicode weather symbols as a simple icon */}
                  ☀️ {weatherData[dest.id].weather[0].description} - {weatherData[dest.id].main.temp}&deg;C
                </div>
              </div>
            )}
          </div>
        ))}
        {errorMsg && <div style={{ color: 'red', marginBottom: '10px', textAlign: 'center' }}>{errorMsg}</div>}
        <button
          onClick={addDestination}
          style={{
            padding: '10px 15px',
            marginBottom: '10px',
            background: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '5px',
            width: '100%',
            cursor: 'pointer',
          }}
        >
          Add Destination
        </button>
        <button
          onClick={planTrip}
          style={{
            padding: '10px 15px',
            background: '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: '5px',
            width: '100%',
            cursor: 'pointer',
            marginBottom: '10px'
          }}
          disabled={loading}
        >
          {loading ? 'Planning...' : 'Plan Trip'}
        </button>
        <button
          onClick={resetTrip}
          style={{
            padding: '10px 15px',
            background: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: '5px',
            width: '100%',
            cursor: 'pointer'
          }}
        >
          Reset Trip
        </button>
        {loading && <Spinner />}
        {optimizedOrder.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h3>Optimized Order:</h3>
            <ol>
              {optimizedOrder.map((idx) => (
                <li key={destinations[idx].id}>{destinations[idx].text}</li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Map Display */}
      <div style={{ flexGrow: 1 }}>
        <MapContainer
          center={destinations[0].coord || [20.5937, 78.9629]}
          zoom={destinations[0].coord ? 13 : 5}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {destinations.map(
            (dest) => dest.coord && <Marker key={dest.id} position={dest.coord} icon={customMarker} />
          )}
          {routeSegments.length > 0 && <RoutePolyline routeSegments={routeSegments} />}
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
