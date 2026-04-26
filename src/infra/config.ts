/**
 * CENTRAL INFRASTRUCTURE CONFIGURATION
 * This file centralizes all backend links, supporting tools, and scaling endpoints.
 */

export const INFRA_CONFIG = {
  // --- CORE DATABASE ---
  supabase: {
    url: process.env.SUPABASE_URL,
    projectRef: 'rkijcxxryhfrqsgkwtbu', // From URL
    dashboard: 'https://supabase.com/dashboard/project/rkijcxxryhfrqsgkwtbu'
  },

  // --- PASSIVE DATA & GPS ---
  traccar: {
    url: process.env.TRACCAR_URL || 'http://localhost:8082',
    dashboard: (process.env.TRACCAR_URL || 'http://localhost:8082').replace('/api', ''),
    webhookSecret: process.env.TRACCAR_SECRET_WEBHOOK || 'asteck_gps_sync_2026'
  },

  // --- AUTOMATION & GLUE ---
  n8n: {
    url: process.env.N8N_URL || 'https://n8n.asteck.mobility',
    purpose: 'Telegram/WhatsApp Webhook Orchestration & Evening Summaries'
  },

  // --- ANALYTICS & MONITORING ---
  grafana: {
    url: process.env.GRAFANA_URL || 'https://grafana.asteck.mobility',
    dashboards: {
      urban_mobility: '/d/mobility-intelligence',
      operator_performance: '/d/operators',
      system_health: '/d/backend-status'
    }
  },

  // --- ACCESSIBILITY CHANNELS ---
  whatsapp: {
    provider: 'Twilio / 360dialog',
    webhook: '/api/whatsapp/webhook'
  },
  
  telegram: {
    botUsername: '@AsteckTraBot',
    channel: '@Astecktra'
  },

  // --- FINANCIALS ---
  payments: {
    primary: 'PawaPay',
    fallback: "Africa's Talking",
    commissionRate: 0.08 // 8% Platform Fee
  }
};
