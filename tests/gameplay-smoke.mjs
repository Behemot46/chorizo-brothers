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

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
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

console.log('\n== vehicles ==');
const veh = await page.evaluate(() => {
  const R = RingRush, out = {};
  const settle = () => { R.step(30); R.act.lane(1); let n = 0; while (R.state().lat < 3.0 && n < 120) { R.step(1); n++; } return n; };
  for (const id of ['sport', 'jeep', 'taxi', 'armored']) { R.setCar(id); R.start(); out[id] = Object.assign({ settle: settle() }, R.vehicle()); }
  /* the armored car's shield soaks the first hit without losing a heart */
  R.setCar('armored'); R.start(); R.setLaps(1); let first = null;
  for (let i = 0; i < 60 * 60 && R.state().state === 'play'; i++) { R.step(1); if (R.vehicle().shield === 0) { first = R.state().lives; break; } }
  out.shieldHitLives = first; out.livesFull = R.vehicle().maxLives;
  R.setCar('sport'); R.start();
  return out;
});
check('jeep has an extra heart, taxi and armored dimensions differ', veh.jeep.maxLives === veh.sport.maxLives + 1 && veh.armored.len > veh.sport.len && veh.jeep.wid > veh.sport.wid, JSON.stringify([veh.sport.maxLives, veh.jeep.maxLives]));
check('steering: taxi settles faster than sport, jeep slowest', veh.taxi.settle < veh.sport.settle && veh.sport.settle < veh.jeep.settle, `taxi=${veh.taxi.settle} sport=${veh.sport.settle} jeep=${veh.jeep.settle}`);
check('armored shield absorbs the first hit without losing a heart', veh.shieldHitLives === veh.livesFull, `lives=${veh.shieldHitLives}/${veh.livesFull}`);

console.log('\n== visual effects ==');
await page.evaluate(() => { const R = RingRush; R.start(); R.setLaps(1); R.step(30); for (let i = 0; i < 60 * 30; i++) { R.step(1); if (R.cars().some((c) => c.rel > 8 && c.rel < 28 && c.type !== 'bus' && c.type !== 'truck')) break; } R.shock(); R.step(2); });
await page.waitForTimeout(300);
const fx1 = await page.evaluate(() => RingRush.fx());
await page.evaluate(() => RingRush.fxStep(0.6));
const fx2 = await page.evaluate(() => RingRush.fx());
await page.evaluate(() => RingRush.fxStep(4));
const fx3 = await page.evaluate(() => RingRush.fx());
check('a wreck leaves debris, smoke and fire', fx1.debris > 0 && fx1.smoke > 0 && fx1.fire > 0, JSON.stringify({ d: fx1.debris, s: fx1.smoke, f: fx1.fire }));
check('debris stays on the road for a moment, then clears', fx2.debris > 0 && fx3.debris === 0, `after 0.6s=${fx2.debris}, after 4.6s=${fx3.debris}`);
await page.evaluate(() => { document.getElementById('btnPause').dispatchEvent(new Event('click')); document.getElementById('btnResume').click(); RingRush.impact({ slow: 0.8, flash: 1, shake: 0.9, punch: 1 }); });
let minScale = 1, minBack = 99;
for (let i = 0; i < 40; i++) { const f = await page.evaluate(() => RingRush.fx()); minScale = Math.min(minScale, f.timeScale); minBack = Math.min(minBack, f.back); await page.waitForTimeout(40); }
await page.waitForTimeout(900);
const fxEnd = await page.evaluate(() => ({ fx: RingRush.fx(), flash: document.getElementById('flashW').className }));
check('impact slows time to under 0.5x and then restores it', minScale < 0.5 && fxEnd.fx.timeScale === 1, `min=${minScale.toFixed(2)} end=${fxEnd.fx.timeScale}`);
check('camera never gets closer than the 3-lane limit during an impact', minBack >= 10.39, 'min distance=' + minBack.toFixed(2));
check('white flash fires on a big impact', fxEnd.flash.includes('go'));
const calm = await page.evaluate(() => { document.getElementById('btnFx1').click(); const calmOn = JSON.parse(localStorage.getItem('ringrush.v1')).calm; document.getElementById('flashW').className = ''; RingRush.impact({ slow: 0.8, flash: 1, shake: 0.9, punch: 1 }); const r = { calmOn, flash: document.getElementById('flashW').className, slowT: RingRush.fx().slowT }; document.getElementById('btnFx1').click(); return r; });
check('reduced-flash mode: no white flash, shorter slow motion', calm.calmOn === true && !calm.flash.includes('go') && calm.slowT > 0 && calm.slowT < 0.8, JSON.stringify(calm));

console.log('\n== adaptive music ==');
const layerWait = async (setup) => { await page.evaluate(setup); await page.evaluate(() => RingRush.audioReset()); await page.waitForTimeout(2300); return page.evaluate(() => RingRush.audio()); };
const mBase = await layerWait(() => { RingRush.start(); });
check('music runs: kick + bass play, extra layers stay off at the start', mBase.running && mBase.kick > 2 && mBase.bass > 4 && mBase.arp === 0 && mBase.lead === 0 && mBase.stab === 0 && mBase.hat === 0, JSON.stringify(mBase));
const mTurbo = await layerWait(() => { RingRush.start(); RingRush.boost(0); });
check('turbo adds the arpeggio and hats and speeds the tempo up', mTurbo.arp > 2 && mTurbo.hat > 2 && mTurbo.tempo > mBase.tempo + 4, `arp=${mTurbo.arp} hat=${mTurbo.hat} tempo ${mBase.tempo.toFixed(0)}->${mTurbo.tempo.toFixed(0)}`);
const mCombo = await layerWait(() => { RingRush.start(); RingRush.setCombo(12); });
check('a long near-miss combo adds the lead melody', mCombo.lead > 2, 'lead=' + mCombo.lead);
const mCop = await layerWait(() => { RingRush.start(); RingRush.setLaps(1); RingRush.spawnCop(); RingRush.step(60 * 6); });
check('a police car close behind adds the alarm stabs', mCop.stab > 0, 'stab=' + mCop.stab);

console.log('\n== achievements ==');
const ach = await page.evaluate(() => {
  const R = RingRush, out = {};
  const c0 = R.state().coins; R.bump('rams', 100); R.checkAch();
  out.ram = R.ach().includes('ram100'); out.noKing = !R.ach().includes('king'); out.crownBefore = R.crown();
  R.bump('noBrakeLaps', 1); R.bump('cops', 10); R.bump('kills', 250); R.bump('sausages', 1000); R.bumpMax('maxCombo', 15); R.bumpMax('bestLaps', 5); R.bumpMax('maxKmh', 300);
  R.bump('food', 50); R.bump('queens', 1); R.bump('missileKills', 50); R.bump('shocked', 50); R.bump('bosses', 1);
  for (const id of ['jeep', 'taxi', 'armored']) R.setCar(id);
  R.setCar('sport'); R.checkAch();
  out.all = R.ach().length; out.king = R.ach().includes('king'); out.crown = R.crown();
  return out;
});
check('a stat reaching its goal unlocks the achievement', ach.ram && ach.noKing && !ach.crownBefore);
check('unlocking every achievement unlocks the king badge and shows the crown', ach.king && ach.crown && ach.all === 15, `unlocked=${ach.all}`);
const stats = await page.evaluate(() => ({ kills: RingRush.stat('kills'), rams: RingRush.stat('rams') }));
check('lifetime stats are tracked', stats.kills >= 250 && stats.rams >= 100, JSON.stringify(stats));

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
  const near = () => R.cops().filter((c) => c.rel > -20 && c.rel < 34).length; const k1 = R.ammo().kills; res.copBefore = near(); R.shock(); res.copKills = R.ammo().kills - k1; res.copAfter = near();
  return res;
});
check('shock with nothing in range fizzles and keeps the charge', shock.fizzleKeeps);
check('shock destroys a vehicle in range and spends one charge', shock.target ? shock.killed >= 1 && shock.spent === 1 : shock.sawTarget, JSON.stringify(shock));
check('shock destroys a police car chasing from behind', shock.copBefore >= 1 && shock.copKills >= 1 && shock.copAfter === 0, `kills=${shock.copKills} cops ${shock.copBefore}->${shock.copAfter}`);

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
