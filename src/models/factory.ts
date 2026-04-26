import { AIModel } from './base';
import { geminiClient } from '../infra/gemini';
import { groqClient } from '../infra/groq';
import { qwenClient, gemmaClient } from '../infra/openrouter';

export class ModelFactory {
  private static models: Map<string, AIModel> = new Map();
  private static defaultModel: string = process.env.DEFAULT_AI_MODEL || 'groq';

  static {
    // Register available models
    this.models.set('gemini', geminiClient);        // Gemini 3 Flash / 2.0 (Audio)
    this.models.set('groq', groqClient);            // Groq Llama 3.3 70B
    this.models.set('qwen', qwenClient);            // QWN 3.6 PLUS (OpenRouter Elite)
    this.models.set('gemma', gemmaClient);          // Gemma 4 (OpenRouter Orchestration)
  }

  static getModel(name?: string): AIModel {
    const modelName = name || this.defaultModel;
    const model = this.models.get(modelName);
    
    if (!model) {
      console.warn(`Model ${modelName} not found, falling back to groq`);
      return this.models.get('groq')!;
    }
    
    return model;
  }

  // Task-specific routing based on CityBrain requirements
  static getModelForTask(task: 'extraction' | 'orchestration' | 'prediction'): AIModel {
    switch (task) {
      case 'extraction':
        return this.models.get('groq')!; // Fast, structured pulling
      case 'orchestration':
        // Gemma 4 handles complex multi-step reactions, fallback to Gemini Flash
        return this.models.get('gemma') || this.models.get('gemini')!; 
      case 'prediction':
        // QWN 3.6 PLUS is the elite brain for math, demand spikes, and routing logic
        return this.models.get('qwen')!; 
      default:
        return this.getModel();
    }
  }

  static listModels(): string[] {
    return Array.from(this.models.keys());
  }
}
