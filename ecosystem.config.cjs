/**
 * PM2-конфиг для деплоя.
 *
 * Здесь описан ТОЛЬКО сайт. Боты на сервере запущены отдельно и живут
 * под своими именами:
 *
 *   terka-bot   — «Леший»,  npx tsx scripts/bot.ts      (порт 3001)
 *   rusadovich  — «РуСадович» + Публикатор, /root/run.sh (порт 3002)
 *   terka-tg    — Telegram-мост, /root/run-tg-bridge.sh
 *
 * Раньше в этом файле были ещё записи `leshy` и `rusinov` с теми же
 * командами. Каждый деплой выполняет `pm2 restart ecosystem.config.cjs`
 * и поднимал их как ВТОРЫЕ копии уже работающих ботов. Занять порт они
 * не могли и падали по EADDRINUSE в бесконечном цикле: у `leshy`
 * накопилось 1.37 млн рестартов и 1.6 ГБ логов ошибок.
 *
 * Если боты когда-нибудь понадобятся в этом файле — сначала удалите
 * старые процессы (`pm2 delete terka-bot rusadovich`), иначе дубли
 * вернутся.
 */
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
  ],
}
