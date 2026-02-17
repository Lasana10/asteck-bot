# 🚀 AsTeck Bot — Master Deployment Guide

This guide contains the final steps to launch your bot in a **24/7 Production Environment**.

## 🏗️ 1. Local Verification (Local PC)
Before uploading to the cloud, ensure your local environment is clean.

1. **Stop active processes**: 
   ```powershell
   Stop-Process -Name node -Force
   ```
2. **Test Docker Build** (Optional, if Docker is installed):
   ```bash
   docker-compose build
   ```

## ☁️ 2. Deploying to Render.com (Recommended)
Render is the easiest way to run this bot for free.

1. **Create GitHub Repo**: 
   - Go to [GitHub](https://github.com) and create a new private repository.
   - Run these commands in your project folder:
     ```bash
     git init
     git add .
     git commit -m "feat: Production launch"
     git remote add origin YOUR_REPO_URL
     git push -u origin main
     ```
2. **Link Blueprint**:
   - Go to [Render Dashboard](https://dashboard.render.com/blueprints).
   - Click **"New Blueprint Instance"**.
   - Select your repository.
3. **Set Secrets**:
   - Render will detect `render.yaml` and ask for your environment variables.
   - Paste your `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, and `SUPABASE_KEY`.
4. **Done**: Your bot and dashboard will be live at the URLs Render provides!

## 🐳 3. Deploying to a VPS (Alternative)
If you have a Linux server (Ubuntu/Debian):

1. **Copy files** to your server.
2. **Run with Docker**:
   ```bash
   docker-compose up -d --build
   ```
3. **Check Status**:
   ```bash
   docker-compose ps
   ```

---
### 🛠️ Maintenance & Troubleshooting
- **Logs**: In Render, click "Logs" to see real-time updates.
- **Health Check**: Visit `https://your-app.onrender.com/health` to verify the bot is alive.
- **Update**: Just `git push` again, and Render will automatically update the bot!

**Mission Status: ARCHITECTURE HARMONY ACHIEVED. READY FOR LAUNCH.** 🚦
