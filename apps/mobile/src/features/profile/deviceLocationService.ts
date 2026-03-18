import * as Location from "expo-location";

export type CapturedDeviceLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
  city: string | null;
};

export async function captureCurrentDeviceLocation(): Promise<
  { ok: true; location: CapturedDeviceLocation } | { ok: false; error: string }
> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, error: "Location permission was not granted." };
  }

  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced
  });

  const latitude = current.coords.latitude;
  const longitude = current.coords.longitude;
  const accuracyMeters = typeof current.coords.accuracy === "number" ? current.coords.accuracy : null;
  const capturedAt = new Date(current.timestamp || Date.now()).toISOString();

  let city: string | null = null;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    city = place?.city ?? place?.subregion ?? place?.region ?? null;
  } catch {
    city = null;
  }

  return {
    ok: true,
    location: {
      latitude,
      longitude,
      accuracyMeters,
      capturedAt,
      city
    }
  };
}
