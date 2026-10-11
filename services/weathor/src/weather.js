import axios from "axios";

const WMO = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Icy fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};

async function geocode(location) {
  const { data } = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
    params: { name: location, count: 1, language: "en", format: "json" },
    timeout: 8000,
  });
  if (!data.results?.length) throw new Error(`Location not found: ${location}`);
  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, name: r.name, country: r.country, timezone: r.timezone };
}

export async function getWeather(location, days = 3, units = "celsius") {
  const { lat, lon, name, country, timezone } = await geocode(location);
  const tempUnit = units === "fahrenheit" ? "fahrenheit" : "celsius";
  const unitSymbol = tempUnit === "celsius" ? "°C" : "°F";

  const { data } = await axios.get("https://api.open-meteo.com/v1/forecast", {
    params: {
      latitude: lat,
      longitude: lon,
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
      forecast_days: Math.min(Math.max(days, 1), 7),
      timezone: timezone || "auto",
      temperature_unit: tempUnit,
    },
    timeout: 10000,
  });

  const c = data.current;
  const d = data.daily;

  return {
    location: name,
    country,
    timezone: data.timezone,
    units: unitSymbol,
    current: {
      temperature: c.temperature_2m,
      feels_like: c.apparent_temperature,
      humidity_pct: c.relative_humidity_2m,
      precipitation_mm: c.precipitation,
      wind_speed_kmh: c.wind_speed_10m,
      wind_direction_deg: c.wind_direction_10m,
      condition: WMO[c.weather_code] ?? "Unknown",
      weather_code: c.weather_code,
      time: c.time,
    },
    forecast: d.time.map((date, i) => ({
      date,
      condition: WMO[d.weather_code[i]] ?? "Unknown",
      temp_max: d.temperature_2m_max[i],
      temp_min: d.temperature_2m_min[i],
      precipitation_mm: d.precipitation_sum[i],
      wind_max_kmh: d.wind_speed_10m_max[i],
    })),
  };
}
