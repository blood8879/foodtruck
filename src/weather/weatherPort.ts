/**
 * Current-weather lookup for stamping onto a session at open time (Phase 2).
 *
 * Weather source: Open-Meteo (https://open-meteo.com) — no API key required.
 * NOTE: Open-Meteo's free tier is non-commercial use only. For a commercial
 * launch, switch to a paid Open-Meteo plan or the 기상청(KMA) API.
 *
 * This module never throws: every failure path (permission denied, no GPS fix,
 * network/timeout error, malformed response) resolves to `null` so the caller
 * can start business without waiting on or being blocked by weather.
 */
import * as Location from "expo-location";
import type { WeatherCondition, WeatherStamp } from "../core";

const LOCATION_TIMEOUT_MS = 5000;
const WEATHER_TIMEOUT_MS = 5000;

/** Rejects if the wrapped promise doesn't settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Maps a WMO weather interpretation code to our coarse bucket.
 *
 * WMO code groups (Open-Meteo `weather_code`):
 *   0–1        clear sky / mainly clear                    → clear
 *   2–3        partly cloudy / overcast                    → clouds
 *   45, 48     fog / depositing rime fog                   → clouds
 *   51–67      drizzle & rain (incl. freezing)             → rain
 *   80–82      rain showers                                → rain
 *   95–99      thunderstorm (with/without hail)            → rain
 *   71–77      snow fall / snow grains                     → snow
 *   85–86      snow showers                                → snow
 *   (anything else)                                        → clouds
 */
function mapWmoCode(code: number): WeatherCondition {
  if (code <= 1) return "clear";
  if (code === 2 || code === 3 || code === 45 || code === 48) return "clouds";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  ) {
    return "rain";
  }
  return "clouds";
}

/** Ensures foreground location permission, requesting once if undetermined. */
async function ensureLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.granted;
}

/** Best-effort coordinates: last-known first (fast), then a low-accuracy fix. */
async function getCoords(): Promise<{ lat: number; lon: number } | null> {
  const lastKnown = await Location.getLastKnownPositionAsync();
  if (lastKnown) {
    return { lat: lastKnown.coords.latitude, lon: lastKnown.coords.longitude };
  }
  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low,
  });
  return { lat: current.coords.latitude, lon: current.coords.longitude };
}

/** Fetches current weather from Open-Meteo for the given coordinates. */
async function fetchOpenMeteo(lat: number, lon: number): Promise<WeatherStamp | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temp = json.current?.temperature_2m;
    const code = json.current?.weather_code;
    if (typeof temp !== "number" || typeof code !== "number") return null;
    return { tempC: Math.round(temp), condition: mapWmoCode(code) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the current weather snapshot, or `null` on any failure. Never throws.
 * Location acquisition (permission + fix) is bounded to ~5s; the weather fetch
 * has its own 5s timeout.
 */
export async function fetchCurrentWeather(): Promise<WeatherStamp | null> {
  try {
    const granted = await ensureLocationPermission();
    if (!granted) return null;

    const coords = await withTimeout(getCoords(), LOCATION_TIMEOUT_MS);
    if (!coords) return null;

    return await fetchOpenMeteo(coords.lat, coords.lon);
  } catch {
    return null;
  }
}
