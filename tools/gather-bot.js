#!/usr/bin/env node
// ============ GATHER BOT — autopilot wood/stone/coal/metal (Path A, headless) ============
// Connect world -> belajar node dari res_evt -> walk adjacent -> harvestNode
// (harv->proof->harv_hit s/d felled) -> save-backpack loot -> ulang. Level
// woodcutting/mining. Supervisor reconnect, tahan 502.
//
// Pakai: node tools/gather-bot.js [kind=tree|rock] [shard=s2]
const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { Presence } = require('../lib/presenceWs');
const { KintaraClient } = require('../lib/kintaraClient');
const { isWalletBannedError } = require('../lib/walletAuth');
const gs = require('../lib/gameState');

const KIND = process.argv[2] || 'tree';
let SHARD = process.argv[3] || config.shard || 's4'; // PATCH: let (bisa ganti saat zona steril)
const OUT = path.join(__dirname, '..', 'recon');
const PIDFILE = path.join(OUT, 'control', 'gatherbot.pid');
const log = (...a) => { const s = `[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`; console.log(s); fs.appendFileSync(path.join(OUT, 'gather.log'), s + '\n'); };
const lt = {}; const logT = (k, m, ms = 30000) => { const n = Date.now(); if (!lt[k] || n - lt[k] > ms) { lt[k] = n; log(m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retryDelayMs = (attempt, base = 5000, cap = 60000) => Math.min(cap, base * (2 ** Math.max(0, attempt - 1))) + Math.floor(Math.random() * 1500);
const TRANSIENT_FAILOVER_AFTER = 5;
const isTransientGatewayErr = (msg) => /503|Unexpected token '<'|<!doctype|Non-JSON|presence ws err/i.test(String(msg || ''));
const stats = {
  felled: 0,
  wood: 0,
  stone: 0,
  coal: 0,
  metal: 0,
  gainedWood: 0,
  gainedStone: 0,
  gainedCoal: 0,
  gainedMetal: 0,
  harvests: 0,
  reconnects: 0,
  started: Date.now(),
};
function saveState(extra = {}) {
  fs.writeFileSync(path.join(OUT, 'gather-state.json'), JSON.stringify({
    ...stats,
    kind: KIND,
    region: extra.region || stats.region || 'world',
    phase: extra.phase || stats.phase || 'boot',
    queueAhead: extra.queueAhead != null ? extra.queueAhead : (stats.queueAhead ?? null),
    updatedAt: Date.now(),
    ageMin: Math.round((Date.now() - stats.started) / 60000),
  }, null, 2));
  if (extra.region !== undefined) stats.region = extra.region;
  if (extra.phase !== undefined) stats.phase = extra.phase;
  if (extra.queueAhead !== undefined) stats.queueAhead = extra.queueAhead;
}

let cli;
async function createClientWithRetry() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await KintaraClient.create();
    } catch (e) {
      if (isWalletBannedError(e)) throw e;
      const waitMs = retryDelayMs(attempt);
      saveState({ phase: 'bootstrap_retry', queueAhead: null });
      log(`bootstrap attempt ${attempt} gagal: ${String(e.message || e).slice(0, 50)} — retry ${Math.ceil(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
}
async function connectWithRetry() {
  let transientGatewayFails = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      const p = new Presence(SHARD);
      if (cli) p.setCookie(cli.cookie);
      p.on('log', (m) => log('[ws] ' + m));
      p.on('queue', (d) => {
        if (d.ahead % 5 === 0) log('queue ahead=' + d.ahead);
        saveState({ phase: 'queue', queueAhead: Number.isFinite(Number(d?.ahead)) ? Number(d.ahead) : null, region: p.region });
      });
      await p.connect();
      transientGatewayFails = 0;
      log('✅ presence live region=' + p.region);
      saveState({ phase: 'presence', queueAhead: null, region: p.region });
      return p;
    } catch (e) {
      if (isWalletBannedError(e)) throw e;
      if (isTransientGatewayErr(e.message)) transientGatewayFails++;
      else transientGatewayFails = 0;
      if (transientGatewayFails >= TRANSIENT_FAILOVER_AFTER) {
        saveState({ phase: 'failover_restart', queueAhead: null });
        log(`♻️ shard failover after ${transientGatewayFails} transient gateway errors`);
        throw new Error('transient_presence_failover');
      }
      saveState({ phase: 'reconnect', queueAhead: null });
      const waitMs = retryDelayMs(attempt);
      saveState({ phase: 'reconnect_wait', queueAhead: null });
      log(`connect attempt ${attempt} gagal: ${e.message.slice(0, 50)} — retry ${Math.ceil(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
}

async function persistLoot(loot, yld = 1) {
  try {
    const st = await gs.fetchState(cli); const bp = st.backpack; const slots = bp.invSlots || [];
    let put = false;
    for (const s of slots) if (s && s.t === loot) { s.n += yld; put = true; break; }
    if (!put) { const e = slots.findIndex((s) => !s); if (e >= 0) slots[e] = { t: loot, n: yld }; }
    bp[loot] = (Number(bp[loot]) || 0) + yld;
    const r = await gs.pushBackpack(cli, bp, st.stateSeq, []);
    stats[loot] = r?.backpack?.[loot] ?? stats[loot];
    if (loot === 'wood') stats.gainedWood += yld;
    if (loot === 'stone') stats.gainedStone += yld;
    if (loot === 'coal') stats.gainedCoal += yld;
    if (loot === 'metal') stats.gainedMetal += yld;
    return true;
  } catch (e) { logT('persist', 'persist err: ' + e.message.slice(0, 50)); return false; }
}

// PATCH: state rotasi zona/shard (metode repo kintara kita)
const SHARD_LIST = (process.env.KINTARA_SERVERS || 's1,s2,s3,s4').split(',').map((s) => s.trim()).filter(Boolean);
const SPOTS = [[0, 0], [6, 8], [-6, -8], [10, -10]];   // titik rotasi biar dapat snap segar
let sterileWait = 0, zoneIdx = 0;
const onEvent = (m) => log(m);

async function gatherLoop(p) {
  const harvested = new Set();
  while (p.ready) {
    saveState({ phase: 'scan', queueAhead: null, region: p.region });
    const pool = KIND === 'all' ? [...p.knownNodes('tree'), ...p.knownNodes('rock')] : p.knownNodes(KIND);
    const nodes = pool.filter((n) => !harvested.has(n.key));
    if (!nodes.length) {
      // PATCH (metode repo kintara kita): jangan cuma nunggu selamanya —
      // 1) rotasi posisi biar dapat snap segar, 2) kalau zona steril, pindah zona/shard.
      sterileWait++;
      if (sterileWait <= 3) {
        logT('wait', `nunggu node dari res_evt... (${sterileWait}/3)`);
        // geser posisi pelan biar server kirim res_snap baru
        try { await p.walkTo(SPOTS[(sterileWait) % SPOTS.length][0], SPOTS[(sterileWait) % SPOTS.length][1], { maxSec: 15 }); } catch {}
        await sleep(3000);
        continue;
      }
      // zona steril → rotasi zona dulu (world → whisperwood → pond), baru ganti shard
      const zones = KIND === 'tree' ? ['world', 'whisperwood', 'world'] : ['world', 'pond', 'world'];
      const z = zones[zoneIdx % zones.length]; zoneIdx++;
      onEvent(`🧭 zona ${p.region} steril — pindah ke ${z}...`);
      try { p.setRegion(z, 0, 0); await sleep(2500); } catch {}
      harvested.clear();
      sterileWait = 0;
      await sleep(4000);
      // kalau sudah 3x ganti zona tetap kosong → ganti shard (node beda per-shard)
      if (zoneIdx >= 3) {
        zoneIdx = 0;
        const next = SHARD_LIST[(SHARD_LIST.indexOf(SHARD) + 1) % SHARD_LIST.length];
        onEvent(`🔄 shard ${SHARD} steril — reconnect ke ${next}`);
        try { p.close(); } catch {}
        return next; // caller reconnect ke shard baru
      }
      continue;
    }
    sterileWait = 0;
    // pilih node terdekat dari posisi sekarang
    nodes.sort((a, b) => {
      const [ac, ar] = a.key.split(',').map(Number), [bc, br] = b.key.split(',').map(Number);
      const da = Math.abs(ac - 30.5 - p.pos.x) + Math.abs(ar - 30.5 - p.pos.z);
      const db = Math.abs(bc - 30.5 - p.pos.x) + Math.abs(br - 30.5 - p.pos.z);
      return da - db;
    });
    const node = nodes[0]; harvested.add(node.key);
    const [col, row] = node.key.split(',').map(Number);
    await p.walkTo(col - 30.5 - 1, row - 30.5, { maxSec: 20 });
    await sleep(1000);
    if (!p.ready) break;
    const res = await p.harvestNode(node.kind, node.key, node.hasCoal, node.hasMetal, { maxHits: 10, hitGap: 1700 });
    stats.harvests++;
    if (res.felled) { stats.felled++; await persistLoot(res.loot, 1); logT('fell', `🪓 felled ${node.kind} @${node.key} -> ${res.loot} (wood=${stats.wood} stone=${stats.stone} coal=${stats.coal} metal=${stats.metal}, felled ${stats.felled})`, 15000); }
    saveState({ phase: 'gather', queueAhead: null, region: p.region });
    await sleep(1500);
    if (harvested.size > 200) harvested.clear(); // reset biar bisa re-harvest (node respawn)
    // PATCH: auto-bank 10k (metode repo kintara kita) — jalan ke bank Mainland, deposit, balik
    try {
      const st0 = await gs.fetchState(cli); const bp0 = st0.backpack || {};
      if ((Number(bp0.stone) || 0) >= 10000 || (Number(bp0.coal) || 0) >= 10000) {
        log(`💰 auto-bank: stone=${bp0.stone} coal=${bp0.coal} → ke bank Mainland...`);
        const { depositAll, BANK_WORLD } = require('../lib/bank');
        if (p.region !== 'world') { p.setRegion('world', BANK_WORLD.x, BANK_WORLD.z); await sleep(2500); }
        await p.walkTo(BANK_WORLD, { maxSec: 40 });
        await sleep(1500);
        const res = await depositAll(cli, ['stone', 'coal', 'metal', 'wood']);
        log(`✅ deposit: ${res.moved.join(', ') || '(kosong)'}`);
        // balik ke zona gather terakhir biar nggak nganggur
        harvested.clear();
      }
    } catch (e) { logT('autobank', 'auto-bank skip: ' + e.message.slice(0, 60), 120000); }
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'control'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'gather.log'), '');
  fs.writeFileSync(PIDFILE, JSON.stringify({ pid: process.pid, kind: KIND, shard: SHARD, started: Date.now() }));
  process.on('exit', () => { try { fs.unlinkSync(PIDFILE); } catch {} });
  saveState({ phase: 'boot', queueAhead: null, region: 'world' });
  const { client: c, player } = await createClientWithRetry(); cli = c;
  log('GATHER BOT START kind=' + KIND + ' pid=' + player?.id);
  for (;;) {
    const p = await connectWithRetry();
    p.on('close', () => { stats.reconnects++; saveState({ phase: 'reconnect', queueAhead: null, region: p.region }); log('⚠️ presence closed -> reconnect'); });
    await sleep(2000);
    // diam dulu 8s biar kekumpul node dari res_evt
    saveState({ phase: 'learning', queueAhead: null, region: p.region });
    log('belajar node 8s...'); await sleep(8000);
    const nextShard = await gatherLoop(p); // PATCH: bisa balas shard baru kalau zona steril
    try { p.close(); } catch {}
    if (nextShard && nextShard !== SHARD) { SHARD = nextShard; log(`🔄 pindah shard → ${SHARD}`); }
    await sleep(3000);
  }
})().catch((e) => { log('FATAL ' + e.message); process.exit(1); });
