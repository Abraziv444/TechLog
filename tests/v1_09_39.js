/* v1.09.39 — машины в одной точке не прячут номера друг за другом: значки расходятся веером, есть «ножки» к точке,
   при смене масштаба раскладка пересчитывается; одиночная машина стоит на своей точке. Карта приложения и карта ТВ.
   Демо-режим. Запуск: node tests/v1_09_39.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(900);

  /* геометрия значков машин на экране */
  const geo = sel => p.evaluate(s => [...document.querySelectorAll(s)].map(e => { const r = e.getBoundingClientRect(); return { no: e.textContent.trim(), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) }; }), sel);
  const minGap = a => { let m = 1e9; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) m = Math.min(m, Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y)); return a.length > 1 ? Math.round(m) : null; };

  /* карта приложения: три машины в одной точке */
  await p.evaluate(() => App.go('map')); await p.waitForTimeout(1500);
  const setup = await p.evaluate(() => { const vs = bnVehicles().filter(v => v.imei); const out = [];
    vs.forEach((v, i) => { const bv = bnByImei(String(v.imei)); if (bv && bv.stats){ bv.stats.location = { ...(bv.stats.location || {}), lat: 33.9500, lon: -84.3000, lng: undefined, heading: 0 }; out.push(v.car_no); } });
    bnDrawCars(); mapObj.setView([33.95, -84.30], 14, { animate: false }); return out; });
  await p.waitForTimeout(500);
  const g1 = await geo('#map .map-car');
  t('карта: все машины в одной точке — значки не накрывают друг друга (центры ≥ 30 px)', g1.length >= 3 && minGap(g1) >= 30, { setup, g1, gap: minGap(g1) });
  t('карта: все номера видны', setup.every(n => g1.some(g => g.no === String(n))), g1.map(g => g.no));
  const legs1 = await p.evaluate(() => mapObj._tlLegs ? mapObj._tlLegs.getLayers().length : -1);
  t('карта: к общей точке — «ножки» и кружок', legs1 === g1.length + 1, legs1);
  await p.evaluate(() => mapObj.setZoom(10, { animate: false })); await p.waitForTimeout(500);
  const g2 = await geo('#map .map-car');
  t('карта: после смены масштаба значки снова разведены', minGap(g2) >= 30, { g2, gap: minGap(g2) });
  const real = await p.evaluate(() => { const bv = bnByImei(String(bnVehicles().find(v => v.imei).imei)); return [bv.stats.location.lat, bv.stats.location.lon]; });
  t('координаты машин не тронуты — меняется только место значка', real[0] === 33.95 && real[1] === -84.3, real);
  /* разъехались далеко — ножек нет, каждая на своём месте */
  await p.evaluate(() => { bnVehicles().filter(v => v.imei).forEach((v, i) => { const bv = bnByImei(String(v.imei)); if (bv && bv.stats) bv.stats.location = { ...bv.stats.location, lat: 33.90 + i * 0.05, lon: -84.30 }; }); bnDrawCars(); mapObj.setView([33.95, -84.30], 11, { animate: false }); });
  await p.waitForTimeout(500);
  const alone = await p.evaluate(() => { const ms = Object.values(BN.markers); const mis = ms.map(m => { const ll = m.getLatLng(); return Math.round(ll.lat * 1e4) / 1e4; }); return { legs: mapObj._tlLegs.getLayers().length, lats: mis }; });
  t('разъехались — «ножек» нет, значки на своих точках', alone.legs === 0 && alone.lats.every(l => [33.9, 33.95, 34, 34.05].includes(l)), alone);
  /* две машины — рядом (в 10 м), при крупном масштабе — порознь */
  await p.evaluate(() => { const vs = bnVehicles().filter(v => v.imei); vs.forEach((v, i) => { const bv = bnByImei(String(v.imei)); if (bv && bv.stats) bv.stats.location = { ...bv.stats.location, lat: i < 2 ? 33.95 + i * 0.0001 : 34.2, lon: -84.30 }; }); bnDrawCars(); mapObj.setView([33.95, -84.30], 12, { animate: false }); });
  await p.waitForTimeout(400);
  const two = await p.evaluate(() => mapObj._tlLegs.getLayers().length);
  await p.evaluate(() => mapObj.setView([33.95, -84.30], 19, { animate: false })); await p.waitForTimeout(400);
  const twoZ = await p.evaluate(() => mapObj._tlLegs.getLayers().length);
  t('две машины в 10 м: издалека — веер (2 ножки + кружок), вплотную на максимуме — сами по себе', two === 3 && twoZ === 0, { two, twoZ });

  /* ТВ: три машины в одной точке */
  await p.evaluate(() => tvTest()); await p.waitForTimeout(1200);
  await p.evaluate(() => { TV.bn = [1, 2, 3].map(n => ({ car_no: n, driver_id: 'd' + n, run: false, lat: 33.95, lng: -84.30, heading: 0 })); TV.feed.jobs = []; TV.feed.pickups = []; tvRepaint(); });
  await p.waitForTimeout(600);
  const g3 = await geo('#tv-map .map-car');
  t('ТВ: три машины в одной точке — номера 1, 2, 3 видны, значки порознь', g3.length === 3 && minGap(g3) >= 30 && ['1', '2', '3'].every(n => g3.some(g => g.no === n)), { g3, gap: minGap(g3) });
  await p.evaluate(() => tvTestStop());

  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
