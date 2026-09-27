#!/usr/bin/env node
// multi-runner.js — PATCH: jalankan N wallet paralel (1 screen/1 proses per wallet),
// tiap wallet bisa beda proxy (KINTARA_PROXIES, 1 per baris).
// Dipakai: node tools/multi-runner.js <mode>   mode: tree|rock|fish|combat|auto
// Tiap wallet jalan sebagai child process tools/gather-bot.js (atau bot-headless/combat-bot).
const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const { config } = require('../config');

const MODE = process.argv[2] || 'rock';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'recon', 'multi');
fs.mkdirSync(OUT, { recursive: true });

const SCRIPT = {
  tree: 'tools/gather-bot.js',
  rock: 'tools/gather-bot.js',
  fish: 'tools/bot-headless.js',
  combat: 'tools/combat-bot.js',
  auto: 'tools/orchestrator.js',
}[MODE] || 'tools/gather-bot.js';

const SHARDS = (process.env.KINTARA_SERVERS || 's1,s2,s3,s4').split(',').map(s => s.trim()).filter(Boolean);
const PROXIES = (() => {
  const list = [];
  for (let i = 0; i < 64; i++) { const p = config.proxyFor(i); if (!p || list.includes(p)) break; list.push(p); }
  return list;
})();

const pks = config.wallets.length ? config.wallets : (config.walletPrivateKey ? [config.walletPrivateKey] : []);
if (!pks.length) { console.error('Tidak ada wallet. Isi WALLETS= di .env (1 pk per baris) atau WALLET_PRIVATE_KEY='); process.exit(1); }

console.log(`[multi] mode=${MODE} wallet=${pks.length} script=${SCRIPT}`);
const children = [];
pks.forEach((pk, i) => {
  const shard = SHARDS[i % SHARDS.length];
  const proxy = PROXIES.length ? PROXIES[i % PROXIES.length] : (process.env.KINTARA_PROXY || '');
  const tag = `w${i + 1}`;
  const env = {
    ...process.env,
    WALLET_PRIVATE_KEY: pk,       // script child tetap single-wallet — ini yg di-inject
    KINTARA_PROXY: proxy,          // beda IP per wallet
    KINTARA_SERVERS: SHARDS.join(','),
  };
  const out = fs.openSync(path.join(OUT, `${tag}.out`), 'a');
  const args = [path.join(ROOT, SCRIPT)];
  if (SCRIPT.includes('gather-bot')) args.push(MODE === 'rock' ? 'rock' : 'tree', shard);
  else args.push(shard);
  const child = cp.spawn(process.execPath, args, { env, cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
  child.unref();
  children.push({ tag, pid: child.pid, shard, proxy: proxy || '-' });
  console.log(`[multi] ${tag} → shard=${shard} proxy=${proxy || '-'} pid=${child.pid}`);
  // stagger biar nggak login beruntunan (anti rate-limit/flag)
  const t = setTimeout(() => {}, 0); clearTimeout(t);
});

fs.writeFileSync(path.join(OUT, 'multi-state.json'), JSON.stringify({ mode: MODE, started: Date.now(), children }, null, 2));
console.log('[multi] semua child diluncurkan. Log per wallet: recon/multi/wN.out');
