import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Telegraf, Context } from "telegraf";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import express from "express";
import axios from "axios";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY!;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

if (!API_KEY || !BOT_TOKEN) {
  console.error("Missing GEMINI_API_KEY or TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(API_KEY);
const app = express();

class TelegramMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "telegram-traffic-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "sendMessage",
          description: "Send a text message to a user or chat ID.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "string", description: "The Telegram chat ID or username." },
              text: { type: "string", description: "The message content." },
              parseMode: { type: "string", enum: ["HTML", "MarkdownV2"], default: "HTML" },
            },
            required: ["chatId", "text"],
          },
        },
        {
          name: "sendPhoto",
          description: "Send a photo with a caption to a chat ID.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "string" },
              photoUrl: { type: "string", description: "URL of the photo to send." },
              caption: { type: "string" },
            },
            required: ["chatId", "photoUrl"],
          },
        },
        {
          name: "sendLocation",
          description: "Send a location (latitude/longitude) to a chat ID.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "string" },
              latitude: { type: "number" },
              longitude: { type: "number" },
            },
            required: ["chatId", "latitude", "longitude"],
          },
        },
        {
          name: "broadcastToChannel",
          description: "Post a traffic update to a specific channel.",
          inputSchema: {
            type: "object",
            properties: {
              channelId: { type: "string", description: "Channel username (e.g., @camer_traffic)." },
              text: { type: "string" },
            },
            required: ["channelId", "text"],
          },
        },
        {
          name: "requestConfirmation",
          description: "Send a message with Yes/No buttons to confirm a traffic report.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "string" },
              text: { type: "string", description: "The confirmation question." },
            },
            required: ["chatId", "text"],
          },
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "sendMessage":
            await bot.telegram.sendMessage(args?.chatId as string, args?.text as string, {
              parse_mode: (args?.parseMode as any) || "HTML",
            });
            return { content: [{ type: "text", text: "Message sent successfully." }] };

          case "sendPhoto":
            await bot.telegram.sendPhoto(args?.chatId as string, args?.photoUrl as string, {
              caption: args?.caption as string,
            });
            return { content: [{ type: "text", text: "Photo sent successfully." }] };

          case "sendLocation":
            await bot.telegram.sendLocation(args?.chatId as string, args?.latitude as number, args?.longitude as number);
            return { content: [{ type: "text", text: "Location sent successfully." }] };

          case "broadcastToChannel":
            await bot.telegram.sendMessage(args?.channelId as string, args?.text as string);
            return { content: [{ type: "text", text: "Broadcast sent successfully." }] };

          case "requestConfirmation":
            await bot.telegram.sendMessage(args?.chatId as string, args?.text as string, {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Confirmed", callback_data: "confirm_yes" },
                    { text: "❌ False Alarm", callback_data: "confirm_no" },
                  ],
                ],
              },
            });
            return { content: [{ type: "text", text: "Confirmation request sent." }] };

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("Telegram Traffic MCP server running on stdio");
  }
}

// Handle Bot Events & Voice/Photo Transcription
bot.on("voice", async (ctx) => {
  try {
    const fileId = ctx.message.voice.file_id;
    const link = await ctx.telegram.getFileLink(fileId);
    
    // Download and transcribe via Gemini
    const response = await axios.get(link.href, { responseType: "arraybuffer" });
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent([
      "Transcribe this traffic report in French or English. Output only the plain text.",
      {
        inlineData: {
          data: Buffer.from(response.data).toString("base64"),
          mimeType: "audio/ogg",
        },
      },
    ]);

    await ctx.reply(`🎙️ Transcribed Report: ${result.response.text()}`);
  } catch (error) {
    console.error("Voice transcription error:", error);
    await ctx.reply("Failed to transcribe voice message.");
  }
});

bot.on("photo", async (ctx) => {
    try {
      const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const link = await ctx.telegram.getFileLink(fileId);
      
      const response = await axios.get(link.href, { responseType: "arraybuffer" });
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const result = await model.generateContent([
        "Analyze this image for traffic conditions in Cameroon. Identify road blocks, accidents, or congestion. Be specific.",
        {
          inlineData: {
            data: Buffer.from(response.data).toString("base64"),
            mimeType: "image/jpeg",
          },
        },
      ]);
  
      await ctx.reply(`📸 Image Analysis: ${result.response.text()}`);
    } catch (error) {
      console.error("Photo analysis error:", error);
      await ctx.reply("Failed to analyze photo.");
    }
});

// Deployment logic (Webhook vs Polling)
if (process.env.NODE_ENV === "production" && WEBHOOK_URL) {
    app.use(express.json());
    app.use(bot.webhookCallback("/webhook"));
    bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`);
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT} (Webhook mode)`);
    });
} else {
    bot.launch();
    console.log("Bot launched in polling mode");
}

const server = new TelegramMcpServer();
server.run().catch(console.error);

// Enable graceful stop
process.once("SIGINT", () => {
    bot.stop("SIGINT");
    process.exit(0);
});
process.once("SIGTERM", () => {
    bot.stop("SIGTERM");
    process.exit(0);
});
