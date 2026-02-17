import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const channelId = process.env.TELEGRAM_CHANNEL_ID;

async function testLink() {
  if (!token || !channelId) {
    console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID');
    return;
  }

  const bot = new Telegraf(token);

  try {
    console.log(`📡 Attempting to send message to ${channelId}...`);
    await bot.telegram.sendMessage(channelId, '🚀 **AsTeck Link Confirmed!**\n\nThe AI has direct access and the system is fully operational. World-Class Traffic Intelligence is now LIVE. 🚦🇨🇲');
    console.log('✅ Success! Check your Telegram channel.');
  } catch (error: any) {
    console.error('❌ Failed to send message:', error.message);
    if (error.message.includes('401')) {
      console.log('💡 Tip: Unauthorized. Check if your BOT_TOKEN is still valid.');
    } else if (error.message.includes('chat not found')) {
      console.log('💡 Tip: Bot might not be an Admin in the channel or the ID is wrong.');
    }
  }
}

testLink();
