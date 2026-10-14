/* Profiles: one JSON blob per username + one small leaderboard blob. Identification is by username only (no passwords) by design. */
const MAX_BODY = 40000;
export const cleanName = (raw) => {
  const n = String(raw || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 16) return null;
  if (!/^[\p{L}\p{N}_ .\-']+$/u.test(n)) return null;
  return n;
};
const keyOf = (name) => 'u/' + Buffer.from(name.toLowerCase(), 'utf8').toString('hex') + '.json';
const LB = 'leaderboard.json';

export function createApi(blob) {
  const readJson = async (pathname) => {
    const { blobs } = await blob.list({ prefix: pathname, limit: 5 });
    const hit = blobs.find((b) => b.pathname === pathname);
    if (!hit) return null;
    const r = await fetch(hit.url + (hit.url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return r.json();
  };
  const writeJson = (pathname, data) => blob.put(pathname, JSON.stringify(data), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });

  async function getProfile(name) { return readJson(keyOf(name)); }
  const cleanCard = (c) => {
    if (!c || typeof c !== 'object') return null;
    const i = (v, lo, hi) => Math.max(lo, Math.min(hi, v | 0)), p = c.p && typeof c.p === 'object' ? c.p : {};
    return { lv: i(c.lv, 1, 100), pr: i(c.pr, 0, 99), p: { frame: i(p.frame, 0, 40), bg: i(p.bg, 0, 40), fx: i(p.fx, 0, 10), em: i(p.em, 0, 60) }, ti: String(c.ti || '').slice(0, 24) };
  };
  async function putProfile(name, save, card) {
    const slim = JSON.stringify(save);
    if (slim.length > MAX_BODY) throw Object.assign(new Error('too big'), { status: 413 });
    await writeJson(keyOf(name), { name, save, at: Date.now() });
    const lb = (await readJson(LB)) || { users: {} };
    const league = save.trophies | 0, wins = Object.values(save.wins || {}).reduce((a, b) => a + (b | 0), 0);
    lb.users[name.toLowerCase()] = { n: name, t: league, w: wins, r: save.runs | 0, at: Date.now(), c: cleanCard(card) };
    const keys = Object.keys(lb.users);
    if (keys.length > 500) { keys.sort((a, b) => lb.users[a].t - lb.users[b].t).slice(0, keys.length - 500).forEach((k) => delete lb.users[k]); }
    await writeJson(LB, lb);
  }
  async function leaderboard() {
    const lb = (await readJson(LB)) || { users: {} };
    return Object.values(lb.users).filter((u) => !u.n.startsWith('_probe')).sort((a, b) => b.t - a.t || b.w - a.w || a.at - b.at).slice(0, 30);
  }

  const cors = (res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'content-type'); };
  async function profile(req, res) {
    res.setHeader('Cache-Control', 'no-store'); cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end ? res.status(204).end() : res.status(204).json({});
    try {
      if (req.method === 'GET') {
        const name = cleanName(req.query && req.query.u);
        if (!name) return res.status(400).json({ ok: false, error: 'name' });
        const p = await getProfile(name);
        return res.status(200).json({ ok: true, exists: !!p, save: p ? p.save : null, name });
      }
      if (req.method === 'POST') {
        let body = req.body;
        if (typeof body === 'string') body = JSON.parse(body);
        const name = cleanName(body && body.u);
        if (!name || !body.save || typeof body.save !== 'object') return res.status(400).json({ ok: false, error: 'bad request' });
        await putProfile(name, body.save, body.card);
        return res.status(200).json({ ok: true, name });
      }
      return res.status(405).json({ ok: false });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: String(e.message || e) });
    }
  }
  async function board(req, res) {
    res.setHeader('Cache-Control', 'no-store'); cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end ? res.status(204).end() : res.status(204).json({});
    try { return res.status(200).json({ ok: true, rows: await leaderboard() }); }
    catch (e) { return res.status(500).json({ ok: false, error: String(e.message || e) }); }
  }
  /* ---- player feedback: one small blob per message (unguessable URL). Reading needs the admin key (env FEEDBACK_ADMIN_KEY) ---- */
  const CATS = ['bug', 'idea', 'hard', 'easy', 'love', 'controls', 'other'];
  const str = (v, n) => String(v == null ? '' : v).normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
  function cleanFeedback(b) {
    if (!b || typeof b !== 'object') return null;
    const text = str(b.text, 800), rating = Math.max(0, Math.min(5, b.rating | 0)), cat = CATS.includes(b.cat) ? b.cat : 'other';
    if (!text && !rating) return null;
    const c = b.ctx && typeof b.ctx === 'object' ? b.ctx : {}, ctx = {};
    for (const k of ['v', 'device', 'ctl', 'car', 'track', 'q']) if (c[k] != null) ctx[k] = str(c[k], 24);
    for (const k of ['runs', 'wins', 'trophies', 'level', 'prestige', 'place', 'ach', 'hp', 'w', 'h']) if (c[k] != null && isFinite(+c[k])) ctx[k] = Math.round(+c[k]);
    return { user: cleanName(b.u) || '', rating, cat, text, ctx, at: Date.now() };
  }
  async function addFeedback(b) {
    const fb = cleanFeedback(b); if (!fb) throw Object.assign(new Error('empty'), { status: 400 });
    await blob.put('fb/' + fb.at + '.json', JSON.stringify(fb), { access: 'public', addRandomSuffix: true, contentType: 'application/json' });
    return fb;
  }
  async function listFeedback(limit) {
    const { blobs } = await blob.list({ prefix: 'fb/', limit: 1000 });
    const rows = [];
    for (const b of blobs.slice(-Math.min(limit || 200, 500))) {
      try { const r = await fetch(b.url, { cache: 'no-store' }); if (r.ok) rows.push(await r.json()); } catch (e) { /* skip */ }
    }
    return rows.sort((a, b) => a.at - b.at);
  }
  async function feedback(req, res, env) {
    res.setHeader('Cache-Control', 'no-store'); cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end ? res.status(204).end() : res.status(204).json({});
    try {
      if (req.method === 'POST') {
        let body = req.body; if (typeof body === 'string') body = JSON.parse(body);
        if (JSON.stringify(body || {}).length > 6000) return res.status(413).json({ ok: false, error: 'too big' });
        await addFeedback(body); return res.status(200).json({ ok: true });
      }
      if (req.method === 'GET') {
        const key = (env && env.FEEDBACK_ADMIN_KEY) || '';
        if (!key || !req.query || req.query.k !== key) return res.status(403).json({ ok: false, error: 'forbidden' });
        return res.status(200).json({ ok: true, rows: await listFeedback(req.query.n | 0) });
      }
      return res.status(405).json({ ok: false });
    } catch (e) { return res.status(e.status || 500).json({ ok: false, error: String(e.message || e) }); }
  }
  return { profile, board, feedback, getProfile, putProfile, leaderboard, cleanFeedback };
}
