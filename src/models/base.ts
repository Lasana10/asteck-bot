import { IncidentType, Severity } from '../types';

export interface ParsedIncident {
  type: IncidentType;
  severity: Severity;
  description: string;
  locationHint?: string;
  isEmergency: boolean;
  confidence: number;
}

export interface AIModel {
  name: string;
  analyzeText(text: string): Promise<ParsedIncident | null>;
  analyzeVoice?(audioBuffer: Buffer, mimeType: string): Promise<ParsedIncident | null>;
  analyzePhoto?(imageBuffer: Buffer, mimeType: string): Promise<ParsedIncident | null>;
}
