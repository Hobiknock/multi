#!/usr/bin/env bash
# auto-1to1.sh — Installer 1 akun (1/1): clone, npm install, tulis .env SATU wallet, start bot
# - clone repo, install deps
# - tanya 2 input: WALLET_PRIVATE_KEY + TELEGRAM_BOT_TOKEN
# Pakai: bash auto-1to1.sh   (atau non-interaktif via env, lihat bawah)
set -e

REPO_URL="${REPO_URL:-https://github.com/Hobiknock/multi.git}"
DIR="${INSTALL_DIR:-$HOME/multi-1to1}"

echo "=============================================="
echo "  Multi Runner — installer SINGLE ACCOUNT"
echo "=============================================="

# ---- non-interaktif: env sudah diisi? ----
PK_IN="${WALLET_PRIVATE_KEY:-}"
TG_IN="${TELEGRAM_BOT_TOKEN:-}"

# ---- 0. dependencies dasar ----
if ! command -v node >/dev/null 2>&1; then
  echo "[*] Node.js tidak ada — mencoba install..."
  if command -v apt >/dev/null 2>&1; then sudo apt update && sudo apt install -y nodejs npm git
  elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y nodejs npm git
  else echo "Install Node.js >= 18 manual: https://nodejs.org"; exit 1; fi
fi
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then echo "⚠️ Node.js $(node -v) < 18 — upgrade dulu."; exit 1; fi

# ---- 1. source code ----
if [ -d "$DIR/.git" ]; then
  echo "[*] Folder $DIR sudah ada — git pull..."
  git -C "$DIR" pull --ff-only || true
else
  echo "[*] Clone repo ke $DIR ..."
  git clone "$REPO_URL" "$DIR"
fi
cd "$DIR"

# ---- 2. deps ----
echo "[*] npm install ..."
npm install --no-audit --no-fund

# ---- 3. input ----
if [ -z "$PK_IN" ]; then
  printf "Masukkan WALLET_PRIVATE_KEY (base58): "
  read -r PK_IN
fi
if [ -z "$TG_IN" ]; then
  printf "Masukkan TELEGRAM_BOT_TOKEN (dari @BotFather): "
  read -r TG_IN
fi
if [ -z "$PK_IN" ] || [ -z "$TG_IN" ]; then echo "❌ Private key & token wajib diisi."; exit 1; fi

# ---- 4. tulis .env (SINGLE wallet — tanpa WALLETS) ----
umask 077
cat > .env <<EOF
# Single-account config
WALLET_PRIVATE_KEY=$PK_IN
TELEGRAM_BOT_TOKEN=$TG_IN
TELEGRAM_CHAT_ID=

KINTARA_SERVERS=s1,s2,s3,s4
KINTARA_PROXY=
KINTARA_PROXIES=

AUTO_BANK_MIN=10000
KINS_MINT=Tqj8yFmagrg7oorpQkVGYR52r96RFTamvWfth9bpump
SOLANA_RPC=https://api.mainnet-beta.solana.com
EOF
chmod 600 .env
echo "[✓] .env ditulis (chmod 600, single wallet)"

# ---- nama service: multi-1to1 (1 akun / 1 server) ----
SVC="multi-1to1"
echo "[*] Service name: $SVC"

# ---- 5. cek cepat ----
echo "[*] Verifikasi sintaks..."
node --check tools/telegram-bot.js
echo "[✓] OK"

# ---- 6. start ----
if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = "0" -o -w /etc/systemd/system ]; then
  SVC="multi-1to1"
  cat > /etc/systemd/system/$SVC.service <<EOF2
[Unit]
Description=Multi Runner (1 akun / 1 server)
After=network.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$(command -v node) tools/telegram-bot.js
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
EOF2
  systemctl daemon-reload
  systemctl enable --now "$SVC"
  echo "[✓] Service aktif: systemctl status $SVC | journalctl -u $SVC -f"
else
  echo "[*] systemd tidak tersedia — start manual:"
  echo "    cd $DIR && npm start"
  nohup node tools/telegram-bot.js > /tmp/multi-1to1.log 2>&1 &
  echo "[✓] Bot dijalankan di background (log: /tmp/multi-1to1.log)"
fi

echo ""
echo "=============================================="
echo "  SELESAI ✅  Buka bot Telegram kamu, kirim /start lalu /help"
echo "  1 akun = 1 aktivitas. Command multi (/farm dll) tidak dipakai di mode ini."
echo "=============================================="
