// PM2 process definition for production. Cluster mode uses all CPU cores.
module.exports = {
  apps: [
    {
      name: 'school-erp-api',
      script: 'src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env: { NODE_ENV: 'development' },
      env_production: { NODE_ENV: 'production' },
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
