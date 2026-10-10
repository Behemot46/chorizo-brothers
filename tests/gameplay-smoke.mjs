// Gameplay smoke test: sausage bonuses, sausage currency, magnet, hearts, a short bot run, no page errors.
// Run: node tests/gameplay-smoke.mjs   (same env vars as ui-smoke.mjs)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const pwPath = process.env.PLAYWRIGHT_PATH || ['playwright', '/opt/node-tools/node_modules/playwright'].find((p) => { try { require.resolve(p); return true; } catch (e) { return false; } });
const { chromium } = require(pwPath);
const URL = 'file://' + resolve(here, '..', 'index.html');
const exe = process.env.CHROMIUM_PATH || (process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers') + '/chromium';
const threeLocal = process.env.THREE_JS_PATH;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (extra ? '  ' + extra : '')); };

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('ringrush.v1', JSON.stringify({ coins: 0, tut: true })); } catch (e) {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
if (threeLocal) await page.route('**/three.min.js', (r) => r.fulfill({ body: readFileSync(threeLocal), contentType: 'application/javascript' }));
await page.goto(URL);
await page.waitForFunction(() => window.RingRush, null, { timeout: 20000 });

console.log('\n== sausage bonuses ==');
const out = await page.evaluate(() => {
  const R = RingRush, res = {};
  R.start(); R.step(10);
  const eat = (kind, lane) => { R.place(kind, 14, lane); const f0 = R.ammo().food; for (let i = 0; i < 90; i++) { R.step(1); if (R.ammo().food > f0) return true; } return false; };
  const lane = () => R.state().lane;
  res.hotdog = eat(0, lane()); res.turbo = R.ammo().turbo;
  res.bratwurst = eat(1, lane()); res.power = R.ammo().power;
  res.merguez = eat(2, lane()); res.magnet = R.ammo().magnet;
  R.setLives(1); res.livesBefore = R.state().lives;
  res.salami = eat(3, lane()); res.livesAfter = R.state().lives;
  R.start(); R.step(10);
  res.queen = eat(4, lane()); const a = R.ammo(); res.queenAll = a.turbo > 3 && a.power > 3 && a.magnet > 3;
  return res;
});
check('hot dog is collected and gives turbo', out.hotdog && out.turbo > 2, 'turbo=' + out.turbo);
check('bratwurst is collected and gives power ram', out.bratwurst && out.power > 5, 'power=' + out.power);
check('merguez is collected and gives magnet', out.merguez && out.magnet > 5, 'magnet=' + out.magnet);
check('salami is collected and gives a heart', out.salami && out.livesAfter === out.livesBefore + 1, `${out.livesBefore}->${out.livesAfter}`);
check('chorizo queen gives turbo + power + magnet', out.queen && out.queenAll);

console.log('\n== sausage currency + magnet ==');
const coin = await page.evaluate(() => {
  const R = RingRush;
  R.start(); R.step(10);
  // a line of sausage coins in the lane next to the player: only the magnet should reach them
  const s0 = R.state().coins;
  for (let i = 0; i < 6; i++) R.placeCoin(12 + i * 4, 1);
  R.act.lane(-1); R.step(40);
  const off = R.state().coins - s0;
  R.start(); R.step(10); R.boost(2);
  for (let i = 0; i < 6; i++) R.placeCoin(12 + i * 4, 1);
  R.act.lane(-1); R.step(80);
  const withMagnet = R.state().coins;
  return { off, withMagnet };
});
check('coins in a far lane are NOT collected without magnet', coin.off === 0, 'off=' + coin.off);
check('magnet pulls sausage coins from the next lane', coin.withMagnet >= 3, 'collected=' + coin.withMagnet);

console.log('\n== footprint on the road ==');
const fp = await page.evaluate(() => RingRush.footprints());
check('sausage coins (with glow) fit well inside a lane', fp.coinGlow <= fp.max, `coin=${fp.coin.toFixed(2)}m glow=${fp.coinGlow.toFixed(2)}m max=${fp.max.toFixed(2)}m lane=${fp.lane}m`);
check('every sausage bonus fits inside a lane even while spinning', fp.pickups.every((x) => x <= fp.max + 0.01), fp.pickups.map((x) => x.toFixed(2)).join(' / ') + ' m');

console.log('\n== electric shock ==');
const shock = await page.evaluate(() => {
  const R = RingRush, res = {};
  R.start(); R.step(10);
  /* 1) nothing in range: the shock fizzles and keeps its charge */
  R.setUp('shock', 0);
  const before = R.ammo().shocks; R.shock(); res.fizzleKeeps = R.ammo().shocks === before;
  /* 2) a vehicle in range is taken out */
  let found = null;
  for (let i = 0; i < 60 * 40 && !found; i++) { R.step(1); found = R.cars().find((c) => c.rel > 8 && c.rel < 28 && c.type !== 'bus' && c.type !== 'truck'); }
  const k0 = R.ammo().kills, sh0 = R.ammo().shocks;
  res.sawTarget = !!found;
  for (let j = 0; j < 40; j++) R.step(1);   /* let the cooldown pass */
  const again = R.cars().find((c) => c.rel > 6 && c.rel < 30 && c.type !== 'bus' && c.type !== 'truck');
  R.shock();
  res.killed = R.ammo().kills - k0; res.spent = sh0 - R.ammo().shocks; res.target = !!again;
  /* 3) a police car chasing from behind is destroyed */
  R.start(); R.step(10); R.spawnCop();
  let cop = null; for (let i = 0; i < 60 * 14 && !cop; i++) { R.step(1); cop = R.cops().find((c) => c.rel > -15); }
  const k1 = R.ammo().kills; res.copBefore = R.cops().length; R.shock(); res.copKills = R.ammo().kills - k1; res.copAfter = R.cops().length;
  return res;
});
check('shock with nothing in range fizzles and keeps the charge', shock.fizzleKeeps);
check('shock destroys a vehicle in range and spends one charge', shock.target ? shock.killed >= 1 && shock.spent === 1 : shock.sawTarget, JSON.stringify(shock));
check('shock destroys a police car chasing from behind', shock.copKills >= 1 && shock.copAfter < shock.copBefore, `kills=${shock.copKills} cops ${shock.copBefore}->${shock.copAfter}`);

console.log('\n== short bot run ==');
const bot = await page.evaluate(() => {
  const R = RingRush, W = 3.4;
  const danger = (l) => { let d = 1e9; for (const c of R.cars()) if (Math.abs(c.lat - l * W) < 2.3 && c.rel > -c.len / 2 - 3) d = Math.min(d, c.rel - c.len / 2); return d; };
  R.setUp('armor', 2); R.start(); R.setLaps(1);
  let i = 0;
  for (; i < 60 * 60; i++) {
    R.step(1); const s = R.state(); if (s.state !== 'play') break;
    if (i % 2) continue;
    const cur = s.lane, dc = danger(cur);
    if (dc < s.speed * 0.9 + 12) { let best = cur, bd = dc; for (const d of [-1, 1]) { const nl = cur + d; if (Math.abs(nl) > 1) continue; const dn = danger(nl); if (dn > bd + 6) { best = nl; bd = dn; } } if (best !== cur) R.act.lane(best - cur); }
    if (i % 90 === 0) R.fire();
  }
  const s = R.state();
  return { secs: i / 60, state: s.state, coins: s.coins, kills: R.ammo().kills, score: Math.round(s.score) };
});
check('bot survives 60 seconds with armor', bot.state === 'play', JSON.stringify(bot));
check('bot collected sausage coins and made kills', bot.coins > 0 && bot.kills > 0);

check('no page errors / shader errors', errors.length === 0, errors.slice(0, 3).join(' / '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILED:\n - ' + failed.map((f) => f.name).join('\n - ')); process.exit(1); }
