import { ModelFactory } from '../models/factory';

export class IntelligenceEngine {
  static async analyzeReport(text: string): Promise<any> {
    const model = ModelFactory.getModel();
    console.log(`Using AI Model: ${model.name}`);
    
    const parsed = await model.analyzeText(text);
    return parsed;
  }
}
