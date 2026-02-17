import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const OWM_API_KEY = process.env.OPENWEATHERMAP_API_KEY;

// Cameroon city coordinates
const CITIES: Record<string, { lat: number; lon: number }> = {
  yaounde: { lat: 3.8667, lon: 11.5167 },
  douala: { lat: 4.0483, lon: 9.7043 },
};

export interface WeatherAlert {
  city: string;
  condition: string;
  description: string;
  isRainWarning: boolean;
  isFloodRisk: boolean;
  temperature: number;
  humidity: number;
}

export class WeatherService {
  /**
   * Get current weather for a Cameroon city.
   * Returns a weather alert if rain/storm detected.
   */
  static async getWeather(city: 'yaounde' | 'douala'): Promise<WeatherAlert | null> {
    if (!OWM_API_KEY) {
      console.warn('⚠️ OPENWEATHERMAP_API_KEY not set. Weather features disabled.');
      return null;
    }

    const coords = CITIES[city];
    if (!coords) return null;

    try {
      const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: {
          lat: coords.lat,
          lon: coords.lon,
          appid: OWM_API_KEY,
          units: 'metric',
          lang: 'fr',
        },
      });

      const data = response.data;
      const condition = data.weather?.[0]?.main || 'Unknown';
      const description = data.weather?.[0]?.description || '';
      const temp = data.main?.temp || 0;
      const humidity = data.main?.humidity || 0;

      // Rain keywords for Cameroon context
      const isRainWarning = /rain|thunderstorm|drizzle|pluie|orage|averse/i.test(
        `${condition} ${description}`
      );

      // High humidity + rain = flood risk (especially in Deido, Bonaberi, Mvan areas)
      const isFloodRisk = isRainWarning && humidity > 80;

      return {
        city: city === 'yaounde' ? 'Yaoundé' : 'Douala',
        condition,
        description,
        isRainWarning,
        isFloodRisk,
        temperature: Math.round(temp),
        humidity,
      };
    } catch (error) {
      console.error(`[Weather] Error fetching for ${city}:`, error);
      return null;
    }
  }

  /**
   * Get weather context string for enriching flood reports
   */
  static async getFloodContext(lat: number, lon: number): Promise<string | null> {
    // Determine nearest city
    const distYaounde = Math.abs(lat - 3.8667) + Math.abs(lon - 11.5167);
    const distDouala = Math.abs(lat - 4.0483) + Math.abs(lon - 9.7043);
    const nearestCity = distYaounde < distDouala ? 'yaounde' : 'douala';

    const weather = await this.getWeather(nearestCity as 'yaounde' | 'douala');
    if (!weather) return null;

    if (weather.isFloodRisk) {
      return `🌧️ Risque d'inondation élevé / High flood risk — ${weather.city}: ${weather.description}, ${weather.humidity}% humidité`;
    }
    if (weather.isRainWarning) {
      return `🌧️ Pluie en cours / Rain active — ${weather.city}: ${weather.description}`;
    }

    return null;
  }
}
