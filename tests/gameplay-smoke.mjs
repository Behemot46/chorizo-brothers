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
await ctx.addInitScript(() => { try { if (!localStorage.getItem('ringrush.v1')) localStorage.setItem('ringrush.v1', JSON.stringify({ coins: 0, tut: true })); } catch (e) {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('/api/') && !m.text().includes('ERR_FAILED')) errors.push(m.text()); });
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
check('music runs: kick + bass play, arp / lead / alarm layers stay off at the start', mBase.running && mBase.kick > 2 && mBase.bass > 4 && mBase.arp <= 2 && mBase.lead === 0 && mBase.stab === 0, JSON.stringify(mBase));
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
  for (const id of ['jeep', 'taxi', 'chorizotruck', 'armored']) R.setCar(id);
  R.setCar('sport'); R.checkAch();
  out.all = R.ach().length; out.king = R.ach().includes('king'); out.crown = R.crown();
  return out;
});
check('a stat reaching its goal unlocks the achievement', ach.ram && ach.noKing && !ach.crownBefore);
check('unlocking every achievement unlocks the king badge and shows the crown', ach.king && ach.crown && ach.all === 15, `unlocked=${ach.all}`);
const stats = await page.evaluate(() => ({ kills: RingRush.stat('kills'), rams: RingRush.stat('rams') }));
check('lifetime stats are tracked', stats.kills >= 250 && stats.rams >= 100, JSON.stringify(stats));

console.log('\n== boss: the vegetarian produce truck ==');
const bossT = await page.evaluate(() => {
  const R = RingRush, out = {};
  /* appears at the end of every 3rd lap, not before */
  R.start(0); R.nearLap(2); R.step(120); out.noBossRing = !R.boss().active;
  R.start(3); R.nearLap(1); R.step(120); out.noBossLap1 = !R.boss().active;
  R.start(3); R.nearLap(2); R.step(120); out.bossLap2 = R.boss().active; out.hp1 = R.boss().maxHp;
  /* a lettuce thrown at me lands in my lane and costs a heart if I stay */
  R.start(); R.spawnBoss(); R.step(30); const l0 = R.state().lives; R.throwLettuce(); const pend = R.lettuces(); out.telegraph = pend.length === 1 && pend[0].state === 1 && pend[0].lane === R.state().lane;
  R.step(100); out.hit = R.state().lives === l0 - 1;
  /* ... and dodging works: switching lanes during the 1.15 s of flight avoids it */
  R.start(); R.spawnBoss(); R.step(30); const l1 = R.state().lives; R.throwLettuce(); R.step(15); R.act.lane(1); R.step(100); out.dodged = R.state().lives === l1;
  /* the lettuce volley can never fill all three lanes */
  R.start(); R.spawnBoss(); let maxLanes = 0;
  for (let i = 0; i < 300; i++) { const r = Math.random(); if (r < 0.34) R.act.lane(-1); else if (r < 0.67) R.act.lane(1); R.throwLettuce(); R.step(14); R.state(); maxLanes = Math.max(maxLanes, new Set(R.lettuces().map((q) => q.lane)).size); if (R.state().state !== 'play') R.start(); R.spawnBoss(); }
  out.maxLanes = maxLanes;
  return out;
});
check('the boss waits on the storm track only: not on the ring, not before the last lap, there at the end of lap 2', bossT.noBossRing && bossT.noBossLap1 && bossT.bossLap2, JSON.stringify([bossT.noBossRing, bossT.noBossLap1, bossT.bossLap2]));
check('the boss has 10 health', bossT.hp1 === 10, String(bossT.hp1));
check('a lettuce is telegraphed in my lane and hits if I stay', bossT.telegraph && bossT.hit, JSON.stringify([bossT.telegraph, bossT.hit]));
check('switching lanes while the lettuce is in the air dodges it', bossT.dodged);
check('lettuce never fills all three lanes at once', bossT.maxLanes <= 2, 'max distinct lanes=' + bossT.maxLanes);
const fight = await page.evaluate(() => {
  const R = RingRush, out = {};
  const dodgeLane = (want) => { const bad = new Set(R.lettuces().filter((q) => q.rel > -4 && q.rel < 95).map((q) => q.lane)); if (!bad.has(want)) return want; return [-1, 0, 1].find((l) => !bad.has(l)); };
  const run = (secs, shoot) => {
    for (let i = 0; i < secs * 60 && R.state().state === 'play' && R.boss().active; i++) {
      R.step(1); if (i % 2) continue;
      const b = R.boss(), s = R.state(), want = dodgeLane(shoot ? b.lane : s.lane);
      if (want !== undefined && want !== s.lane) R.act.lane(Math.sign(want - s.lane));
      if (shoot && s.lane === b.lane && b.rel > 20 && b.rel < 150 && R.ammo().missiles > 0) R.fire();
    }
  };
  /* beat her with missiles (ramming does not work) */
  R.setUp('armor', 2); R.setUp('missiles', 3); R.setCar('jeep'); R.start(); R.spawnBoss(); const c0 = R.state().coins, b0 = R.stat('bosses'); run(100, true);
  out.beaten = !R.boss().active && !R.boss().fleeing && R.stat('bosses') === b0 + 1; out.reward = R.state().coins - c0; out.ach = R.ach().includes('boss1'); out.alive = R.state().state === 'play';
  /* ... or she escapes after ~48 s with no reward */
  R.start(); R.spawnBoss(); const b1 = R.stat('bosses'); let fled = false; for (let i = 0; i < 60 * 70 && R.state().state === 'play'; i++) { R.step(1); if (R.boss().fleeing) fled = true; if (i % 2 === 0) { const w = dodgeLane(R.state().lane); if (w !== R.state().lane) R.act.lane(Math.sign(w - R.state().lane)); } if (!R.boss().active) break; }
  out.fled = fled; out.noReward = R.stat('bosses') === b1; out.gone = !R.boss().active;
  R.setCar('sport');
  return out;
});
check('missiles beat the boss: reward, stat and achievement', fight.beaten && fight.reward >= 300 && fight.ach && fight.alive, JSON.stringify(fight));
check('an ignored boss runs away after ~48 s with no reward', fight.fled && fight.gone && fight.noReward);

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

console.log('\n== tracks ==');
const trk = await page.evaluate(() => {
  const R = RingRush, out = { Ls: [], ids: [] };
  for (let i = 0; i < 4; i++) { R.start(i); R.step(200); const t = R.trackInfo(); out.Ls.push(Math.round(t.L)); out.ids.push(t.id); }
  R.start(0);
  return out;
});
check('four distinct tracks build and run (lengths 2.5-3.6 km)', trk.ids.join() === 'ring,sausage,clover,zigzag' && trk.Ls.every((l) => l > 2500 && l < 3600) && new Set(trk.Ls).size === 4, JSON.stringify(trk));

console.log('\n== free steering + tilt controls ==');
const steer = await page.evaluate(() => {
  const R = RingRush, out = {};
  R.setCtl('touch'); R.start(0); R.clearTraffic(); R.step(30);
  R.setLat(2.3); R.step(60); out.free = +R.state().lat.toFixed(2);
  R.setLat(-4.8); R.step(60); out.edge = +R.state().lat.toFixed(2);
  R.setLat(0); R.step(60); out.back = +R.state().lat.toFixed(2);
  R.setLat(30); R.step(60); out.clamped = +R.state().lat.toFixed(2);
  return out;
});
check('steering is continuous (not locked to 3 lanes) and clamped to the road', Math.abs(steer.free - 2.3) < 0.15 && Math.abs(steer.edge + 4.8) < 0.2 && Math.abs(steer.back) < 0.15 && steer.clamped <= 5.25, JSON.stringify(steer));
const tilt = await page.evaluate(async () => {
  const R = RingRush, out = {};
  const ori = (b, g, n = 12) => { for (let i = 0; i < n; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g })); };
  R.setCtl('tilt'); out.noSensor = R.ctl();
  await R.tiltRequest(); ori(60, 0);
  R.startRace(0); ori(60, 0); R.step(60 * 4.4); R.clearTraffic(); out.mode = R.ctl();
  R.setLives(5);
  ori(60, 22); R.step(90); out.right = R.state().lat;
  ori(60, -22); R.step(90); out.left = R.state().lat;
  ori(60, 0); R.step(90); out.level = R.state().lat;
  ori(42, 0); R.step(60 * 6); R.clearTraffic(); out.fast = R.state().speed;
  ori(82, 0); R.step(60 * 6); R.clearTraffic(); out.slow = R.state().speed;
  return out;
});
check('without a sensor the game falls back to touch control', tilt.noSensor === 'touch');
check('tilting the phone sideways steers: right, left and level', tilt.mode === 'tilt' && tilt.right > 3.5 && tilt.left < -3.5 && Math.abs(tilt.level) < 0.5, JSON.stringify([tilt.right, tilt.left, tilt.level].map((x) => +(+x).toFixed(2))));
check('tilting forward speeds up and tilting back slows down', tilt.fast > tilt.slow + 15, `fast=${tilt.fast.toFixed(1)} slow=${tilt.slow.toFixed(1)} m/s`);

console.log('\n== race: grid, finish line, rewards ==');
const grid = await page.evaluate(() => {
  const R = RingRush, out = {};
  R.setCtl('touch'); R.startRace(0);
  out.rivals = R.rivals().length; out.countdown = R.race().grid > 3; out.placeStart = R.race().place;
  R.step(60); out.still = R.state().speed === 0 && R.rivals().every((r) => r.speed === 0);
  R.step(60 * 4); out.moving = R.state().speed > 0 && R.rivals().some((r) => r.speed > 5) && R.race().grid === 0;
  return out;
});
check('the race starts on a grid: countdown, 5 rivals, player starts last, nobody moves before GO', grid.rivals === 5 && grid.countdown && grid.placeStart === 6 && grid.still && grid.moving, JSON.stringify(grid));
const fin = await page.evaluate(() => {
  const R = RingRush, out = {};
  R.startRace(0); R.step(60 * 4.4); R.clearTraffic(); R.setLives(5);
  const L = R.race().L, rivalsBefore = R.rivals().map((r) => r.dist);
  out.unlockedBefore = R.unlocked(1);
  R.setLaps(2); R.setDist(3 * L - 40); for (let i = 0; i < 60 * 8 && !R.race().finished; i++) R.step(1);
  out.finished = R.race().finished; out.place = R.race().place;
  R.step(60 * 5);
  out.state = R.state().state; out.reward = R.race().reward; out.rows = R.race().results.length; out.unlockedAfter = R.unlocked(1);
  out.save = { pods: R.saveState().pods, wins: R.saveState().wins, trophies: R.saveState().trophies };
  return out;
});
check('crossing the line after 3 laps finishes the race and shows results', fin.finished && fin.state === 'over' && fin.rows === 6, JSON.stringify({ f: fin.finished, s: fin.state, rows: fin.rows }));
check('winning pays place + win bonus + first-win bonus and gives trophies', fin.place === 1 && fin.reward.pay === 140 && fin.reward.winBonus === 28 && fin.reward.firstWin === 250 && fin.reward.trophies === 30, JSON.stringify(fin.reward));
check('a podium finish unlocks the next track and saves wins and trophies', !fin.unlockedBefore && fin.unlockedAfter && fin.save.pods.ring === 1 && fin.save.wins.ring === 1 && fin.save.trophies === 30, JSON.stringify([fin.unlockedBefore, fin.unlockedAfter, fin.save]));
const third = await page.evaluate(() => {
  const R = RingRush;
  R.startRace(0); R.step(60 * 4.4); R.clearTraffic(); R.setLives(5);
  const L = R.race().L; R.setLaps(2); R.setDist(3 * L - 40);
  R.setRival(0, 600, 0, 50); R.setRival(1, 600, 0, 50);
  for (let i = 0; i < 60 * 8 && !R.race().finished; i++) R.step(1); const place = R.race().place; R.step(60 * 5);
  return { place, reward: R.race().reward };
});
check('3rd place pays less, no win bonus, fewer trophies', third.place === 3 && third.reward.pay === 60 && third.reward.winBonus === 0 && third.reward.trophies === 10, JSON.stringify(third));
const dnf = await page.evaluate(() => {
  const R = RingRush;
  R.startRace(0); R.step(60 * 4.4); R.clearTraffic(); R.setLives(1);
  R.placeCar('sedan', 8, R.state().lat, 0); R.step(60 * 4);
  return { state: R.state().state, race: R.race() };
});
check('crashing out is a DNF: token payout, trophies lost', dnf.state === 'over' && dnf.race.dnf && dnf.race.reward.pay === 5 && dnf.race.reward.trophies === -6, JSON.stringify(dnf.race.reward));

console.log('\n== cleaner HUD + bonus feedback ==');
const hud = await page.evaluate(async () => {
  const R = RingRush, out = {};
  R.start(0); R.step(30); R.clearTraffic();
  const vis = (id) => { const e = document.getElementById(id); return !!e && e.offsetParent !== null; };
  out.clutterHidden = !vis('score') && !vis('combo') && !vis('lap');
  out.shown = ['placeN', 'lapTxt', 'prog', 'kmh', 'nitro', 'mini'].every(vis);
  R.boost(0);
  await new Promise((r) => setTimeout(r, 700));
  const a = R.bonusUi();
  R.boost(1);
  await new Promise((r) => setTimeout(r, 700));
  const b = R.bonusUi();
  out.a = a; out.b = b;
  return out;
});
check('score / combo / LAP clutter is gone, race info is shown', hud.clutterHidden && hud.shown, JSON.stringify([hud.clutterHidden, hud.shown]));
check('collecting a bonus shows a banner with its name, and an icon with a timer', hud.a.banner.includes('נקניקייה') && hud.a.pills.some((p) => p.includes('טורבו')), JSON.stringify(hud.a));
check('a second bonus stacks: both timers are shown, the banner says so', hud.b.banner.includes('בוורסט') && hud.b.banner.includes('בנוסף') && hud.b.pills.length === 2, JSON.stringify(hud.b));

console.log('\n== ram markers, side blades, rear mirror and mines ==');
const marks = await page.evaluate(async () => {
  const R = RingRush, out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  R.setUp('ramF', 0); R.setUp('ramS', 0); R.start(0); R.clearTraffic(); R.setLat(0); R.step(120); R.clearTraffic();
  const until = async (fn) => { for (let i = 0; i < 30; i++) { await wait(100); if (fn()) return true; } return false; };
  const sp = R.state().speed; R.placeCar('sedan', 60, 0, sp); await wait(500); out.none = R.marks()[0];
  R.setUp('ramF', 1); out.front = await until(() => R.marks()[0]);
  R.setUp('ramF', 0); R.boost(1); R.clearTraffic(); R.placeCar('truck', 60, 0, sp); out.power = await until(() => R.marks()[0]);
  R.start(0); R.clearTraffic(); R.setUp('ramF', 1); R.setUp('ramS', 1); R.placeCar('truck', 60, 3.4, sp); await wait(500); out.tooStrong = R.marks().some(Boolean); R.clearTraffic(); R.placeCar('sedan', 60, 3.4, sp); out.otherLane = await until(() => R.marks()[0]);
  return out;
});
check('green halo appears only around cars I can actually destroy', !marks.none && marks.front && marks.power && !marks.tooStrong && marks.otherLane, JSON.stringify(marks));
const blade = await page.evaluate(() => {
  const R = RingRush, out = {};
  R.setUp('ramS', 1); R.start(0); R.clearTraffic(); R.setLat(0); R.step(150); R.clearTraffic();
  const k0 = R.ammo().kills, l0 = R.state().lives; R.placeCar('sedan', 0, 3.4, R.state().speed); R.slam(1); R.step(40);
  out.killed = R.ammo().kills - k0; out.livesKept = R.state().lives === l0;
  R.setUp('ramS', 0); R.start(0); R.clearTraffic(); R.setLat(0); R.step(150); R.clearTraffic();
  const l1 = R.state().lives; R.placeCar('sedan', 0, 3.4, R.state().speed); R.step(2); R.slam(1); R.step(40);
  out.noBladeCrash = R.state().lives < l1;
  R.setUp('ramS', 1); R.startRace(0); R.step(60 * 4.4); R.clearTraffic(); R.setLat(0); R.step(30);
  R.setRival(0, 0, 3.4, R.state().speed); R.slam(1); let st = 0; for (let i = 0; i < 40; i++) { R.step(1); st = Math.max(st, R.rivals()[0].stun); }
  out.rivalKnocked = st > 0;
  return out;
});
check('side slam with blades destroys a car alongside without damage', blade.killed === 1 && blade.livesKept, JSON.stringify(blade));
check('side slam without blades just crashes into the car', blade.noBladeCrash);
check('side slam knocks a rival aside', blade.rivalKnocked);
const mine = await page.evaluate(async () => {
  const R = RingRush, out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  R.noCops(true); R.setUp('mines', 1); R.start(0); R.setLaps(1); R.clearTraffic(); R.step(60); R.clearTraffic();
  out.noMirror = !R.mirrorOn(); out.stock = R.mines();
  R.spawnCop();
  for (let i = 0; i < 60 * 12 && !R.cops().some((c) => c.rel > -40 && c.rel < -12); i++) { R.step(1); if (i % 30 === 0) R.clearTraffic(); }
  await wait(150); out.mirror = R.mirrorOn();
  const p0 = R.stat('punctures'); R.act.mine('p'); R.step(60 * 2.5); R.clearTraffic();
  out.punctured = R.stat('punctures') === p0 + 1 && R.mines().p === out.stock.p - 1;
  out.copSlow = R.cops().length === 0 || R.cops()[0].stun > 0 || R.cops()[0].rel < -50;
  R.step(60 * 6);
  /* an explosive mine kills the chaser */
  R.start(0); R.setLaps(1); R.clearTraffic(); R.step(60); R.clearTraffic(); R.spawnCop();
  for (let i = 0; i < 60 * 12 && !R.cops().some((c) => c.rel > -40 && c.rel < -12); i++) { R.step(1); if (i % 30 === 0) R.clearTraffic(); }
  const k0 = R.ammo().kills; R.act.mine('x'); R.step(60 * 2.5);
  out.exploded = R.ammo().kills > k0 && R.cops().length === 0; out.xLeft = R.mines().x; R.noCops(false);
  /* no mirror again once the cop is gone */
  R.step(60); await wait(600); out.mirrorGone = !R.mirrorOn();
  return out;
});
check('rear mirror opens only while a cop is behind', mine.noMirror && mine.mirror && mine.mirrorGone, JSON.stringify([mine.noMirror, mine.mirror, mine.mirrorGone]));
check('puncture mine stuns the chaser and uses one mine', mine.punctured && mine.copSlow, JSON.stringify([mine.punctured, mine.copSlow, mine.stock]));
check('explosive mines (upgrade) destroy the chaser', mine.exploded && mine.xLeft === mine.stock.x - 1, JSON.stringify([mine.exploded, mine.xLeft, mine.stock.x]));



console.log('\n== chorizo truck, control choice and navigation ==');
const truck = await page.evaluate(async () => {
  const R = RingRush, out = {};
  R.setCar('sport'); R.start(0); R.clearTraffic(); const c0 = R.state().coins; R.placeCoin(10, 0); R.placeCoin(14, 0); R.step(60 * 2); out.sportCoins = R.state().coins - c0;
  R.setCar('chorizotruck'); R.start(0); R.clearTraffic(); R.setLat(0); out.veh = R.vehicle(); out.chorizo = R.ammo().chorizo;
  const d0 = R.state().coins; R.placeCoin(10, 0); R.placeCoin(14, 0); R.step(60 * 2); out.truckCoins = R.state().coins - d0;
  await new Promise((r) => setTimeout(r, 700)); out.btn = !document.getElementById('btnChorizo').classList.contains('hidden');
  R.setCar('sport');
  return out;
});
check('the chorizo truck is a big van that starts with a chorizo missile', truck.veh.id === 'chorizotruck' && truck.veh.len > 5 && truck.chorizo === 1 && truck.btn, JSON.stringify(truck));
check('every sausage is worth double on the chorizo truck', truck.truckCoins === truck.sportCoins * 2 && truck.sportCoins > 0, `sport=${truck.sportCoins} truck=${truck.truckCoins}`);
const choose = await page.evaluate(async () => {
  const R = RingRush, out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (s) => document.querySelector(s);
  const s0 = JSON.parse(localStorage.getItem('ringrush.v1')); s0.ctlChosen = false; s0.ctl = 'tilt'; s0.pods = { ring: 1, sausage: 1, clover: 1 }; localStorage.setItem('ringrush.v1', JSON.stringify(s0)); location.hash = '';
  return out;
});
await page.reload(); await page.waitForFunction(() => window.RingRush, null, { timeout: 20000 }); await page.waitForTimeout(500);
await page.click('#btnPlay'); await page.waitForTimeout(300); await page.click('#tList .tk:nth-child(1)'); await page.waitForTimeout(300);
const ask = await page.evaluate(() => ({ pick: !document.getElementById('ctlPick').classList.contains('hidden'), racing: RingRush.race().grid > 0 }));
check('first race: asks for the control style and waits for the answer', ask.pick && !ask.racing, JSON.stringify(ask));
await page.click('#pickTilt'); await page.waitForFunction(() => !document.getElementById('tiltFail').classList.contains('hidden'), null, { timeout: 15000 }).catch(() => {});
const noSensor = await page.evaluate(() => ({ failShown: !document.getElementById('tiltFail').classList.contains('hidden'), held: RingRush.race().grid > 0, chosen: RingRush.ctlChosen() }));
check('tilt chosen but no sensor: the race waits and asks, instead of silently switching', noSensor.chosen && noSensor.failShown && noSensor.held, JSON.stringify(noSensor));
await page.click('#btnTiltTouch'); await page.waitForTimeout(800);
const switched = await page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem('ringrush.v1')).ctl, hidden: document.getElementById('tiltFail').classList.contains('hidden') }));
check('choosing finger swipe from that notice saves it and the race goes on', switched.saved === 'touch' && switched.hidden, JSON.stringify(switched));
await page.evaluate(() => RingRush.step(60 * 5));
await page.evaluate(() => document.getElementById('btnPause').click()); await page.waitForTimeout(200);
await page.click('#btnTracks1'); await page.waitForTimeout(300);
const nav1 = await page.evaluate(() => ({ tracks: !document.getElementById('tracks').classList.contains('hidden'), cards: document.querySelectorAll('#tList .tk').length, unlocked: document.querySelectorAll('#tList .tk:not(.lock)').length }));
check('from the pause screen I can go to the track list and pick another track', nav1.tracks && nav1.cards === 4 && nav1.unlocked === 4, JSON.stringify(nav1));
await page.click('#tList .tk:nth-child(3)'); await page.waitForTimeout(500);
const onClover = await page.evaluate(() => ({ id: RingRush.trackInfo().id, grid: RingRush.race().grid > 0, rivals: RingRush.rivals().length }));
check('a different track starts on the grid with the chosen control style (no new question)', onClover.id === 'clover' && onClover.grid && onClover.rivals === 5, JSON.stringify(onClover));
await page.evaluate(() => { RingRush.step(60 * 6); document.getElementById('btnPause').click(); });
await page.click('#btnRestart'); await page.waitForTimeout(500);
const rest = await page.evaluate(() => ({ id: RingRush.trackInfo().id, grid: RingRush.race().grid > 0, rivals: RingRush.rivals().length }));
check('restart from pause starts a proper race again on the same track', rest.id === 'clover' && rest.grid && rest.rivals === 5, JSON.stringify(rest));
await page.evaluate(() => { RingRush.step(60 * 6); document.getElementById('btnPause').click(); });
await page.click('#btnMenu1'); await page.waitForTimeout(300);
check('from the pause screen I can return to the main menu', await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden') && RingRush.state().state === 'menu'));
await page.evaluate(() => { RingRush.setCtl('touch'); });
console.log('\n== username login, saved progress and leaderboard (mocked server) ==');
const server = new Map();
await page.route('**/api/**', async (route) => {
  const u = new globalThis.URL(route.request().url()), json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (u.pathname.endsWith('/api/leaderboard')) return json({ ok: true, rows: [...server.entries()].map(([n, v]) => ({ n, t: v.trophies | 0, w: 0, r: 0, at: 0 })).sort((a, b) => b.t - a.t) });
  if (route.request().method() === 'POST') { const b = JSON.parse(route.request().postData()); server.set(b.u, b.save); return json({ ok: true, name: b.u }); }
  const name = u.searchParams.get('u'); return json({ ok: true, exists: server.has(name), save: server.get(name) || null, name });
});
await page.evaluate(() => { document.getElementById('over').classList.add('hidden'); RingRush.setCtl('touch'); const s = JSON.parse(localStorage.getItem('ringrush.v1')); s.coins = 777; s.trophies = 45; localStorage.setItem('ringrush.v1', JSON.stringify(s)); location.reload(); });
await page.waitForFunction(() => window.RingRush, null, { timeout: 20000 });
await page.waitForTimeout(500);
await page.click('#mUser'); await page.fill('#loginName', 'שחר'); await page.click('#btnLogin'); await page.waitForTimeout(800);
const lg1 = await page.evaluate(() => ({ chip: document.getElementById('mUser').textContent, user: JSON.parse(localStorage.getItem('ringrush.v1')).user, menu: !document.getElementById('menu').classList.contains('hidden') }));
await page.waitForTimeout(500);
check('a new username is created and shown on the menu', lg1.user === 'שחר' && lg1.chip.includes('שחר') && lg1.menu, JSON.stringify(lg1));
check('the new player\'s progress was uploaded to the server', server.has('שחר') && server.get('שחר').trophies === 45 && !('user' in server.get('שחר')), JSON.stringify(server.get('שחר') && { c: server.get('שחר').coins, t: server.get('שחר').trophies }));
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ringrush.v1')); s.coins = 12; s.trophies = 0; s.user = ''; localStorage.setItem('ringrush.v1', JSON.stringify(s)); location.reload(); });
await page.waitForFunction(() => window.RingRush, null, { timeout: 20000 });
await page.waitForTimeout(500);
await page.click('#mUser'); await page.fill('#loginName', 'שחר'); await page.click('#btnLogin'); await page.waitForTimeout(900);
const lg2 = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ringrush.v1')); return { coins: s.coins, trophies: s.trophies, user: s.user }; });
check('logging in with the same name on a fresh device restores coins and league', lg2.coins === 777 && lg2.trophies === 45 && lg2.user === 'שחר', JSON.stringify(lg2));
await page.evaluate(() => { RingRush.setUp('sight', 0); RingRush.startRace(0); RingRush.step(60 * 4.4); RingRush.clearTraffic(); const L = RingRush.race().L; RingRush.setLaps(2); RingRush.setDist(3 * L - 40); for (let i = 0; i < 60 * 8 && !RingRush.race().finished; i++) RingRush.step(1); RingRush.step(60 * 5); });
await page.waitForTimeout(2500);
check('a finished race is synced to the server under the username', server.get('שחר') && server.get('שחר').trophies >= 75, 'server trophies=' + (server.get('שחר') && server.get('שחר').trophies));
await page.evaluate(() => document.getElementById('btnMenu2').click());
await page.click('#btnBoard'); await page.waitForTimeout(700);
const board = await page.evaluate(() => ({ rows: document.querySelectorAll('#bList .br').length, me: document.querySelectorAll('#bList .br.me').length, first: document.querySelector('#bList .br')?.textContent || '' }));
check('the leaderboard lists players and highlights me', board.rows >= 1 && board.me === 1 && board.first.includes('שחר'), JSON.stringify(board));
await page.click('#btnBoardBack');
await page.unroute('**/api/**');
await page.route('**/api/**', (r) => r.abort());
await page.click('#mUser'); await page.fill('#loginName', 'אורח'); await page.click('#btnLogin'); await page.waitForTimeout(800);
const offMsg = await page.evaluate(() => ({ msg: document.getElementById('loginMsg').textContent, still: !document.getElementById('login').classList.contains('hidden'), user: JSON.parse(localStorage.getItem('ringrush.v1')).user }));
check('no network: login says so, keeps local progress and the old user', offMsg.msg.includes('חיבור') && offMsg.still && offMsg.user === 'שחר', JSON.stringify(offMsg));
await page.click('#btnLoginBack'); await page.unroute('**/api/**');

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


console.log('\n== truck speed, animal paints, look options and the Gabi discount ==');
const look = await page.evaluate(() => {
  const R = RingRush, out = {};
  R.setCar('sport'); const sport = R.vehicle().topSpeed; R.setCar('chorizotruck'); out.truckVsOld = R.vehicle().topSpeed / 0.94;
  out.sport = sport;
  out.pats = [6, 7, 8, 9].map((p) => { R.setLook(p, 0, 0); const l = R.look(); return l.pat * 1000 + (l.marked > 100 ? 1 : 0); });
  R.setCar('sport'); R.setLook(0, 2, 3); out.stripe = R.look();
  R.setUser(''); out.full = R.price(2600); R.setUser('גבי'); out.gabi = R.price(2600); out.gabiSmall = R.price(60); out.gabiLatin = (R.setUser('Gabi'), R.price(1000)); R.setUser('גבי2'); out.other = R.price(1000); R.setUser('');
  R.setLook(0, 0, 0);
  return out;
});
check('chorizo truck is 30% faster than before', Math.abs(look.truckVsOld - 1.3) < 0.01 && look.sport === 1, JSON.stringify(look));
check('four animal/camo paints are painted through the shader', look.pats.join() === '1001,2001,3001,4001', JSON.stringify(look.pats));
check('racing stripes are applied', look.stripe.st === 2, JSON.stringify(look.stripe));
check('the user Gabi pays 10% of upgrade prices, everyone else full price', look.full === 2600 && look.gabi === 260 && look.gabiSmall === 6 && look.gabiLatin === 100 && look.other === 1000, JSON.stringify(look));

console.log('\n== WhatsApp share from the home screen ==');
const shareHome = await page.evaluate(() => {
  let got = null; const orig = window.open; window.open = (u) => { got = u; return {}; };
  RingRush.setUser('גבי'); document.querySelector('#btnShareHome').click(); window.open = orig; RingRush.setUser('');
  return { got, vis: !!document.querySelector('#btnShareHome').offsetParent || true };
});
check('home screen has a WhatsApp share button that opens wa.me with the game link', !!shareHome.got && shareHome.got.startsWith('https://wa.me/?text=') && decodeURIComponent(shareHome.got).includes('chorizo-brothers.vercel.app') && decodeURIComponent(shareHome.got).includes('Chorizo Chase'), String(shareHome.got).slice(0, 120));

check('no page errors / shader errors', errors.length === 0, errors.slice(0, 3).join(' / '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILED:\n - ' + failed.map((f) => f.name).join('\n - ')); process.exit(1); }
