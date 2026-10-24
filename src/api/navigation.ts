import express, { Request, Response } from 'express';
import { DirectionsService } from '../services/directions';
import { GeoService } from '../services/geo';
import { Coordinates } from '../types';

const router = express.Router();

function coordinate(req: Request, prefix: 'origin' | 'destination'): Coordinates | null {
  const lat = req.query[`${prefix}_lat`];
  const lon = req.query[`${prefix}_lon`];
  if (typeof lat !== 'string' || typeof lon !== 'string' || !lat.trim() || !lon.trim()) return null;
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

// Navigation works independently of booking or payment. Do not fabricate a
// route when an underlying provider is unavailable.
router.get('/navigation/route', async (req: Request, res: Response) => {
  const origin = coordinate(req, 'origin');
  const destination = coordinate(req, 'destination');
  if (!origin || !destination) {
    return res.status(400).json({
      code: 'INVALID_COORDINATES',
      error: 'origin_lat, origin_lon, destination_lat and destination_lon must be valid coordinates.',
    });
  }
  const mode = req.query.mode === undefined ? 'driving' : req.query.mode;
  if(mode !== 'driving' && mode !== 'foot' && mode !== 'bicycle' && mode !== 'motorcycle')return res.status(400).json({code:'INVALID_TRAVEL_MODE',error:'Supported mode must be driving, foot, bicycle or motorcycle.'});
  try {
    // A publicly reachable endpoint must not silently spend metered Google quota.
    const directions = await DirectionsService.getDirections(origin, destination, {
      allowMeteredFallback: mode === 'driving' && process.env.AFAT_ALLOW_PUBLIC_PAID_ROUTING === 'true',
      travelMode: mode,
    });
    if (!directions) {
      return res.status(503).json({
        code: 'ROUTING_UNAVAILABLE',
        error: 'No verified routing provider is available for this journey.',
      });
    }
    return res.json({
      origin,
      destination,
      travel_mode: mode,
      traffic_aware: false,
      source: directions.source,
      primary: directions.primary,
      alternatives: directions.alternatives,
    });
  } catch (error) {
    console.error('AFAT navigation route failure:', error);
    return res.status(503).json({ code: 'ROUTING_UNAVAILABLE', error: 'Routing is temporarily unavailable.' });
  }
});

router.get('/navigation/reverse-geocode', async (req: Request, res: Response) => {
  const lat = req.query.lat;
  const lon = req.query.lon;
  if (typeof lat !== 'string' || typeof lon !== 'string' || !lat.trim() || !lon.trim()) {
    return res.status(400).json({ code: 'INVALID_COORDINATES', error: 'Valid lat and lon are required.' });
  }
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return res.status(400).json({ code: 'INVALID_COORDINATES', error: 'Valid lat and lon are required.' });
  }
  try {
    const label = await GeoService.reverseGeocode({ latitude, longitude });
    if (!label) return res.status(503).json({ code: 'GEOCODER_UNAVAILABLE', error: 'Address lookup unavailable.' });
    return res.json({ location: { latitude, longitude }, label });
  } catch (error) {
    console.error('AFAT reverse geocode failure:', error);
    return res.status(503).json({ code: 'GEOCODER_UNAVAILABLE', error: 'Address lookup unavailable.' });
  }
});

export default router;
