// Fetches the player feedback and prints an organized report.
// Run: FEEDBACK_ADMIN_KEY=... node tools/feedback-report.mjs [--base https://chorizo-brothers.vercel.app] [--json out.json] [--since 2026-10-14]
import { writeFileSync } from 'node:fs';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'https://chorizo-brothers.vercel.app'), key = process.env.FEEDBACK_ADMIN_KEY, since = arg('since', '');
if (!key) { console.error('Set FEEDBACK_ADMIN_KEY'); process.exit(1); }
const r = await fetch(`${base}/api/feedback?n=500&k=${encodeURIComponent(key)}`);
if (!r.ok) { console.error('HTTP', r.status, await r.text()); process.exit(1); }
let rows = (await r.json()).rows || [];
if (since) rows = rows.filter((x) => x.at >= Date.parse(since));
const CAT = { bug: '🐞 באגים', idea: '💡 הצעות', hard: '🔥 קשה מדי', easy: '😴 קל מדי', love: '❤️ אהבו', controls: '🎮 שליטה', other: '📝 אחר' };
const rated = rows.filter((x) => x.rating > 0), avg = rated.length ? (rated.reduce((a, x) => a + x.rating, 0) / rated.length).toFixed(2) : '-';
const count = (f) => rows.reduce((m, x) => { const k = f(x) || '?'; m[k] = (m[k] || 0) + 1; return m; }, {});
console.log(`# דוח משוב (${rows.length} הודעות, ממוצע ${avg}/5 מתוך ${rated.length} דירוגים)\n`);
console.log('מכשיר:', JSON.stringify(count((x) => x.ctx && x.ctx.device)), ' היגוי:', JSON.stringify(count((x) => x.ctx && x.ctx.ctl)), ' מסלול:', JSON.stringify(count((x) => x.ctx && x.ctx.track)));
console.log('התפלגות דירוגים:', JSON.stringify(count((x) => x.rating)), '\n');
for (const [k, label] of Object.entries(CAT)) {
  const g = rows.filter((x) => x.cat === k && x.text);
  if (!g.length) continue;
  console.log(`## ${label} (${g.length})`);
  for (const x of g.slice(-15)) console.log(`- [${x.rating || '-'}★ · ${x.user || 'אנונימי'} · ${(x.ctx && x.ctx.device) || '?'} · ריצות ${(x.ctx && x.ctx.runs) || '?'} · רמה ${(x.ctx && x.ctx.level) || '?'}] ${x.text.replace(/\n/g, ' ')}`);
  console.log('');
}
const j = arg('json', ''); if (j) { writeFileSync(j, JSON.stringify(rows, null, 2)); console.log('נשמר ל-' + j); }
