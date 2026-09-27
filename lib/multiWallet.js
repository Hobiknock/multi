// ============ MULTI-WALLET MANAGER (patch) ============
// 1 bot Telegram → kontrol SEMUA wallet di WALLETS= (bukan cuma 1 akun).
// Tiap wallet = 1 child process (gather-bot / bot-headless / combat-bot), beda shard & proxy.
// Command broadcast: /mine /gather /fishing /combat /auto /stop nembak ke semua wallet.
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { config } = require('../config');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'recon');
const CTRL = path.join(OUT, 'control');
const MULTI = path.join(OUT, 'multi');
const STATE = path.join(MULTI, 'multi-state.json');
fs.mkdirSync(CTRL, { recursive: true });
fs.mkdirSync(MULTI, { recursive: true });

const SCRIPT = {
  tree: 'gather-bot.js', rock: 'gather-bot.js',
  fish: 'bot-headless.js', combat: 'combat-bot.js', auto: 'orchestrator.js',
};

function wallets() {
  return config.wallets.length ? config.wallets : (config.walletPrivateKey ? [config.walletPrivateKey] : []);
}
function shards() {
  return (process.env.KINTARA_SERVERS || 's1,s2,s3,s4').split(',').map(s => s.trim()).filter(Boolean);
}
function proxies() {
  const list = [];
  for (let i = 0; i < 64; i++) { const p = config.proxyFor(i); if (!p || list.includes(p)) break; list.push(p); }
  return list;
}
function pidOf(file) {
  try { const p = JSON.parse(fs.readFileSync(file, 'utf8')); if (p?.pid) { process.kill(p.pid, 0); return p.pid; } } catch {}
  try { fs.unlinkSync(file); } catch {}
  return null;
}
function tagPidfile(i) { return path.join(MULTI, `w${i + 1}.pid`); }
function tagOut(i) { return path.join(MULTI, `w${i + 1}.out`); }

/** Jalankan 1 mode ke SEMUA wallet. @returns {string} ringkasan */
function startAll(mode) {
  const pks = wallets();
  if (!pks.length) return '⚠️ Tidak ada wallet. Isi WALLETS= di .env (1 pk per baris).';
  const SH = shards(), PX = proxies();
  const script = SCRIPT[mode] || 'gather-bot.js';
  const lines = [];
  pks.forEach((pk, i) => {
    const old = pidOf(tagPidfile(i));
    if (old) { try { process.kill(old, 'SIGTERM'); } catch {} }
    const shard = SH[i % SH.length];
    const proxy = PX.length ? PX[i % PX.length] : (process.env.KINTARA_PROXY || '');
    const env = { ...process.env, WALLET_PRIVATE_KEY: pk, KINTARA_PROXY: proxy, KINTARA_SERVERS: SH.join(',') };
    const out = fs.openSync(tagOut(i), 'a');
    const args = [path.join(ROOT, 'tools', script)];
    if (script === 'gather-bot.js') args.push(mode === 'rock' ? 'rock' : 'tree', shard);
    else args.push(shard);
    const child = cp.spawn(process.execPath, args, { env, cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
    child.unref();
    fs.writeFileSync(tagPidfile(i), JSON.stringify({ pid: child.pid, mode, shard, proxy: proxy || '-', started: Date.now() }));
    lines.push(`w${i + 1} → ${mode} @${shard}${proxy ? ' proxy✓' : ''} (pid ${child.pid})`);
  });
  fs.writeFileSync(STATE, JSON.stringify({ mode, started: Date.now(), count: pks.length }, null, 2));
  return `▶️ <b>${mode.toUpperCase()} untuk ${pks.length} wallet</b>\n` + lines.join('\n') + `\n\n<i>Cek /status beberapa menit lagi (ada antrian server).</i>`;
}

/** Stop semua child wallet. */
function stopAll() {
  const pks = wallets();
  const msg = [];
  for (let i = 0; i < Math.max(pks.length, 0); i++) {
    const pid = pidOf(tagPidfile(i));
    if (pid) { try { process.kill(pid, 'SIGTERM'); } catch {} msg.push(`🛑 w${i + 1} STOP (pid ${pid})`); }
  }
  // bersihkan sisa proses tool yang nyasar
  try {
    const rows = cp.execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split('\n');
    for (const row of rows) {
      if (!/tools\/(gather-bot|bot-headless|combat-bot|orchestrator)\.js/.test(row)) continue;
      const pid = Number((row.trim().match(/^(\d+)/) || [])[1]);
      if (pid && pid !== process.pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    }
  } catch {}
  return msg.length ? msg.join('\n') : '🔴 Semua wallet sudah OFF.';
}

/** Status ringkas semua wallet (broadcast). */
function statusAll() {
  const pks = wallets();
  if (!pks.length) return '⚠️ Tidak ada wallet terdaftar.';
  const lines = [`📊 <b>STATUS — ${pks.length} WALLET</b>`, ''];
  for (let i = 0; i < pks.length; i++) {
    const f = tagPidfile(i);
    let info = null;
    try { info = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
    const alive = pidOf(f);
    if (alive && info) {
      const ageMin = Math.round((Date.now() - (info.started || Date.now())) / 60000);
      lines.push(`▸ <b>w${i + 1}</b> — ${String(info.mode).toUpperCase()} @${info.shard} ${info.proxy && info.proxy !== '-' ? '🌐' : ''} — ${ageMin}m (pid ${alive})`);
    } else {
      lines.push(`▸ <b>w${i + 1}</b> — ⭕ mati`);
    }
  }
  return lines.join('\n');
}

module.exports = { startAll, stopAll, statusAll, wallets, tagPidfile, tagOut, MULTI, STATE };
