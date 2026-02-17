# Deployment Guide - Telegram MCP Server

## Deploying to Render (Free Tier)

1. **Create a Web Service**:
   - Connect your GitHub repository.
   - Runtime: `Node`
   - Build Command: `npm install && npx tsc`
   - Start Command: `node dist/index.js`
   - Tier: `Free`

2. **Environment Variables**:
   Set the following in the Render dashboard:
   - `TELEGRAM_BOT_TOKEN`: Your bot token from @BotFather.
   - `GEMINI_API_KEY`: Your Google AI Studio API Key.
   - `WEBHOOK_URL`: Your Render app URL (e.g., `https://traffic-mcp.onrender.com`).
   - `NODE_ENV`: `production`

3. **Webhook Setup**:
   The server will automatically call `setWebhook` on startup when `WEBHOOK_URL` is provided.

## Deploying to Vercel

1. Install Vercel CLI: `npm i -g vercel`.
2. run `vercel`.
3. Configure environment variables in Vercel Dashboard.
4. Note: Vercel functions have timeout limits (10s on free tier). Gemini analysis might exceed this. Render is recommended for better performance with long-running bot processes.

## Error Handling & Monitoring

- Logs are printed to `stdout` for easy monitoring in Render logs.
- The server includes `SIGINT`/`SIGTERM` handlers for graceful shutdowns.
