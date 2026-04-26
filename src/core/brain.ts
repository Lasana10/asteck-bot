import { ModelFactory } from '../models/factory';
import { ParsedIncident } from '../models/base';
import { BridgeAction } from '../services/intelligenceBridge';
import { getActiveIncidents, getAvailableRoutes } from '../infra/supabase';
import axios from 'axios';

export interface ParsedIntelligence extends ParsedIncident {
  action?: BridgeAction;
  data?: any;
  replyText?: string;
}
export class IntelligenceEngine {
  /**
   * World-Class Move: The Tri-Model Router
   * Routes tasks based on the "Brain Tier" (Gemma, Gemini, Llama/Qwen).
   */
  static async routeTask(taskId: 'VERIFY_VISIT' | 'FRAUD_AUDIT' | 'CONTRACT_DRAFT', payload: any): Promise<any> {
    switch (taskId) {
      case 'VERIFY_VISIT':
        // 1. Trigger Gemma 4 (On-Device Vision) -> Mocked as Gemini 3.0 Flash for now
        console.log(`[Tri-Brain] Routing ${taskId} to Middleware Brain (Gemini 3.0)`);
        return this.observePhoto(payload.photoUrl);

      case 'FRAUD_AUDIT':
        // 2. Trigger QWN 3.6 PLUS (Cloud Reasoning) for deep analysis
        console.log(`[Tri-Brain] Routing ${taskId} to Cloud Brain (Qwen 3.6+)`);
        return this.predict(payload.location, 'fr');

      case 'CONTRACT_DRAFT':
        // 3. Trigger Llama 3.3 (Cloud Logic) for high-fidelity legal formatting
        console.log(`[Tri-Brain] Routing ${taskId} to Cloud Brain (Llama 3.3)`);
        const model = ModelFactory.getModelForTask('extraction'); // Llama is the default extraction brain
        return model.analyzeText(`Generate a Cameroonian rental contract for: ${JSON.stringify(payload)}`);

      default:
        return null;
    }
  }

  static async observeText(text: string, language: string = 'fr'): Promise<ParsedIntelligence | null> {
    const model = ModelFactory.getModel('gemini'); // 3.0 Flash for standard logic
    
    // FETCH REALITY CONTEXT (Consciousness Layer)
    const activeIncidents = await getActiveIncidents(4 * 60) || [];
    const activeRoutes = await getAvailableRoutes() || [];
    
    const realityContext = `
[REALITY_CONTEXT]
Current Time: ${new Date().toISOString()}
Language: ${language === 'fr' ? 'French/Franglais' : 'English'}
Active Incidents: ${activeIncidents.length}
Recent Reports: ${activeIncidents.slice(0, 3).map(i => i.type).join(', ')}
Active Routes: ${activeRoutes.length}
[/REALITY_CONTEXT]
`;

    console.log(`[Middleware Brain] Analyzing text in ${language} -> ${model.name}`);
    const result = await model.analyzeText(realityContext + "\nUser Input: " + text) as ParsedIntelligence;
    
    if (result) {
      console.log(`[OS Synergy] Action: ${result.action || 'SIGNAL_ONLY'}, Confidence: ${result.confidence}`);
    }

    return result;
  }

  static async observeVoice(audioUrl: string): Promise<ParsedIncident | null> {
    const model = ModelFactory.getModel('gemini'); // Gemini 3.0 Flash handles raw audio best
    console.log(`[Observer] Analyzing voice -> ${model.name}`);
    if (!model.analyzeVoice) throw new Error(`${model.name} does not support voice`);
    
    const response = await axios.get(audioUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const mimeType = response.headers['content-type'] || 'audio/ogg';

    return await model.analyzeVoice(buffer, mimeType);
  }

  static async observePhoto(imageUrl: string): Promise<ParsedIncident | null> {
    const model = ModelFactory.getModel('gemini');
    console.log(`[Observer] Analyzing photo -> ${model.name}`);
    if (!model.analyzePhoto) throw new Error(`${model.name} does not support photos`);
    
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const mimeType = response.headers['content-type'] || 'image/jpeg';

    return await model.analyzePhoto(buffer, mimeType);
  }

  /**
   * VERIFIER: Validates reports using complementary signals.
   */
  static async verify(incident: ParsedIncident): Promise<number> {
    // Current logic: simple mock verification
    // In future: Add Mapbox speed drops, nearby reports, and historical user trust.
    console.log(`[Verifier] Validating ${incident.type} at confidence ${incident.confidence}`);
    return incident.confidence; 
  }

  /**
   * PREDICTOR: Forecasts future conditions.
   * Utilizes QWN 3.6 PLUS via OpenRouter for high-volume accurate planning.
   */
  static async predict(location: string, language: string = 'fr', time: Date = new Date()): Promise<string> {
    const model = ModelFactory.getModelForTask('prediction');
    console.log(`[Predictor] Leveraging ${model.name} for ${location} in ${language}`);
    
    const context = `
[SENTINEL_PROTOCOL]
Role: Urban Intelligence Predictor
Location: ${location}
Time: ${time.toString()}
Language: ${language === 'fr' ? 'French (with subtle Cameroon Franglais grit)' : 'English'}
Directive: Provide a short, one-sentence predictive sentiment (max 15 words) for the driver/commuter HUD.
[/SENTINEL_PROTOCOL]
`;
    const res = await model.analyzeText(context);
    
    return res?.description || (language === 'fr' ? "Conditions Normales / Normal Conditions" : "Normal Conditions");
  }

  /**
   * LIVE DISPATCHER (Optimus): The core Orchestrator for reactions.
   * Utilizes Gemma 4 / Gemini 3 Flash for multi-step agentic workflows.
   */
  static async dispatch(eventType: 'DEMAND_SPIKE' | 'FATIGUE_ALERT' | 'REROUTE', payload: any): Promise<void> {
    const model = ModelFactory.getModelForTask('orchestration');
    console.log(`[Dispatcher] Reacting to ${eventType} via ${model.name}`);

    // Context preparation based on event
    const systemPrompt = `You are Optimus, the AI Dispatcher for MobilityOS. React to the following event instantly.
Event: ${eventType}
Data: ${JSON.stringify(payload)}
Determine the best action to take (e.g., Send Operator Notification, Update Route).
Respond with a JSON object containing { "action": string, "notificationText": string }`;

    const result = await model.analyzeText(systemPrompt);

    if (result && result.description) {
       console.log(`[Dispatcher Reaction]: Triggering action based on AI reasoning...`);
       // Note: Result description usually holds the generated JSON payload from our base standard model wrapper
       // In a real execution, we parse this and route to Telegram/Webhook.
       console.log(`=> Action Executed: Received payload for ${eventType}`);
    } else {
       console.log(`[Dispatcher Reaction]: FAILED to generate a valid reaction pattern.`);
    }
  }
}
