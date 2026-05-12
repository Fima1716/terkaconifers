module.exports = {
  apps: [
    {
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
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'leshy',
      script: 'npx',
      args: 'tsx scripts/bot.ts',
      cwd: '/var/www/terka',
      error_file: './logs/leshy-error.log',
      out_file: './logs/leshy-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'rusinov',
      script: 'npx',
      args: 'tsx src/index.ts',
      cwd: '/var/www/terka/rusinovich',
      error_file: './logs/rusinov-error.log',
      out_file: './logs/rusinov-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
