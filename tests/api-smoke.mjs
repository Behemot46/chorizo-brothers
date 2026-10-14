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
/* ---- feedback ---- */
r = await call((q, s) => api.feedback(q, s, { FEEDBACK_ADMIN_KEY: 'sekret' }), { method: 'POST', body: { u: 'Dana', rating: 4, cat: 'idea', text: '  כדאי להוסיף עוד מסלולים  ', ctx: { v: 'c1', device: 'touch', runs: 12, wins: 3, evil: 'x' } } });
check('feedback is accepted', r.code === 200 && r.body.ok);
r = await call((q, s) => api.feedback(q, s, { FEEDBACK_ADMIN_KEY: 'sekret' }), { method: 'POST', body: { rating: 0, text: '   ' } });
check('empty feedback is rejected', r.code === 400);
r = await call((q, s) => api.feedback(q, s, { FEEDBACK_ADMIN_KEY: 'sekret' }), { method: 'POST', body: { text: 'x'.repeat(9000) } });
check('oversized feedback is rejected', r.code === 413);
r = await call((q, s) => api.feedback(q, s, { FEEDBACK_ADMIN_KEY: 'sekret' }), { method: 'GET', query: {} });
check('reading feedback without the key is forbidden', r.code === 403);
r = await call((q, s) => api.feedback(q, s, {}), { method: 'GET', query: { k: '' } });
check('reading is forbidden when no admin key is configured', r.code === 403);
r = await call((q, s) => api.feedback(q, s, { FEEDBACK_ADMIN_KEY: 'sekret' }), { method: 'GET', query: { k: 'sekret' } });
check('with the key the feedback is returned, cleaned and unknown context fields dropped', r.code === 200 && r.body.rows.length === 1 && r.body.rows[0].text === 'כדאי להוסיף עוד מסלולים' && r.body.rows[0].user === 'Dana' && r.body.rows[0].ctx.runs === 12 && r.body.rows[0].ctx.evil === undefined && r.body.rows[0].cat === 'idea', JSON.stringify(r.body.rows[0]));
r = await call(api.profile, { method: 'POST', body: { u: 'Card', save: { trophies: 5, wins: {} }, card: { lv: 7, pr: 1, p: { frame: 3, bg: 2, fx: 1, em: 4 }, ti: 'האלוף', evil: '<b>' } } });
r = await call(api.board, { method: 'GET' });
const card = r.body.rows.find((x) => x.n === 'Card');
check('the leaderboard carries the plate card (level, prestige, frame/background/effect/emblem, title) and nothing else', card && card.c.lv === 7 && card.c.pr === 1 && card.c.p.frame === 3 && card.c.ti === 'האלוף' && card.c.evil === undefined, JSON.stringify(card && card.c));
globalThis.fetch = realFetch;
const bad = results.filter((x) => !x).length;
console.log(`\n${results.length - bad}/${results.length} checks passed`);
if (bad) process.exit(1);
