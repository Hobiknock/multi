// kins-check.js — Cek saldo KINS yang BENAR (KINS = Token-2022!)
// Jangan cuma cek ATA klasik — itu bug yang bikin semua saldo keliru 0 kemarin.
// Usage:
//   node tools/kins-check.js <pk1> [pk2 ...]
//   node tools/kins-check.js --env     → semua WALLETS di .env
const path = require('path');
const fs = require('fs');
const bs58 = require('bs58').default || require('bs58');
const nacl = require('tweetnacl');

const MINT = process.env.KINS_MINT || 'Tqj8yFmagrg7oorpQkVGYR52r96RFTamvWfth9bpump';
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const TOKEN_CLASSIC = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function pubB58(pkB58) {
  const raw = bs58.decode(pkB58.trim());
  const kp = raw.length === 64 ? nacl.sign.keyPair.fromSecretKey(raw) : nacl.sign.keyPair.fromSeed(raw);
  return bs58.encode(kp.publicKey);
}

async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'rpc err');
  return j.result;
}

function pksFromEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return [];
  const raw = fs.readFileSync(envPath, 'utf8');
  const block = raw.split(/^WALLETS=/m)[1] || '';
  const out = [];
  for (const line of block.split('\n')) {
    const s = line.trim();
    if (s.length >= 80 && s.length <= 100 && /^[A-Za-z0-9]+$/.test(s)) out.push(s);
    else if (out.length) break;
  }
  return out;
}

(async () => {
  const args = process.argv.slice(2);
  const pks = args[0] === '--env' ? pksFromEnv() : args;
  if (!pks.length) { console.error('Pakai: node tools/kins-check.js <pk...> | --env'); process.exit(1); }
  for (const pk of pks) {
    let pub;
    try { pub = pubB58(pk); } catch { console.log('PK invalid (bukan base58 64/32 byte)'); continue; }
    let kins = 0;
    try {
      for (const prog of [TOKEN_CLASSIC, TOKEN_2022]) {
        const res = await rpc('getTokenAccountsByOwner', [pub, { programId: prog }, { encoding: 'jsonParsed' }]);
        for (const { account } of res.value || []) {
          const info = account.data.parsed.info;
          if (info.mint === MINT) kins += info.tokenAmount.uiAmount || 0;
        }
      }
      const bal = await rpc('getBalance', [pub]);
      const sol = ((bal && bal.value) || 0) / 1e9;
      console.log(`${pub.slice(0, 10)}… KINS=${kins} SOL=${sol.toFixed(5)}${kins >= 1000 ? ' ✅ lolos F3' : ''}`);
    } catch (e) { console.log(`${pub.slice(0, 10)}… ERR ${String(e.message).slice(0, 60)}`); }
    await new Promise(r => setTimeout(r, 400));
  }
})();
