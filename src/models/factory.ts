import { AIModel } from './base';
import { GeminiModel } from './gemini';
import { OpenCodeModel } from './opencode';

export class ModelFactory {
  private static models: Map<string, AIModel> = new Map();
  private static defaultModel: string = process.env.DEFAULT_AI_MODEL || 'gemini';

  static {
    // Register available models
    this.models.set('gemini', new GeminiModel());
    this.models.set('opencode', new OpenCodeModel());
  }

  static getModel(name?: string): AIModel {
    const modelName = name || this.defaultModel;
    const model = this.models.get(modelName);
    
    if (!model) {
      console.warn(`Model ${modelName} not found, falling back to gemini`);
      return this.models.get('gemini')!;
    }
    
    return model;
  }

  static listModels(): string[] {
    return Array.from(this.models.keys());
  }
}
