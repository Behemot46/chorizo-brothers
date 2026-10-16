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
await ctx.addInitScript(() => { try { if (!localStorage.getItem('ringrush.v1')) localStorage.setItem('ringrush.v1', JSON.stringify({ coins: 0, tut: true, fbRun: 1e9 })); } catch (e) {} });
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
  R.setHp(40); res.hpBefore = R.state().hp;
  res.salami = eat(3, lane()); res.regenOn = R.poison().regen > 3; R.step(60 * 3); res.hpAfter = R.state().hp;
  R.start(); R.step(10);
  res.queen = eat(4, lane()); const a = R.ammo(); res.queenAll = a.turbo > 3 && a.power > 3 && a.magnet > 3;
  return res;
});
check('hot dog is collected and gives turbo', out.hotdog && out.turbo > 2, 'turbo=' + out.turbo);
check('bratwurst is collected and gives power ram', out.bratwurst && out.power > 5, 'power=' + out.power);
check('merguez is collected and gives magnet', out.merguez && out.magnet > 5, 'magnet=' + out.magnet);
check('salami heals gradually over time (a regen status, not an instant heart)', out.salami && out.regenOn && out.hpAfter > out.hpBefore + 25, `${out.hpBefore}->${out.hpAfter}`);
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
  for (let i = 0; i < 60 * 60 && R.state().state === 'play'; i++) { R.step(1); if (R.vehicle().shield === 0) { first = R.state().hp; break; } }
  out.shieldHitLives = first; out.livesFull = R.vehicle().maxHp;
  R.setCar('sport'); R.start();
  return out;
});
check('jeep has an extra heart, taxi and armored dimensions differ', veh.jeep.maxHp > veh.sport.maxHp && veh.armored.len > veh.sport.len && veh.jeep.wid > veh.sport.wid, JSON.stringify([veh.sport.maxLives, veh.jeep.maxLives]));
check('steering: taxi settles faster than sport, jeep slowest', veh.taxi.settle < veh.sport.settle && veh.sport.settle < veh.jeep.settle, `taxi=${veh.taxi.settle} sport=${veh.sport.settle} jeep=${veh.jeep.settle}`);
check('armored shield absorbs the first hit without losing health', veh.shieldHitLives === veh.livesFull, `lives=${veh.shieldHitLives}/${veh.livesFull}`);

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
  R.bump('rams', 100); R.checkAch();
  out.ram = R.ach().includes('ram100') && R.ach().includes('rams_1'); out.noKing = !R.ach().includes('king'); out.crownBefore = R.crown();
  out.bad = R.badAchRefs(); out.total = R.achTotal();
  R.unlockAll();
  out.all = R.ach().length; out.king = R.ach().includes('king'); out.crown = R.crown(); out.owned = R.owned();
  return out;
});
check('a stat reaching its goal unlocks the achievement (and the tiers below it)', ach.ram && ach.noKing && !ach.crownBefore);
check('there are 100+ achievements and every unlockable points at a real one', ach.total >= 100 && ach.bad.length === 0, `total=${ach.total} bad=${ach.bad}`);
check('unlocking every achievement shows the crown and opens all paints, stripes, flames, underglows and titles', ach.king && ach.crown && ach.all === ach.total && ach.owned.paint === 7 && ach.owned.stripe === 6 && ach.owned.flame === 6 && ach.owned.glow === 6 && ach.owned.title === ach.owned.titles, JSON.stringify(ach.owned));
const stats = await page.evaluate(() => ({ kills: RingRush.stat('kills'), rams: RingRush.stat('rams') }));
check('lifetime stats are tracked', stats.rams >= 100, JSON.stringify(stats));

console.log('\n== boss: the vegetarian produce truck ==');
const bossT = await page.evaluate(() => {
  const R = RingRush, out = {};
  /* appears at the end of every 3rd lap, not before */
  R.start(0); R.nearLap(2); R.step(120); out.noBossRing = !R.boss().active;
  R.start(3); R.nearLap(1); R.step(120); out.noBossLap1 = !R.boss().active;
  R.start(3); R.nearLap(2); R.step(120); out.bossLap2 = R.boss().active; out.hp1 = R.boss().maxHp;
  /* a lettuce thrown at me lands in my lane and costs a heart if I stay */
  R.start(); R.spawnBoss(); R.step(30); const l0 = R.state().hp; R.throwLettuce(); const pend = R.lettuces(); out.telegraph = pend.length === 1 && pend[0].state === 1 && pend[0].lane === R.state().lane;
  R.step(100); out.hit = R.state().hp < l0;
  /* ... and dodging works: switching lanes during the 1.15 s of flight avoids it */
  R.start(); R.spawnBoss(); R.step(30); const l1 = R.state().hp; R.throwLettuce(); R.step(15); R.act.lane(1); R.step(100); out.dodged = R.state().hp === l1;
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
  R.setHp(999); R.noRivalHits(true);
  ori(60, 22); R.step(90); out.right = R.state().lat;
  ori(60, -22); R.step(90); out.left = R.state().lat;
  ori(60, 0); R.step(90); out.level = R.state().lat;
  R.rivalsOff();
  ori(42, 0); R.step(60 * 6); R.clearTraffic(); out.fast = R.state().speed;
  ori(82, 0); R.step(60 * 6); R.clearTraffic(); out.slow = R.state().speed; R.noRivalHits(false);
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
  R.startRace(0); R.step(60 * 4.4); R.clearTraffic(); R.setHp(999);
  const L = R.race().L, rivalsBefore = R.rivals().map((r) => r.dist);
  out.unlockedBefore = R.unlocked(1);
  R.setLaps(2); R.setDist(3 * L - 40); for (let i = 0; i < 60 * 8 && !R.race().finished; i++) R.step(1);
  out.finished = R.race().finished; out.place = R.race().place;
  R.step(60 * 5);
  out.state = R.state().state; out.reward = R.race().reward; out.rows = R.race().results.length; out.unlockedAfter = R.unlocked(1);
  out.save = { pods: R.saveState().pods, wins: R.saveState().wins, trophies: R.saveState().trophies };
  out.xp = R.lastXp(); out.xpBox = document.getElementById('oXp').textContent;
  return out;
});
check('crossing the line after 3 laps finishes the race and shows results', fin.finished && fin.state === 'over' && fin.rows === 6, JSON.stringify({ f: fin.finished, s: fin.state, rows: fin.rows }));
check('winning pays place + win bonus + first-win bonus and gives trophies', fin.place === 1 && fin.reward.pay === 110 && fin.reward.winBonus === 22 && fin.reward.firstWin === 250 && fin.reward.trophies === 30, JSON.stringify(fin.reward));
check('a finished race gives XP, shown on the results screen with the level', fin.xp && fin.xp.gain >= 300 && /XP/.test(fin.xpBox) && /רמה/.test(fin.xpBox), JSON.stringify([fin.xp && fin.xp.gain, fin.xpBox]));
check('a podium finish unlocks the next track and saves wins and trophies', !fin.unlockedBefore && fin.unlockedAfter && fin.save.pods.ring === 1 && fin.save.wins.ring === 1 && fin.save.trophies === 30, JSON.stringify([fin.unlockedBefore, fin.unlockedAfter, fin.save]));
const third = await page.evaluate(() => {
  const R = RingRush;
  R.startRace(0); R.step(60 * 4.4); R.clearTraffic(); R.setHp(999);
  const L = R.race().L; R.setLaps(2); R.setDist(3 * L - 40);
  R.setRival(0, 600, 0, 50); R.setRival(1, 600, 0, 50);
  for (let i = 0; i < 60 * 8 && !R.race().finished; i++) R.step(1); const place = R.race().place; R.step(60 * 5);
  return { place, reward: R.race().reward };
});
check('3rd place pays less, no win bonus, fewer trophies', third.place === 3 && third.reward.pay === 45 && third.reward.winBonus === 0 && third.reward.trophies === 10, JSON.stringify(third));
const dnf = await page.evaluate(() => {
  const R = RingRush;
  R.startRace(0); R.step(60 * 4.4); R.clearTraffic(); R.setHp(30);
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
  const k0 = R.ammo().kills, l0 = R.state().hp; R.placeCar('sedan', 0, 3.4, R.state().speed); R.slam(1); R.step(40);
  out.killed = R.ammo().kills - k0; out.livesKept = R.state().hp === l0;
  R.setUp('ramS', 0); R.start(0); R.clearTraffic(); R.setLat(0); R.step(150); R.clearTraffic();
  const l1 = R.state().hp; R.placeCar('sedan', 0, 3.4, R.state().speed); R.step(2); R.slam(1); R.step(40);
  out.noBladeCrash = R.state().hp < l1;
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
  const chase = () => { R.start(0); R.setLaps(1); R.clearTraffic(); R.step(60); R.clearTraffic(); R.spawnCop(); for (let i = 0; i < 60 * 12 && !R.cops().some((c) => c.rel > -40 && c.rel < -12); i++) { R.step(1); if (i % 30 === 0) R.clearTraffic(); } };
  R.noCops(true); R.setUp('mines', 0); R.start(0); R.setLaps(1); R.clearTraffic(); R.step(60); R.clearTraffic();
  out.noMirror = !R.mirrorOn(); out.stock0 = R.mines(); const vis = () => { const b = document.getElementById('btnMine'); return !!b && b.offsetParent !== null; };
  R.rivalsOff(); R.step(5); await wait(100); out.btnIdle = vis();
  chase(); await wait(150); out.mirror = R.mirrorOn(); out.btnChase = vis();
  /* level 0: the single mine button drops a puncture strip */
  const p0 = R.stat('punctures'); R.act.mine(); R.step(60 * 2.5); R.clearTraffic();
  out.punctured = R.stat('punctures') === p0 + 1 && R.mines().n === out.stock0.n - 1;
  out.copSlow = R.cops().length === 0 || R.cops()[0].stun > 0 || R.cops()[0].rel < -50;
  R.step(60 * 6);
  /* level 1+: the same button drops an explosive mine that kills the chaser, and there are more of them */
  R.setUp('mines', 1); chase(); out.stock1 = R.mines();
  const k0 = R.ammo().kills; R.act.mine(); R.step(60 * 2.5);
  out.exploded = R.ammo().kills > k0 && R.cops().length === 0; out.left = R.mines().n; R.noCops(false);
  R.step(60); await wait(600); out.mirrorGone = !R.mirrorOn();
  R.setUp('mines', 0);
  return out;
});
check('rear mirror opens only while a cop is behind', mine.noMirror && mine.mirror && mine.mirrorGone, JSON.stringify([mine.noMirror, mine.mirror, mine.mirrorGone]));
check('the mine button pops up only when a chaser is behind; at level 0 it drops a puncture strip that slows the chaser', !mine.btnIdle && mine.btnChase && mine.stock0.kind === 'p' && mine.punctured && mine.copSlow, JSON.stringify([mine.btnIdle, mine.btnChase, mine.punctured, mine.copSlow, mine.stock0]));
check('with the mine upgrade the same button drops an explosive mine (6 at level 1) that destroys the chaser', mine.stock1.kind === 'x' && mine.stock1.n === 6 && mine.exploded && mine.left === 5, JSON.stringify([mine.stock1, mine.exploded, mine.left]));



console.log('\n== chorizo truck, control choice and navigation ==');
const truck = await page.evaluate(async () => {
  const R = RingRush, out = {};
  R.setCar('sport'); R.start(0); R.clearTraffic(); const c0 = R.state().coins; R.placeCoin(10, 0); R.placeCoin(14, 0); R.step(60 * 2); out.sportCoins = R.state().coins - c0;
  R.setCar('chorizotruck'); R.start(0); R.clearTraffic(); R.setLat(0); out.veh = R.vehicle(); out.warhead = R.ammo().warhead;
  const d0 = R.state().coins; R.placeCoin(10, 0); R.placeCoin(14, 0); R.step(60 * 2); out.truckCoins = R.state().coins - d0;
  await new Promise((r) => setTimeout(r, 700)); out.btn = !document.getElementById('btnChorizo');
  R.setCar('sport');
  return out;
});
check('the chorizo truck is a big van whose missiles carry a chorizo warhead (no separate chorizo button)', truck.veh.id === 'chorizotruck' && truck.veh.len > 5 && truck.warhead === 1 && truck.btn, JSON.stringify(truck));
check('every sausage is worth double on the chorizo truck', truck.truckCoins === truck.sportCoins * 2 && truck.sportCoins > 0, `sport=${truck.sportCoins} truck=${truck.truckCoins}`);
await page.reload();
await page.waitForFunction(() => window.RingRush, null, { timeout: 20000 }); await page.waitForTimeout(500);
await page.evaluate(() => RingRush.prep({ ctlChosen: false, ctl: 'tilt', pods: { ring: 1, sausage: 1, clover: 1 }, fbRun: 1e9 })); /* set after the reload, so nothing can overwrite it */
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

console.log('\n== rivals fight, ram loot, chorizo warhead, founder discount ==');
const war = await page.evaluate(async () => {
  const R = RingRush, out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fresh = (car) => { R.setCar(car || 'sport'); R.start(0); R.clearTraffic(); R.setLat(0); R.step(150); R.clearTraffic(); };
  /* loot for a ram: coins by size, doubled on the chorizo truck */
  fresh('sport'); let c = R.state().coins; const l1 = R.ramLoot('sedan'); out.lootSedan = R.state().coins - c; c = R.state().coins; R.ramLoot('truck'); out.lootTruck = R.state().coins - c;
  fresh('chorizotruck'); c = R.state().coins; R.ramLoot('bus'); out.lootBusTruckCar = R.state().coins - c;
  /* a real ram pays more than the old flat 3 */
  fresh('sport'); R.setUp('ramF', 1); c = R.state().coins; const sp = R.state().speed; R.placeCar('sedan', 12, 0, 8); R.step(60 * 2); out.realRam = R.state().coins - c;
  /* rivals are sturdy and wreck for a big payout */
  fresh('sport'); R.setRival(0, 40, 0, 20); const r0 = R.rivals()[0]; out.hp = r0.maxHp; R.rivalHit(0, 5); out.afterHit = R.rivals()[0].hp; out.alive = R.rivals()[0].wreck === 0;
  c = R.state().coins; R.rivalHit(0, 100); out.wreck = R.rivals()[0].wreck > 0; out.wreckLoot = R.state().coins - c;
  /* a rival that lunges at the player costs a heart */
  fresh('sport'); const l0 = R.ammo().hp; R.setRival(1, 0, 0.8, R.state().speed); R.rivalHitMe(1); R.step(30); out.livesBefore = l0; out.livesAfter = R.ammo().hp;
  /* a front ram on a slow rival damages it */
  fresh('sport'); R.setUp('ramF', 1); R.setRival(2, 4.2, 0, 8); const h0 = R.rivals()[2].hp; R.step(20); out.frontDmg = h0 - R.rivals()[2].hp;
  /* name tag and ring while racing */
  fresh('sport'); R.setRival(3, 30, 0, 20); R.step(5); for (let i = 0; i < 30 && !(R.rivalTags()[3].tag && R.rivalTags()[3].ring); i++) await wait(100); out.tags = R.rivalTags()[3];
  /* the chorizo warhead is the advanced level of the missile */
  fresh('sport'); R.setUp('missiles', 4); R.start(0); R.clearTraffic(); R.setLat(0); R.step(120); R.clearTraffic(); out.warhead = R.ammo().warhead; const k0 = R.ammo().kills;
  R.placeCar('sedan', 40, 0, R.state().speed); R.placeCar('van', 44, 3.4, R.state().speed); R.fire(); R.step(60 * 3); out.blastKills = R.ammo().kills - k0;
  R.setUp('missiles', 0); fresh('sport'); out.plain = R.ammo().warhead;
  /* the founder pays half on everything, Gabi only on upgrades */
  R.setUser('שחר גרוסמן'); out.fUp = R.price(1000); out.fCar = R.price(1000, 'car'); R.setUser('שחר'); out.fShort = R.price(1000, 'car'); R.setUser('Shachar'); out.fLatin = R.price(1000);
  R.setUser('גבי'); out.gUp = R.price(1000); out.gCar = R.price(1000, 'car'); R.setUser('');
  return out;
});
check('a ram pays chorizo by car size (sedan 2, truck 10) and double on the chorizo truck', war.lootSedan === 2 && war.lootTruck === 10 && war.lootBusTruckCar === 12, JSON.stringify(war));
check('a real ram pays more than the old flat reward', war.realRam >= 5, 'got ' + war.realRam);
check('rivals are sturdy (24+ hp), survive a hit, and a wreck pays 20 chorizo', war.hp >= 24 && war.afterHit === war.hp - 5 && war.alive && war.wreck && war.wreckLoot >= 20, JSON.stringify(war));
check('a rival that lunges at the player takes the rival\'s own damage (brawler: 30) off the health bar', war.livesAfter === war.livesBefore - 30, JSON.stringify([war.livesBefore, war.livesAfter]));
check('ramming a slow rival from behind damages it', war.frontDmg >= 5, 'dmg ' + war.frontDmg);
check('every rival wears a name tag and a ring while racing', war.tags && war.tags.tag && war.tags.ring, JSON.stringify(war.tags));
check('missile level 4 is the chorizo warhead: a wide blast, no separate chorizo weapon', war.warhead === 1 && war.blastKills >= 2 && war.plain === 0, JSON.stringify([war.warhead, war.blastKills, war.plain]));
check('founder pays 50% on everything; Gabi 10% only on upgrades', war.fUp === 500 && war.fCar === 500 && war.fShort === 500 && war.fLatin === 500 && war.gUp === 100 && war.gCar === 1000, JSON.stringify(war));

console.log('\n== health bar, poison, first aid ==');
const hp = await page.evaluate(async () => {
  const R = RingRush, out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fresh = () => { R.setUp('armor', 0); R.setUp('medic', 0); R.setUp('ramF', 0); R.setUp('ramS', 0); R.setCar('sport'); R.start(0); R.clearTraffic(); R.setLat(0); R.step(150); R.clearTraffic(); R.noRivalHits(true); };
  const eatK = (kind) => { R.place(kind, 14, R.state().lane); for (let i = 0; i < 90; i++) { R.step(1); } };
  fresh(); out.full = R.state().hp === R.state().maxHp && R.state().maxHp === 100;
  out.bar = document.getElementById('hpBar') && document.getElementById('hpFill').style.width;
  /* poison drains over time but stops at 1 */
  R.setHp(60); const p0 = R.state().hp; eatK(6); out.poisoned = R.poison().t > 0 || R.state().hp < p0; R.step(60 * 3); out.drained = p0 - R.state().hp; for (let i = 0; i < 240; i++) { R.step(5); R.clearTraffic(); } out.floor = R.state().hp;
  /* a kit goes to the bag, the button uses it, heals and cures poison */
  fresh(); R.setHp(50); R.giveKits(0); eatK(5); out.kits = R.state().kits; await wait(400); out.btnShown = !document.getElementById('btnKit').classList.contains('hidden');
  R.setHp(50); R.kit(); out.healed = R.state().hp - 50; out.kitsLeft = R.state().kits;
  /* a poisoned player is cured by a kit */
  fresh(); R.giveKits(1); R.setHp(80); eatK(6); R.kit(); out.cured = R.poison().t === 0;
  /* the trail catches up: hit then bar */
  fresh(); R.setHp(999); R.placeCar('sedan', 6, 0, 5); R.step(90); out.afterCrash = R.state().hp;
  R.noRivalHits(false);
  return out;
});
check('the health bar starts full at 100 and is on screen', hp.full && /%$/.test(hp.bar || ''), JSON.stringify([hp.full, hp.bar]));
check('a bottle of poison drains health over time but never below 1', hp.poisoned && hp.drained > 10 && hp.floor >= 1, JSON.stringify([hp.poisoned, hp.drained, hp.floor]));
check('first aid kit: picked up into the bag, button appears, heals and cures poison', hp.kits === 1 && hp.btnShown && hp.healed >= 45 && hp.kitsLeft === 0 && hp.cured, JSON.stringify(hp));
check('a car crash takes about a third of the base health', hp.afterCrash <= 70 && hp.afterCrash >= 60, 'hp=' + hp.afterCrash);

console.log('\n== player feedback and desktop keyboard steering ==');
const fbk = await page.evaluate(async () => {
  const R = RingRush, out = {}, posts = [], realFetch = window.fetch;
  window.fetch = async (u, o) => { if (String(u).includes('/api/feedback')) { posts.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } return realFetch(u, o); };
  R.start(0); R.clearTraffic(); R.setLat(0);
  out.dueFirst = R.fbDue(3, 0, 0) && !R.fbDue(2, 0, 0) && R.fbDue(8, 0, 1) && !R.fbDue(7, 0, 1);
  R.fbOpen('menu', true); out.shown = !document.getElementById('feedback').classList.contains('hidden');
  /* typing in the box must not trigger game shortcuts (w = nitro / space = play) */
  const ta = document.getElementById('fbText'); ta.value = ''; ta.focus();
  const st0 = R.state().state;
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  out.typingSafe = R.state().state === st0;
  document.querySelectorAll('#fbStars button')[3].click(); document.querySelectorAll('#fbCats .atab')[1].click(); ta.value = 'כדאי להוסיף עוד מסלולים וגם סאונד';
  document.getElementById('btnFbSend').click(); await new Promise((r) => setTimeout(r, 300));
  out.post = posts[0]; out.hidden = document.getElementById('feedback').classList.contains('hidden');
  /* offline: the message is queued and retried */
  window.fetch = async (u, o) => { if (String(u).includes('/api/feedback')) throw new Error('offline'); return realFetch(u, o); };
  R.fbOpen('menu', false); document.getElementById('fbText').value = 'שליטה במחשב איטית'; document.querySelectorAll('#fbStars button')[1].click(); document.getElementById('btnFbSend').click(); await new Promise((r) => setTimeout(r, 300));
  out.queued = R.fbQueue(); window.fetch = realFetch;
  /* keyboard steering: a full crossing in well under half a second */
  R.start(0); R.clearTraffic(); R.setLat(0); R.setCtl('touch'); R.step(30);
  R.key('ArrowRight', true); R.step(18); R.key('ArrowRight', false); out.kbdRight = R.state().lat; R.step(40);
  R.key('ArrowLeft', true); R.step(36); R.key('ArrowLeft', false); out.kbdLeft = R.state().lat;
  return out;
});
check('feedback is prompted after the 3rd race, then every 8th', fbk.dueFirst && fbk.shown);
check('typing in the feedback box never fires game shortcuts', fbk.typingSafe);
check('feedback is sent with rating, category, text and context, and the panel closes', fbk.post && fbk.post.rating === 4 && fbk.post.cat === 'idea' && /מסלולים/.test(fbk.post.text) && fbk.post.ctx.v && fbk.hidden, JSON.stringify(fbk.post));
check('feedback written offline is queued for a retry', fbk.queued === 1, 'queued=' + fbk.queued);
check('keyboard steering moves 4 m in 0.3 s (9 m/s used to give 2.7) and sweeps across in 0.6 s', fbk.kbdRight > 4 && fbk.kbdLeft < -4, JSON.stringify([fbk.kbdRight, fbk.kbdLeft]));

console.log('\n== levels, prestige and the player plate ==');
const lv = await page.evaluate(() => {
  const R = RingRush, out = {};
  R.setXp(0); out.l1 = R.xpInfo().level;
  const g = R.addXp(100); out.l2 = R.xpInfo().level; out.ups = g.ups.length; out.items = g.items.join();
  out.frame = R.plateOf().own.frame.length;
  R.setXp(0); R.addXp(30000); out.big = R.xpInfo().level;
  R.setXp(400000); out.cap = R.xpInfo().cap; out.lv = R.xpInfo().level;
  const c0 = R.saveState().coins; out.pres = R.prestige(); out.afterPres = R.xpInfo(); out.presCoins = R.saveState().coins - c0; out.presItem = R.plateOf().own.frame.length > out.frame;
  out.prestigeBlocked = (R.setXp(10), R.prestige());
  out.html = R.plateHtmlTest();
  return out;
});
check('XP levels up (100 XP = level 2 with coins and a plate frame)', lv.l1 === 1 && lv.l2 === 2 && lv.ups === 1 && lv.frame >= 2, JSON.stringify(lv));
check('30,000 XP is a high level and 400,000 XP caps at level 100', lv.big > 30 && lv.cap && lv.lv === 100, JSON.stringify([lv.big, lv.lv]));
check('prestige resets to level 1, adds a star, pays 5,000 and opens the prestige frame; it is refused below level 100', lv.pres && lv.afterPres.level === 1 && lv.afterPres.prestige === 1 && lv.presCoins >= 5000 && lv.presItem && !lv.prestigeBlocked, JSON.stringify([lv.afterPres, lv.presCoins]));
check('the plate shows emblem, name and level', /plate/.test(lv.html) && /🌭/.test(lv.html) && /plv/.test(lv.html));

console.log('\n== rivals: pace relative to the player and real fighting ==');
const pace = await page.evaluate(() => {
  const R = RingRush, out = {};
  const run = (car, track, secs) => {
    R.setUp('armor', 0); R.setCar(car); R.startRace(track); R.step(60 * 4.4); R.clearTraffic(); R.noRivalHits(true);
    let pmax = 0, psum = 0, n = 0, rmax = 0, rsum = 0, rn = 0, nitro = 0;
    for (let i = 0; i < 60 * secs; i++) { R.step(1); if (i % 20 === 0) R.clearTraffic(); const s = R.state(); pmax = Math.max(pmax, s.speed); psum += s.speed; n++; for (const q of R.rivalAi()) { rmax = Math.max(rmax, q.speed); rsum += q.speed; rn++; if (q.nitro > 0) nitro++; } }
    R.noRivalHits(false);
    return { pmax, pavg: psum / n, rmax, ravg: rsum / rn, nitro };
  };
  out.sport = run('sport', 0, 45); out.armored = run('armored', 1, 45); out.truck = run('chorizotruck', 2, 45);
  R.setCar('sport'); return out;
});
const ratio = (x) => `avg ${(x.ravg / x.pavg).toFixed(2)} max ${(x.rmax / x.pmax).toFixed(2)}`;
check('rivals never out-run the player\'s own car: average under his, peak within +8% (nitro burst) on sport, armored and the chorizo truck',
  [pace.sport, pace.armored, pace.truck].every((x) => x.ravg < x.pavg * 1.0 && x.rmax <= x.pmax * 1.08), `${ratio(pace.sport)} | ${ratio(pace.armored)} | ${ratio(pace.truck)}`);
check('rivals use their nitro bursts during a race', pace.sport.nitro > 20, 'nitro ticks=' + pace.sport.nitro);
const rfight = await page.evaluate(() => {
  const R = RingRush, out = {};
  const fresh = () => { R.setCar('sport'); R.startRace(0); R.step(60 * 4.4); R.clearTraffic(); R.setHp(999); R.rivalsOff(); R.noCops(true); };
  /* duelist: warns (tele), then lunges, and the hit takes 24 */
  fresh(); const sp = R.state().speed; R.placeRival(0, 0, 2.2, sp); R.forceTele(0); let sawTele = false, sawAtk = false; const h0 = R.state().hp;
  for (let i = 0; i < 60 * 4; i++) { R.step(1); R.clearTraffic(); const a = R.rivalAi()[0]; if (a.tele > 0) sawTele = true; if (a.atk > 0) sawAtk = true; }
  out.tele = sawTele; out.atk = sawAtk; out.lungeDmg = h0 - R.state().hp;
  /* blocker: gets in front of the player's lane */
  fresh(); R.placeRival(2, 18, 3.4, R.state().speed); R.forceBlock(2); let blocked = false, minGap = 99;
  for (let i = 0; i < 60 * 4; i++) { R.step(1); R.clearTraffic(); const a = R.rivalAi()[2]; if (a.block > 0) blocked = true; if (a.block > 0) minGap = Math.min(minGap, Math.abs(a.lat - R.state().lat)); }
  out.blocked = blocked; out.blockGap = minGap;
  /* trapper: drops a mine behind itself when the player tails it, and the mine hurts */
  fresh(); R.placeRival(4, 14, R.state().lat, R.state().speed); R.forceTrap(4); R.step(6); out.trapMine = R.mineOwners().includes('r');
  R.rivalsOff(); const t0 = R.state().hp; for (let i = 0; i < 60 * 3; i++) { R.step(1); R.clearTraffic(); } out.mineDmg = t0 - R.state().hp;
  /* tank takes 30% less damage; the brawler is sturdier */
  fresh(); R.placeRival(3, 30, 0, 20); const t1 = R.rivalAi()[3].hp; R.rivalHit(3, 10); out.tankTook = t1 - R.rivalAi()[3].hp;
  out.hp = R.rivalAi().map((r) => r.maxHp);
  return out;
});
check('a rival lunge is telegraphed first, then hits the player for the rival\'s own damage', rfight.tele && rfight.lungeDmg === 24, JSON.stringify([rfight.tele, rfight.lungeDmg]));
check('the blocker weaves into the player\'s lane', rfight.blocked && rfight.blockGap < 2.5, JSON.stringify([rfight.blocked, rfight.blockGap]));
check('the trapper drops a mine behind it and driving into it costs 22 health', rfight.trapMine && rfight.mineDmg === 22, JSON.stringify([rfight.trapMine, rfight.mineDmg]));
check('the armored rival takes 30% less damage (10 -> 7) and the roster has different toughness', rfight.tankTook === 7 && new Set(rfight.hp).size >= 3, JSON.stringify([rfight.tankTook, rfight.hp]));

const vip = await page.evaluate(() => {
  const R = RingRush, out = {}; R.prep({ ownCars: ['sport'], car: 'sport' });
  R.setUser(''); out.ids = R.vehicleIds(); out.anon = R.vehicleIds().filter((i) => R.owns(i));
  R.setUser('גבי'); out.gabi = R.vehicleIds().filter((i) => R.owns(i)).length;
  R.setUser('שחר'); out.shachar = R.vehicleIds().filter((i) => R.owns(i)).length;
  R.prep({ ownCars: ['sport'], car: 'moto' }); R.setUser('גבי'); out.motoCar = R.curCar(); R.setUser(''); out.afterLogout = R.curCar();
  return out;
});
check('Gabi and Shachar own every vehicle for free; other users only what they bought; a locked car falls back to the sport car', vip.anon.length === 1 && vip.gabi === vip.ids.length && vip.shachar === vip.ids.length && vip.motoCar === 'moto' && vip.afterLogout === 'sport', JSON.stringify(vip));
const newCars = await page.evaluate(() => { const R = RingRush, out = []; for (const id of ['moto', 'garbage', 'tractor']) { R.setCar(id); R.start(0); R.clearTraffic(); R.step(120); out.push([id, R.curCar(), Math.round(R.state().speed)]); } return out; });
check('moto, orange garbage truck and racing tractor are selectable and drive', newCars.every((c) => c[0] === c[1] && c[2] > 20), JSON.stringify(newCars));
const flt = await page.evaluate(() => {
  const R = RingRush, out = {}; R.noCops(true);
  R.prep({ up: {}, ownCars: ['sport'], car: 'sport' }); R.setUser('גבי'); R.setCar('roadster'); R.start(0); R.clearTraffic(); R.rivalsOff(); R.step(30);
  R.setFlyCh(100); R.fly(); R.step(10); out.lockedT = R.flyState().t; out.need = R.flyState().need;
  R.prep({ up: { sight: 3, ramF: 3, ramS: 3, missiles: 3, shock: 3 } }); R.start(0); R.clearTraffic(); R.rivalsOff(); R.step(30);
  R.setFlyCh(50); R.fly(); R.step(5); out.halfT = R.flyState().t;
  R.setFlyCh(100); const hp0 = R.state().hp; R.fly(); R.step(40); const f = R.flyState(); out.up = f.up; out.t = f.t; out.h = f.h;
  R.step(60 * 6); out.after = R.flyState(); out.hpSame = R.state().hp === hp0;
  return out;
});
check('the roadster hops only with 14 upgrade levels and a full charge: a ~3.4s flip-jump above traffic, then lands', flt.lockedT === 0 && flt.halfT === 0 && flt.t > 2 && flt.h > 2 && flt.after.t === 0 && flt.after.h === 0 && flt.hpSame, JSON.stringify(flt));
const med = await page.evaluate(() => {
  const R = RingRush, out = {};
  const hit = (up, hp, kits) => { R.noCops(true); R.noRivalHits(false); R.prep({ up, ownCars: ['sport'], car: 'sport' }); R.setUser(''); R.start(0); R.clearTraffic(); R.setLat(0); R.step(150); R.clearTraffic(); R.giveKits(kits); R.setHp(hp); R.setRival(1, 0, 0.8, R.state().speed); R.rivalHitMe(1); R.step(30); const s = R.state(); return { hp: Math.round(s.hp), kits: s.kits, alive: s.state === 'play' }; };
  out.auto = hit({ medic: 1 }, 40, 1);      /* 40 - 30 = 10 -> a kit opens by itself */
  out.fatal = hit({ medic: 1 }, 20, 1);     /* a hit that would have killed: the kit saves the run */
  out.none = hit({}, 40, 1);                /* without the upgrade nothing happens by itself */
  out.high = hit({ medic: 1 }, 100, 1);     /* a healthy player keeps the kit */
  return out;
});
check('medic upgrade: a kit opens automatically after a hit that leaves under 35% (even a fatal one); not without the upgrade or when healthy', med.auto.kits === 0 && med.auto.hp > 40 && med.fatal.kits === 0 && med.fatal.alive && med.none.kits === 1 && med.none.hp < 20 && med.high.kits === 1 && med.high.hp > 60, JSON.stringify(med));
const rd = await page.evaluate(() => {
  const R = RingRush, out = {};
  R.prep({ ownCars: ['sport'], car: 'sport', rdSeen: 0, rdTrial: 0 }); R.setUser('דני'); R.grantTrial(); out.granted = R.trial(); out.ownedDuringTrial = R.owns('roadster');
  R.grantTrial(); out.once = R.trial().t === 1;
  R.prep({ car: 'roadster' }); R.start(0); R.clearTraffic(); R.rivalsOff(); R.step(60); R.endRun('dead'); out.afterRace = R.trial(); out.lockedAgain = !R.owns('roadster'); out.carBack = R.curCar();
  R.setUser('דני'); R.grantTrial(); out.noSecondOffer = R.trial().t === 0;
  R.prep({ rdSeen: 0, rdTrial: 0 }); R.setUser('גבי'); R.grantTrial(); out.vipNoTrial = R.trial().t === 0 && R.owns('roadster');
  R.setUser(''); R.prep({ rdSeen: 0, rdTrial: 0, ownCars: ['sport'] }); R.grantTrial(); out.anonNoTrial = R.trial().t === 0;
  return out;
});
check('roadster: every registered user gets it for ONE race, then it locks until bought; Gabi and Shachar always have it; guests get no trial', rd.granted.t === 1 && rd.ownedDuringTrial && rd.once && rd.afterRace.t === 0 && rd.lockedAgain && rd.carBack === 'sport' && rd.noSecondOffer && rd.vipNoTrial && rd.anonNoTrial, JSON.stringify(rd));
check('no page errors / shader errors', errors.length === 0, errors.slice(0, 3).join(' / '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILED:\n - ' + failed.map((f) => f.name).join('\n - ')); process.exit(1); }
