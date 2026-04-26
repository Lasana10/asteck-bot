param(
    [Parameter(Mandatory=$true)]
    [string]$Url,
    [string]$WaSecret = "sentinel_wa_secret_2026"
)

$ErrorActionPreference = "Stop"

Write-Host "📡 Activing Sentinel Webhooks for: $Url" -ForegroundColor Cyan

# 1. Telegram Webhook (The Bot Brain)
$TgToken = "$env:TELEGRAM_BOT_TOKEN"
if (-not $TgToken) { 
    $TgToken = Read-Host "Enter your TELEGRAM_BOT_TOKEN"
}

$SecretPath = $TgToken.Replace(":", "_")
$TgUrl = "$Url/webhook/$SecretPath"

Write-Host "🔗 Linking Telegram to: $TgUrl"
$Response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$TgToken/setWebhook?url=$TgUrl" -Method Get

if ($Response.ok) {
    Write-Host "✅ Telegram Webhook Active!" -ForegroundColor Green
} else {
    Write-Warning "❌ Telegram Webhook Failed: $($Response.description)"
}

# 2. WhatsApp Webhook Activation Instructions
Write-Host "`n📱 WhatsApp Webhook Note:" -ForegroundColor Yellow
Write-Host "WhatsApp webhooks must be verified via the Meta Developer Portal."
Write-Host "Use your Verify Token: $WaSecret"
Write-Host "Webhook URL: $Url/api/whatsapp/webhook"

Write-Host "`n✅ Sentinel Grid Synchronization Complete." -ForegroundColor Green
