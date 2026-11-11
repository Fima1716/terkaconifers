#!/usr/bin/env bash
# Сторож сайта: cron root раз в 5 минут.
#
#   */5 * * * * /var/www/terka/scripts/healthcheck.sh
#
# В октябре 2026 у «РуСадовича» пропал run.sh, pm2 перезапускал его по кругу,
# логи за четыре дня съели весь диск — и сайт двое суток лежал, а узнали об
# этом от посетителей. Сторож проверяет диск, процессы pm2, каталог, сайт,
# сертификат и ночной синк. Что может — чинит сам; о проблеме пишет в
# админский чат MAX («Корзина Терки»), а когда она проходит — что всё в порядке.
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PM2_HOME=/root/.pm2

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE=/var/lib/terka-health
LOG="$ROOT/logs/health.log"
mkdir -p "$STATE" "$ROOT/logs"

env_get() { grep -E "^$1=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\r\"'"; }
MAX_TOKEN=$(env_get MAX_BOT_TOKEN)
ADMIN_CHAT=$(env_get ADMIN_CHAT_ID)
ADMIN_CHAT=${ADMIN_CHAT:--72548188058297}

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

send() {
  [ -n "$MAX_TOKEN" ] || return 0
  local body
  body=$(python3 -c 'import json, sys; print(json.dumps({"text": sys.argv[1]}))' "$1")
  curl -s -m 15 -X POST "https://platform-api.max.ru/messages?chat_id=$ADMIN_CHAT" \
    -H "Authorization: $MAX_TOKEN" -H 'Content-Type: application/json' --data "$body" >/dev/null || true
}

# Длящаяся проблема: пишем сразу и потом не чаще раза в 6 часов
alert() {
  local key=$1 f="$STATE/$1"; shift
  log "ПРОБЛЕМА [$key] $*"
  if [ -f "$f" ] && [ $(( $(date +%s) - $(stat -c %Y "$f") )) -lt 21600 ]; then return; fi
  touch "$f"
  send "⚠️ terkaconifers.ru: $*"
}

# Проблема ушла — сообщаем один раз
resolved() {
  local key=$1 f="$STATE/$1"; shift
  [ -f "$f" ] || return 0
  rm -f "$f"
  log "ИСПРАВЛЕНО [$key] $*"
  send "✅ terkaconifers.ru: $*"
}

# Сторож уже починил сам — просто сообщаем
notify() {
  log "ПОЧИНЕНО $*"
  send "🔧 terkaconifers.ru: $*"
}

disk_used() { df --output=pcent / | tail -1 | tr -dc 0-9; }

# ── 1. Диск ──────────────────────────────────────────────────────
used=$(disk_used)
if [ "$used" -ge 85 ]; then
  # Обычные виновники — разросшиеся логи и журнал systemd
  find "$PM2_HOME" "$ROOT/logs" "$ROOT/rusinovich/logs" -name '*.log' -size +200M -exec truncate -s 0 {} + 2>/dev/null
  journalctl --vacuum-size=200M >/dev/null 2>&1
  alert disk "диск заполнен на ${used}%. Почистил большие логи — стало $(disk_used)%. Если не помогло, место занято чем-то другим."
elif [ "$used" -lt 80 ]; then
  resolved disk "диск снова в норме (${used}%)"
fi

# ── 2. Процессы pm2 ──────────────────────────────────────────────
procs=$(pm2 jlist 2>/dev/null)
if ! echo "$procs" | python3 -c 'import json, sys; sys.exit(0 if json.load(sys.stdin) else 1)' 2>/dev/null; then
  # Демон pm2 поднялся пустым (так было 29.10) — возвращаем сохранённый список
  pm2 resurrect >/dev/null 2>&1
  sleep 20
  procs=$(pm2 jlist 2>/dev/null)
  notify "pm2 оказался без процессов — поднял их из сохранённого списка (pm2 resurrect)"
fi

# name status «сколько рестартов с прошлой проверки»
echo "$procs" | python3 -c '
import json, sys
path = sys.argv[1]
try:
    prev = json.load(open(path))
except Exception:
    prev = {}
cur = {}
for p in json.load(sys.stdin):
    env = p["pm2_env"]
    n = env.get("restart_time", 0)
    cur[p["name"]] = n
    print(p["name"], env.get("status"), max(0, n - prev.get(p["name"], n)))
json.dump(cur, open(path, "w"))
' "$STATE/restarts.json" 2>/dev/null | while read -r name status delta; do
  if [ "$status" = errored ]; then
    alert "proc-$name" "процесс $name упал и не поднимается. Смотреть: pm2 logs $name"
  elif [ "$delta" -ge 10 ]; then
    alert "proc-$name" "процесс $name перезапустился $delta раз за 5 минут — падает по кругу. Смотреть: pm2 logs $name"
  elif [ "$status" = online ]; then
    resolved "proc-$name" "процесс $name снова работает"
  fi
done

# ── 3. Каталог и сайт ────────────────────────────────────────────
# Витрина public/data/catalog-enriched.json пропала (29.10 её обнулил синк
# при полном диске), а исходник в data/ цел — возвращаем его на место
pub="$ROOT/public/data/catalog-enriched.json"
src="$ROOT/data/catalog-enriched.json"
if [ "$(stat -c %s "$pub" 2>/dev/null || echo 0)" -lt 100000 ] \
   && python3 -c 'import json, sys; sys.exit(0 if len(json.load(open(sys.argv[1]))) > 100 else 1)' "$src" 2>/dev/null; then
  cp "$src" "$pub.tmp" && mv "$pub.tmp" "$pub" && notify "витрина каталога (public/data) пропала — восстановил её из data/"
fi

check_api() { curl -s -m 20 -o /dev/null -w '%{http_code} %{size_download}' http://127.0.0.1:3000/api/catalog; }
read -r code size <<< "$(check_api)"
if [ "$code" != 200 ] || [ "${size%.*}" -lt 100000 ]; then
  pm2 restart terka >/dev/null 2>&1
  sleep 20
  read -r code2 size2 <<< "$(check_api)"
  if [ "$code2" = 200 ] && [ "${size2%.*}" -ge 100000 ]; then
    notify "сайт не отдавал каталог (код $code) — перезапустил terka, заработал"
  else
    alert site "сайт не отдаёт каталог даже после перезапуска (код $code2, ${size2%.*} байт). Смотреть: pm2 logs terka"
  fi
else
  resolved site "сайт снова отдаёт каталог"
fi

# Снаружи, через nginx и https
code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' --resolve terkaconifers.ru:443:127.0.0.1 https://terkaconifers.ru/)
if [ "$code" != 200 ]; then
  alert https "главная через nginx отвечает кодом $code. Смотреть: systemctl status nginx"
else
  resolved https "главная через nginx снова открывается"
fi

# Сертификат: certbot продлевает сам, но если сломается — узнаем за две недели
end=$(echo | openssl s_client -connect 127.0.0.1:443 -servername terkaconifers.ru 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$end" ]; then
  days=$(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
  if [ "$days" -lt 14 ]; then
    alert cert "сертификат https истекает через $days дн. Смотреть: certbot renew --dry-run"
  else
    resolved cert "сертификат продлён (ещё $days дн.)"
  fi
fi

# ── 4. Ночной синк ───────────────────────────────────────────────
sync_log="$ROOT/logs/sync.log"
if [ -f "$sync_log" ]; then
  age_h=$(( ($(date +%s) - $(stat -c %Y "$sync_log")) / 3600 ))
  # Последний прогон — от последней строки «Nightly sync started» до конца
  last_run=$(tac "$sync_log" | sed '/Nightly sync started/q' | tac)
  if [ "$age_h" -ge 26 ]; then
    alert sync "ночной синк не запускался больше суток (logs/sync.log не менялся ${age_h} ч)"
  elif echo "$last_run" | grep -q -E '❌ Fatal error|ENOSPC'; then
    alert sync "ночной синк упал: $(echo "$last_run" | grep -m1 -E '❌ Fatal error|ENOSPC' | cut -c1-200)"
  else
    resolved sync "ночной синк снова проходит"
  fi
fi

# ── 5. Сайт курса school.rusinovsad.ru ───────────────────────────
# Живёт на этой же машине своим systemd-юнитом school и своей базой в
# PostgreSQL. /api/health отвечает ok:true, только если база доступна.
if systemctl list-unit-files school.service >/dev/null 2>&1; then
  school_ok() { curl -s -m 15 http://127.0.0.1:3010/api/health | grep -q '"ok":true'; }
  if ! school_ok; then
    systemctl is-active -q postgresql || systemctl restart postgresql
    systemctl restart school
    sleep 15
    if school_ok; then
      notify "сайт курса school.rusinovsad.ru не отвечал — перезапустил, заработал"
    else
      alert school "сайт курса school.rusinovsad.ru не отвечает даже после перезапуска. Смотреть: journalctl -u school -n 50"
    fi
  else
    resolved school "сайт курса school.rusinovsad.ru снова отвечает"
  fi
fi

exit 0
