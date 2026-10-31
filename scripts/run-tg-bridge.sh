#!/usr/bin/env bash
# Запуск Telegram-моста под pm2 (процесс terka-tg).
#
# pm2 настроен на /var/www/terka/scripts/run-tg-bridge.sh, но файла в репозитории
# не было — деплой с rsync --delete его однажды снёс. Процесс при этом жил с
# августа и падение вскрылось только при перезапуске. Поэтому файл лежит здесь:
# теперь деплой его не теряет.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx tsx scripts/tg-bridge.ts
