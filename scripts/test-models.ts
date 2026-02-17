import { ModelFactory } from './src/models/factory';
import dotenv from 'dotenv';

dotenv.config();

async function testModels() {
  const testText = "Accident grave au carrefour Bastos, une voiture a percuté un poteau.";
  
  console.log('--- Testing Models ---');
  
  const models = ModelFactory.listModels();
  console.log('Available models:', models);

  for (const modelName of models) {
    console.log(`\nTesting Model: ${modelName}`);
    try {
      const model = ModelFactory.getModel(modelName);
      const result = await model.analyzeText(testText);
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(`Failed to test ${modelName}:`, e.message);
    }
  }
}

testModels();
