/**
 * PM2 Ecosystem Configuration — Sentinel Atlas OS
 * Manages the Node.js backend in cluster mode with auto-restart.
 */
module.exports = {
  apps: [
    {
      name: 'sentinel-backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/sentinel-error.log',
      out_file: './logs/sentinel-out.log',
      merge_logs: true,
      // Restart policy
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
