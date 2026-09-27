<div align="center">

# Multi Runner

Automation toolkit with **multi-account support** and Telegram control.
Headless, no browser, no cookie handling — just keys in, commands out.

🎣 · 🍳 · 🪓 · ⛏ · ⚔️ · 🏦 · 💰 · 🎡 · 📋 · 🧠

[![Node](https://img.shields.io/badge/node-%3E%3D18-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## What's different here

This build adds a **multi-account layer** on top of a headless runner:

- **One Telegram bot controls many accounts** — broadcast commands to all at once
- **Per-account proxy** (`socks5` / `http`) so each account exits from a different IP
- **Per-account shard** — accounts are spread across servers automatically
- **Zone & shard rotation** — when a resource zone goes dry, the runner moves (zone → next zone → next shard) instead of waiting forever
- **Auto-bank** — resources are deposited when inventory hits the threshold
- **Accurate on-chain token check** — reads **Token-2022** accounts too (a classic-token-only check reports `0` and is wrong)

## Requirements

- Node.js ≥ 18
- Accounts with valid private keys (base58)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Linux VPS recommended for 24/7 uptime

---

## 🚀 VPS Setup (manual, step by step)

### 1. Install base packages

```bash
sudo apt update && sudo apt install -y git nodejs npm screen
node -v    # must be >= 18
```

### 2. Get the code

```bash
cd ~
git clone https://github.com/Hobiknock/multi.git
cd multi
npm install
```

### 3. Create your config

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in:

```ini
# Telegram (from @BotFather)
TELEGRAM_BOT_TOKEN=123456:AAxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=                # optional; auto-detected on your first command

# Accounts — ONE PRIVATE KEY PER LINE, block ends with a blank line
WALLETS=yourFirstBase58Key
yourSecondBase58Key
yourThirdBase58Key

# Servers to rotate across (one per account, cycles)
KINTARA_SERVERS=s1,s2,s3,s4

# Optional: one proxy per line = one per account (strongly recommended)
KINTARA_PROXIES=socks5://127.0.0.1:40000
socks5://127.0.0.1:40001

# Auto-bank threshold
AUTO_BANK_MIN=10000
```

> 🔒 Keys stay on your machine in `.env` (chmod 600, git-ignored). Never commit them.

### 4. Start the controller

```bash
# quick run
npm start

# or keep it alive after logout
screen -S multi node tools/telegram-bot.js
# detach: Ctrl+A then D
```

### 5. (Optional) Run as a systemd service — auto-restart & auto-start on boot

```bash
sudo tee /etc/systemd/system/multi.service > /dev/null <<'EOF'
[Unit]
Description=Multi Runner Telegram Controller
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/multi
ExecStart=/usr/bin/node tools/telegram-bot.js
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now multi
systemctl status multi
```

Useful:

```bash
sudo systemctl restart multi      # restart
journalctl -u multi -f            # live logs
tail -f recon/multi/w1.out        # per-account log
```

### 6. Updating

```bash
cd ~/multi && git pull
sudo systemctl restart multi      # or restart your screen session
```

---

## 📱 Telegram Commands

Open your bot and send `/start`.

### Multi-account (broadcast to all accounts)

| Command | Action |
|---|---|
| `/farm` | ⛏ Start the main activity on **all accounts** (shortcut) |
| `/allmine` | ⛏ All accounts — resource gathering |
| `/allgather` | 🪓 All accounts — wood |
| `/allfish` | 🎣 All accounts — fishing + cooking |
| `/allcombat` | ⚔️ All accounts — combat |
| `/mstatus` | 📊 Status of every account |
| `/kins` | 💰 On-chain token balance for every account (Token-2022 aware) |

### Single account (classic commands)

| Command | Action |
|---|---|
| `/fishing` | 🎣 Fishing + auto-cooking |
| `/gather` | 🪓 Chop wood |
| `/mine` | ⛏ Mine stone + coal + metal |
| `/combat` | ⚔️ Hunt mobs (bank-first, HP watch, auto-retreat) |
| `/auto` | 🧠 Orchestrator picks the activity automatically |
| `/stop` | ⏹️ Stop everything |
| `/status` | 📊 Live status + inventory |
| `/skills` | 📈 Skill levels & XP |
| `/balance` | 💰 Gold / token / resources |
| `/market` | 🛒 Live prices + buy/sell flow *(locked if balance < threshold)* |
| `/spinner` | 🎡 Claim the free daily spin (12h cooldown) |
| `/quest` | 📋 Daily quests |
| `/version` | 🧩 Client version detected |
| `/diag` | 🩺 Auth / queue / tutorial diagnostics |
| `/server` | 🌐 Live server queues + auto-pick (lowest queue) |
| `/help` | ❓ Command list |

> Each account runs **one activity at a time** — that's the safer pattern against automation heuristics.

---

## 🛠️ Extras

**Check token balances from the shell** (no Telegram needed):

```bash
node tools/kins-check.js --env       # every account in .env
node tools/kins-check.js <pk1> <pk2> # specific keys
```

**Run the multi-account runner directly** (without Telegram):

```bash
node tools/multi-runner.js rock      # or: tree | fish | combat | auto
```

Logs land in `recon/multi/w1.out`, `w2.out`, … (one file per account).

## 🩺 Troubleshooting

| Symptom | What to check |
|---|---|
| Bot silent on Telegram | `TELEGRAM_BOT_TOKEN` correct? → `sudo systemctl restart multi` |
| `bootstrap attempt N failed` | Key invalid, or the account isn't registered yet |
| Runner says "zone dry" forever | Expand `KINTARA_SERVERS`, or add proxies — a shard may be empty |
| Balance always `0` in other tools | Use `tools/kins-check.js` — it reads **Token-2022** accounts |
| Marketplace locked | Balance below threshold — that's the built-in safety, not a bug |

## ⚠️ Disclaimer

Automation tools may violate a service's Terms of Service. Use at your own risk — this is an educational / research project.

---

<div align="center"><sub>MIT License</sub></div>
