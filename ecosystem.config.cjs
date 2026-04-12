module.exports = {
  apps: [{
    name: 'terka',
    script: '.output/server/index.mjs',
    cwd: '/var/www/terka',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      NITRO_PORT: 3000,
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    Что еmerge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
}
