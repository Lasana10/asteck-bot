# 🚀 AFAT Sentinel — Claw.Cloud Launch Automation
$ErrorActionPreference = "Stop"

Write-Host "Initialing Sentinel Atlas Deployment..."

# 1. Validation
Write-Host "Verifying Docker environment..."
docker --version
if ($LASTEXITCODE -ne 0) { throw "Docker is not installed or running." }

# 2. Local Build Test
Write-Host "Running local build verification (sentinel-backend)..."
docker build -t sentinel-backend:production .
if ($LASTEXITCODE -ne 0) { throw "Build failed. Check your Dockerfile." }

Write-Host "Running local build verification (sentinel-dashboard)..."
docker build -t sentinel-dashboard:production ./dashboard
if ($LASTEXITCODE -ne 0) { throw "Build failed. Check your dashboard Dockerfile." }

Write-Host "Local builds successful! Ready."

# 3. Environment Variable Reminder
Write-Host "`nNEXT STEPS: CLAW.CLOUD CONFIGURATION"
Write-Host "------------------------------------------------"
Write-Host "Go to https://claw.cloud and create a new App from your Repository."
Write-Host "Variables: ARKESEL_API_KEY, ARKESEL_SENDER_ID, SESSION_SECRET, TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY, GROQ_API_KEY"

# 4. Webhook Activation Instructions
Write-Host "`nWEBHOOK ACTIVATION"
Write-Host "After deployment, run: ./scripts/activate-webhooks.ps1 -Url 'https://your-domain.com'"
Write-Host "MISSION READY."
