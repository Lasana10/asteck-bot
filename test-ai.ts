import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function testAI() {
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY missing in .env');
    return;
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  console.log('🔍 Listing available models...');
  try {
    // Note: The SDK might not have a direct listModels, we can try to hit a known model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('Hi');
    console.log('✅ gemini-1.5-flash: OK');
    console.log('Response:', result.response.text());
  } catch (error: any) {
    console.error('❌ gemini-1.5-flash FAILED:', error.message);
    
    console.log('\n🔍 Trying gemini-1.5-flash-002...');
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-002' });
      const result = await model.generateContent('Hi');
      console.log('✅ gemini-1.5-flash-002: OK');
    } catch (e: any) {
      console.error('❌ gemini-1.5-flash-002 FAILED:', e.message);
    }

    console.log('\n🔍 Trying gemini-pro...');
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent('Hi');
      console.log('✅ gemini-pro: OK');
    } catch (e: any) {
      console.error('❌ gemini-pro FAILED:', e.message);
    }
  }
}

testAI();
