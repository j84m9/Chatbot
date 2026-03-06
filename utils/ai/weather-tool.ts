import { tool } from 'ai';
import { z } from 'zod';

/** WMO Weather Interpretation Codes → description + emoji */
const WMO_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: 'Clear sky', icon: '☀️' },
  1: { description: 'Mainly clear', icon: '🌤️' },
  2: { description: 'Partly cloudy', icon: '⛅' },
  3: { description: 'Overcast', icon: '☁️' },
  45: { description: 'Fog', icon: '🌫️' },
  48: { description: 'Depositing rime fog', icon: '🌫️' },
  51: { description: 'Light drizzle', icon: '🌦️' },
  53: { description: 'Moderate drizzle', icon: '🌦️' },
  55: { description: 'Dense drizzle', icon: '🌧️' },
  56: { description: 'Light freezing drizzle', icon: '🌧️' },
  57: { description: 'Dense freezing drizzle', icon: '🌧️' },
  61: { description: 'Slight rain', icon: '🌧️' },
  63: { description: 'Moderate rain', icon: '🌧️' },
  65: { description: 'Heavy rain', icon: '🌧️' },
  66: { description: 'Light freezing rain', icon: '🌧️' },
  67: { description: 'Heavy freezing rain', icon: '🌧️' },
  71: { description: 'Slight snow', icon: '🌨️' },
  73: { description: 'Moderate snow', icon: '🌨️' },
  75: { description: 'Heavy snow', icon: '❄️' },
  77: { description: 'Snow grains', icon: '❄️' },
  80: { description: 'Slight rain showers', icon: '🌦️' },
  81: { description: 'Moderate rain showers', icon: '🌧️' },
  82: { description: 'Violent rain showers', icon: '🌧️' },
  85: { description: 'Slight snow showers', icon: '🌨️' },
  86: { description: 'Heavy snow showers', icon: '❄️' },
  95: { description: 'Thunderstorm', icon: '⛈️' },
  96: { description: 'Thunderstorm with slight hail', icon: '⛈️' },
  99: { description: 'Thunderstorm with heavy hail', icon: '⛈️' },
};

function decodeWMO(code: number) {
  return WMO_CODES[code] ?? { description: 'Unknown', icon: '❓' };
}

function windDirectionLabel(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

export function createWeatherTool() {
  return tool({
    description:
      'Get current weather and a 5-day forecast for a location. Use this whenever the user asks about weather, temperature, or forecasts.',
    inputSchema: z.object({
      location: z.string().describe('City name or place to look up, e.g. "Tokyo" or "Paris, France"'),
      latitude: z.number().optional().describe('Optional latitude if already known'),
      longitude: z.number().optional().describe('Optional longitude if already known'),
    }),
    execute: async ({ location, latitude, longitude }) => {
      try {
        // 1. Geocode if coordinates not provided
        let lat = latitude;
        let lon = longitude;
        let resolvedName = location;

        if (lat == null || lon == null) {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en`
          );
          if (!geoRes.ok) {
            return { error: `Geocoding failed: ${geoRes.statusText}` };
          }
          const geoData = await geoRes.json();
          if (!geoData.results?.length) {
            return { error: `Could not find location "${location}". Try a different spelling or a nearby major city.` };
          }
          const place = geoData.results[0];
          lat = place.latitude;
          lon = place.longitude;
          resolvedName = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
        }

        // 2. Fetch current weather + 5-day daily forecast
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
            `&forecast_days=5&timezone=auto`
        );
        if (!weatherRes.ok) {
          return { error: `Weather API failed: ${weatherRes.statusText}` };
        }
        const w = await weatherRes.json();

        const currentCode = w.current.weather_code as number;
        const { description, icon } = decodeWMO(currentCode);

        return {
          location: resolvedName,
          current: {
            temperature: w.current.temperature_2m,
            feelsLike: w.current.apparent_temperature,
            humidity: w.current.relative_humidity_2m,
            windSpeed: w.current.wind_speed_10m,
            windDirection: windDirectionLabel(w.current.wind_direction_10m),
            weatherCode: currentCode,
            description,
            icon,
          },
          forecast: (w.daily.time as string[]).map((date: string, i: number) => {
            const fc = decodeWMO(w.daily.weather_code[i]);
            return {
              date,
              high: w.daily.temperature_2m_max[i],
              low: w.daily.temperature_2m_min[i],
              weatherCode: w.daily.weather_code[i],
              description: fc.description,
              icon: fc.icon,
            };
          }),
          units: {
            temperature: w.current_units?.temperature_2m || '°C',
            windSpeed: w.current_units?.wind_speed_10m || 'km/h',
          },
        };
      } catch (err: any) {
        return { error: err.message || 'Failed to fetch weather data' };
      }
    },
  });
}
