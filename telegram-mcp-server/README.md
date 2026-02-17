# Cameroon Traffic Telegram MCP Server

This MCP server integrates Telegram with the Cameroon Traffic Intelligence system, allowing AI agents to send messages, photos, locations, and request confirmations from users. It also features Gemini-powered transcription for voice notes and photo analysis.

## Tools

- `sendMessage`: Send text alerts to users.
- `sendPhoto`: Send traffic snapshots.
- `sendLocation`: Pinpoint traffic events on the map.
- `broadcastToChannel`: Update the public traffic channel.
- `requestConfirmation`: Ask users to verify traffic reports via interactive buttons.

## Features

- **Gemini 1.5 Flash Integration**: Automatically transcribes voice messages and analyzes images sent to the bot.
- **Dual Mode**: Supports local polling for development and webhooks for production (Render/Vercel).
- **Secure**: Uses environment variables for all sensitive keys.

## Setup

1. Clone and install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env` based on `.env.example`.
3. Build the project:
   ```bash
   npx tsc
   ```
4. Run locally:
   ```bash
   node dist/index.js
   ```

## Swarm Usage

Agents can use this MCP server to communicate with the feet on the ground. For example:
- A "Traffic Monitor" agent detects a potential jam from sensor data.
- It calls `requestConfirmation` to ask a user near the location if the road is blocked.
- It then uses `broadcastToChannel` to notify everyone if the block is confirmed.
