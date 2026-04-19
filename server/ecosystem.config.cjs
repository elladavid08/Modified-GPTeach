/**
 * PM2 ecosystem configuration for the GPTeach backend.
 *
 * Usage:
 *   Start:   pm2 start ecosystem.config.cjs
 *   Stop:    pm2 stop gpteach-backend
 *   Restart: pm2 restart gpteach-backend
 *   Logs:    pm2 logs gpteach-backend
 *   Status:  pm2 status
 *   Monitor: pm2 monit
 *
 * Auto-start on system boot (run once per machine):
 *   pm2 startup   <- follow the printed instruction
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'gpteach-backend',
      script: 'server.js',

      // Restart if the process consumes too much memory
      max_memory_restart: '500M',

      // Exponential back-off between crash restarts (100 ms → up to 16 s)
      exp_backoff_restart_delay: 100,

      // Wait 3 s before restarting after a crash
      restart_delay: 3000,

      // Give up after 10 consecutive crashes (prevents tight restart loops)
      max_restarts: 10,

      // Keep stdout/stderr logs; PM2 rotates them automatically
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Watch mode is OFF in production to avoid restarting on every file change
      watch: false,

      // Environment variables for production
      env_production: {
        NODE_ENV: 'production',
      },

      // Environment variables for development (default)
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
