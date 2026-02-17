import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
  if (!API_KEY) {
    console.error('❌ Missing API KEY');
    return;
  }

  const versions = ['v1', 'v1beta'];
  
  for (const v of versions) {
    console.log(`\n🔍 Checking API Version: ${v}`);
    try {
      const response = await axios.get(`https://generativelanguage.googleapis.com/${v}/models?key=${API_KEY}`);
      console.log(`✅ ${v} Success!`);
      const models = response.data.models || [];
      console.log(`📋 Available Models (${models.length}):`);
      models.forEach((m: any) => console.log(`   - ${m.name} (${m.displayName})`));
    } catch (error: any) {
      console.error(`❌ ${v} Failed:`, error.response?.status, error.response?.statusText);
      if (error.response?.data) {
        console.error('   Details:', JSON.stringify(error.response.data));
      }
    }
  }
}

listModels();
