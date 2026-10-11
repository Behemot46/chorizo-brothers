// Unit test of the profile API with an in-memory fake of @vercel/blob (no network, no token).
import { createApi, cleanName } from '../api/_lib.js';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? '  PASS ' : '  FAIL ') + name + (extra ? '  ' + extra : '')); };
const store = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { const p = String(url).split('://fake/')[1].split('?')[0]; return store.has(p) ? { ok: true, json: async () => JSON.parse(store.get(p)) } : { ok: false }; };
const fake = {
  async put(path, body) { store.set(path, body); return { url: 'https://fake/' + path }; },
  async list({ prefix }) { return { blobs: [...store.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ pathname: k, url: 'https://fake/' + k })) }; }
};
const api = createApi(fake);
const mkRes = () => { const r = { code: 0, body: null, headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const call = async (fn, req) => { const r = mkRes(); await fn(req, r); return r; };

check('names: Hebrew, Latin, digits ok; too short / odd characters rejected', cleanName('שחר') === 'שחר' && cleanName(' Gabi_7 ') === 'Gabi_7' && cleanName('a') === null && cleanName('<script>') === null && cleanName('x'.repeat(17)) === null);
let r = await call(api.profile, { method: 'GET', query: { u: 'שחר' } });
check('unknown user: exists=false', r.code === 200 && r.body.ok && r.body.exists === false);
r = await call(api.profile, { method: 'POST', body: { u: 'שחר', save: { coins: 500, trophies: 40, wins: { ring: 2 }, runs: 5 } } });
check('save a profile', r.code === 200 && r.body.ok);
r = await call(api.profile, { method: 'GET', query: { u: 'שחר' } });
check('the same username returns the saved progress', r.body.exists && r.body.save.coins === 500 && r.body.save.trophies === 40);
r = await call(api.profile, { method: 'GET', query: { u: 'שחר ' } });
check('name matching ignores surrounding spaces', r.body.exists === true);
await call(api.profile, { method: 'POST', body: JSON.stringify({ u: 'Gabi', save: { trophies: 90, wins: { ring: 1, sausage: 3 } } }) });
await call(api.profile, { method: 'POST', body: { u: 'Dana', save: { trophies: 10, wins: {} } } });
r = await call(api.board, { method: 'GET' });
check('leaderboard is sorted by trophies', r.body.rows.map((x) => x.n).join() === 'Gabi,שחר,Dana' && r.body.rows[0].w === 4, JSON.stringify(r.body.rows.map((x) => [x.n, x.t, x.w])));
await call(api.profile, { method: 'POST', body: { u: 'Dana', save: { trophies: 200, wins: {} } } });
r = await call(api.board, { method: 'GET' });
check('updating a profile updates the leaderboard (no duplicates)', r.body.rows.length === 3 && r.body.rows[0].n === 'Dana');
r = await call(api.profile, { method: 'POST', body: { u: 'x', save: {} } });
check('bad name is rejected', r.code === 400);
r = await call(api.profile, { method: 'POST', body: { u: 'Big', save: { junk: 'x'.repeat(50000) } } });
check('oversized profile is rejected', r.code === 413);
await call(api.profile, { method: 'POST', body: { u: '_probe_x', save: { trophies: 9999, wins: {} } } });
r = await call(api.board, { method: 'GET' });
check('probe accounts used for deployment checks never show on the leaderboard', !r.body.rows.some((x) => x.n === '_probe_x'));
globalThis.fetch = realFetch;
const bad = results.filter((x) => !x).length;
console.log(`\n${results.length - bad}/${results.length} checks passed`);
if (bad) process.exit(1);
