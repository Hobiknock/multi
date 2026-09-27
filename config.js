// ============ CONFIG / ENV LOADER (zero-dependency) ============
// Loads .env into process.env and exposes a typed config object.
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const raw = fs.readFileSync(ENV_PATH, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

function persistEnv(key, value) {
  let raw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  const re = new RegExp('^' + key + '=.*$', 'm');
  if (re.test(raw)) {
    raw = raw.replace(re, `${key}=${value}`);
  } else {
    if (raw.length && !raw.endsWith('\n')) raw += '\n';
    raw += `${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, raw);
  process.env[key] = value;
}

const config = {
  // ---- Auth (Option A: cookie session, manual) ----
  sessionCookie: process.env.KINTARA_SESSION_COOKIE || '', // copy from DevTools after wallet login

  // ---- Auth (Option B: wallet signature, automatic — preferred) ----
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY || '', // base58 Solana secret key, stays on your own machine only
  walletAddress: process.env.WALLET_ADDRESS || '',

  // ---- MULTI-WALLET (patch: dari repo kintara kita — 1 proses N wallet) ----
  // Format .env: WALLETS=pk1\npk2\npk3  (blok multi-line sampai baris kosong/EOF)
  // Kalau WALLETS diisi, walletPrivateKey otomatis diambil dari entri pertama.
  // CATATAN: baris di bawah WALLETS= TIDAK masuk process.env (loader .env per-baris),
  // jadi blok multi-line dibaca LANGSUNG dari file .env di sini.
  wallets: (() => {
    const out = [];
    try {
      const raw = fs.readFileSync(ENV_PATH, 'utf-8');
      const lines = raw.split('\n');
      let collecting = false;
      for (const line of lines) {
        const t = line.trim();
        if (!collecting) {
          if (/^WALLETS\s*=/.test(t)) { collecting = true; const first = t.slice(t.indexOf('=') + 1).trim(); if (first) out.push(first); }
          continue;
        }
        if (!t) break;                                  // baris kosong = akhir blok
        if (/^[A-Za-z0-9_]+=/.test(t)) break;           // key baru = akhir blok
        if (/^[A-Za-z0-9]{80,100}$/.test(t)) out.push(t);
      }
    } catch {}
    // fallback: env WALLETS (single-line, comma-separated juga didukung)
    if (!out.length) {
      const raw = (process.env.WALLETS || '').replace(/,/g, '\n');
      for (const s of raw.split('\n')) { const v = s.trim(); if (/^[A-Za-z0-9]{80,100}$/.test(v)) out.push(v); }
    }
    return out;
  })(),

  playerId: process.env.MY_PLAYER_ID || '', // auto-detected from /api/auth/me when empty

  // ---- API hosts ----
  apiBase: process.env.KINTARA_API_BASE || 'https://kintara.gg',
  fanoutBase: process.env.KINTARA_FANOUT_BASE || 'https://ktra-server-b.onrender.com',
  shard: process.env.KINTARA_SHARD || 's4',

  // ---- Telegram ----
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',

  // ---- Dashboard ----
  dashboardPort: parseInt(process.env.DASHBOARD_PORT || '8898', 10),
  dashUser: process.env.DASH_USER || 'admin',
  dashPass: process.env.DASH_PASS || '',

  // ---- Loop behaviour ----
  pollIntervalSec: parseInt(process.env.POLL_INTERVAL_SEC || '60', 10), // economy loop tick
  reportIntervalMin: parseInt(process.env.REPORT_INTERVAL_MIN || '30', 10),
  notifyProfitOnly: (process.env.NOTIFY_PROFIT_ONLY || 'true').toLowerCase() === 'true',

  // ---- Marketplace flip strategy ----
  flipEnabled: (process.env.FLIP_ENABLED || 'true').toLowerCase() === 'true',
  flipMaxCostGold: parseInt(process.env.FLIP_MAX_COST_GOLD || '1000', 10),
  flipCooldownSec: parseInt(process.env.FLIP_COOLDOWN_SEC || '60', 10),
  flipUnderprice: parseFloat(process.env.FLIP_UNDERPRICE || '0.45'), // beli kalau < 45% harga market
  flipMinProfitGold: parseInt(process.env.FLIP_MIN_PROFIT_GOLD || '50', 10),
  balanceReserveGold: parseInt(process.env.BALANCE_RESERVE_GOLD || '500', 10),
  dailyBuyCapGold: parseInt(process.env.DAILY_BUY_CAP_GOLD || '2000', 10),

  // ---- Auto-sell strategy ----
  autoSellEnabled: (process.env.AUTO_SELL_ENABLED || 'true').toLowerCase() === 'true',
  undercutPct: parseFloat(process.env.UNDERCUT_PCT || '0.08'),

  // ---- Daily quest / casino / world tribute ----
  dailyQuestEnabled: (process.env.DAILY_QUEST_ENABLED || 'true').toLowerCase() === 'true',
  freeSpinnerEnabled: (process.env.FREE_SPINNER_ENABLED || 'true').toLowerCase() === 'true',
  paidSpinnerEnabled: (process.env.PAID_SPINNER_ENABLED || 'false').toLowerCase() === 'true', // pakai $KINS — default off
  blackjackEnabled: (process.env.BLACKJACK_ENABLED || 'false').toLowerCase() === 'true',       // default off, ada risiko gold
  blackjackMaxBet: parseInt(process.env.BLACKJACK_MAX_BET || '50', 10),
  worldTributeEnabled: (process.env.WORLD_TRIBUTE_ENABLED || 'true').toLowerCase() === 'true',
  worldTributeMaxPerTick: {
    wood: parseInt(process.env.TRIBUTE_MAX_WOOD || '500', 10),
    stone: parseInt(process.env.TRIBUTE_MAX_STONE || '500', 10),
    coal: parseInt(process.env.TRIBUTE_MAX_COAL || '300', 10),
  },

  // ---- Bank ----
  bankAutoDeposit: (process.env.BANK_AUTO_DEPOSIT || 'false').toLowerCase() === 'true',
  bankKeepGold: parseInt(process.env.BANK_KEEP_GOLD || '200', 10), // sisa gold di tangan, lebihnya disetor

  // ---- Combat supplies ----
  combatMinGold: parseInt(process.env.COMBAT_MIN_GOLD || '20', 10), // jangan belanja potion kalau bikin gold turun di bawah ini
  combatMinHealthPotions: parseInt(process.env.COMBAT_MIN_HEALTH_POTIONS || '6', 10),
  combatMinShieldPotions: parseInt(process.env.COMBAT_MIN_SHIELD_POTIONS || '2', 10),

  // ---- Core-loop FABRICATION (client-authoritative). RISIKO: langgar ToS / anti-cheat. ----
  // Master kill-switch: SEMUA aksi fabricated mati kalau ini false.
  fabricateEnabled: (process.env.FABRICATE_ENABLED || 'false').toLowerCase() === 'true',

  // Auto-gather (naikkan resource + skill XP via save-backpack/save-skills).
  gatherEnabled: (process.env.GATHER_ENABLED || 'false').toLowerCase() === 'true',
  gatherSkill: process.env.GATHER_SKILL || 'woodcutting', // woodcutting|mining_stone|mining_coal|mining_metal|fishing
  gatherRatePerMin: parseFloat(process.env.GATHER_RATE_PER_MIN || '15'),  // unit/menit (laju manusiawi)
  gatherPerTickCap: parseInt(process.env.GATHER_PER_TICK_CAP || '30', 10), // batas keras per tick
  gatherJitter: parseFloat(process.env.GATHER_JITTER || '0.3'),            // 0..1, variasi acak
  gatherDailyCapDefault: parseInt(process.env.GATHER_DAILY_CAP || '5000', 10),
  gatherDailyCap: {
    wood: parseInt(process.env.GATHER_DAILY_CAP_WOOD || '5000', 10),
    stone: parseInt(process.env.GATHER_DAILY_CAP_STONE || '5000', 10),
    coal: parseInt(process.env.GATHER_DAILY_CAP_COAL || '3000', 10),
    metal: parseInt(process.env.GATHER_DAILY_CAP_METAL || '2000', 10),
    fish: parseInt(process.env.GATHER_DAILY_CAP_FISH || '3000', 10),
  },

  // Auto-loot ground bags (jalur server asli, bukan fabrikasi — tetap default off).
  autolootEnabled: (process.env.AUTOLOOT_ENABLED || 'false').toLowerCase() === 'true',
  autolootShard: parseInt(process.env.AUTOLOOT_SHARD || '1', 10),

  // Movement target (save-spawn). col/row -1 = nonaktif.
  moveRealm: process.env.MOVE_REALM || 'world',
  moveCol: parseInt(process.env.MOVE_COL || '-1', 10),
  moveRow: parseInt(process.env.MOVE_ROW || '-1', 10),

  logPath: process.env.LOG_PATH || '/tmp/kintara_bot.log',
};

// Patch multi-wallet & proxy: kalau WALLETS diisi, pakai entri pertama sebagai default,
// dan sediakan helper buat bikin client per-wallet (dipakai runner multi-akun).
if (config.wallets.length && !config.walletPrivateKey) config.walletPrivateKey = config.wallets[0];
config.walletPrivateKeyFor = (i) => config.wallets[i] || config.walletPrivateKey;
config.proxyFor = (i) => {
  const out = [];
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    const lines = raw.split('\n');
    let collecting = false;
    for (const line of lines) {
      const t = line.trim();
      if (!collecting) { if (/^KINTARA_PROXIES\s*=/.test(t)) { collecting = true; const first = t.slice(t.indexOf('=') + 1).trim(); if (first) out.push(first); } continue; }
      if (!t) break;
      if (/^[A-Za-z0-9_]+=/.test(t)) break;
      if (/^(socks5|socks4|http|https):\/\//.test(t)) out.push(t);
    }
  } catch {}
  if (!out.length) return process.env.KINTARA_PROXY || '';
  return out[i % out.length] || '';
};

module.exports = { config, persistEnv };
