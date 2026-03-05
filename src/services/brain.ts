import { geminiClient, ParsedIncident } from '../infra/gemini';
import { groqClient } from '../infra/groq';

export class BrainService {
  /**
   * Orchestrate analysis using Hybrid logic:
   * Level 1: Gemini 2.5 Flash (Fast, Multimodal)
   * Level 2: Groq Llama 3.3 70B (Deep Reasoning, Elite logic)
   */
  async analyze(text: string): Promise<ParsedIncident | null> {
    console.log('🧠 [BRAIN] Starting Hybrid Analysis...');
    
    // Level 1: Standard Fast Analysis (Multimodal or Text)
    const level1 = await geminiClient.analyzeText(text);
    return this.orchestrate(text, level1);
  }

  /**
   * Internal orchestrator to decide if Level 2 is needed
   */
  async orchestrate(text: string, baseAnalysis: ParsedIncident | null): Promise<ParsedIncident | null> {
    if (!baseAnalysis) return null;

    // Orchestration Logic: Trigger Groq if confidence is low OR if it's a complex report
    const isLowConfidence = baseAnalysis.confidence < 0.7;
    const isComplex = text.length > 150 || /\b(sos|urgence|emergency|help|danger|dead|mort|blocked|closed|authority|police|accident|collision|jam)\b/i.test(text);

    if (isLowConfidence || isComplex) {
      console.log(`🧠 [BRAIN] Level 2 Triggered (Confidence: ${baseAnalysis.confidence}, Complex: ${isComplex})`);
      const level2 = await groqClient.analyzeDeep(text);
      
      if (level2) {
        console.log('🧠 [BRAIN] Level 2 Response Integrated (Elite Reasoning)');
        return {
          ...level2,
          // Keep sensor data from Stage 1 if available
          sensorData: baseAnalysis.sensorData
        };
      }
    }

    console.log('🧠 [BRAIN] Level 1 Response Sufficient.');
    return baseAnalysis;
  }
}

export const brainService = new BrainService();
