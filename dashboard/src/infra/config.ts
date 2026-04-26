/**
 * CENTRAL INFRASTRUCTURE CONFIGURATION (Frontend)
 * Synchronized with src/infra/config.ts
 */

export const INFRA_CONFIG = {
  supabase: {
    dashboard: 'https://supabase.com/dashboard/project/rkijcxxryhfrqsgkwtbu'
  },
  traccar: {
    dashboard: 'http://localhost:8082' // Replace with production URL
  },
  n8n: {
    url: 'https://n8n.asteck.mobility'
  },
  grafana: {
    url: 'https://grafana.asteck.mobility',
    dashboards: {
      urban_mobility: '/d/mobility-intelligence',
      operator_performance: '/d/operators',
      system_health: '/d/backend-status'
    }
  }
};
