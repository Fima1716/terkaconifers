#!/usr/bin/env bash
# Запуск «РуСадовича» + Публикатора под pm2 (процесс rusadovich, порт 3002).
#
# pm2 настроен на /var/www/terka/rusinovich/run.sh, но файла в репозитории
# не было — 23.10 деплой с rsync --delete его снёс. Процесс ушёл в
# бесконечный рестарт (exit 127), за четыре дня логи pm2 выросли до 19 ГБ,
# диск заполнился, и сайт упал. Поэтому файл лежит здесь.
set -euo pipefail
cd "$(dirname "$0")"
exec npx tsx src/index.ts
