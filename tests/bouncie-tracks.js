/* v1.09.10: офлайн-проверка режима ?tracks=1 Edge Function bouncie.
   Сама функция (supabase/functions/bouncie/index.ts) транспилируется TypeScript'ом и выполняется
   в Node с подменой Deno.serve, клиента Supabase (таблицы в памяти) и fetch к api.bouncie.dev.
   Проверяется: право доступа, границы диапазона, окна Bouncie не шире недели, день по времени
   Нью-Йорка, дубли двух потоков данных, «закрытые» дни не перезапрашиваются, refresh=1, будущее.
   Нужен typescript: NODE_PATH=/path/to/node_modules node tests/bouncie-tracks.js */
const fs = require('fs'), path = require('path'), ts = require('typescript');
let ok = 0, bad = 0;
const t = (n, c, note) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (note !== undefined ? ' — ' + JSON.stringify(note) : '')); } };

/* ---- БД в памяти ---- */
const DB = { app_secrets: [{ key: 'bn_client_id', value: 'x' }, { key: 'bn_client_secret', value: 'y' }, { key: 'bn_access_token', value: 'tok' }, { key: 'bn_token_exp', value: String(Date.now() + 3600e3) }],
  profiles: [], vehicles: [{ id: 'v1', imei: '111', driver_id: 'd1', car_no: 1 }, { id: 'v2', imei: '222', driver_id: null, car_no: 2 }], bn_trips: [], bn_trip_days: [] };
function q(table){
  let rows = DB[table]; const f = [];
  const api = {
    select(){ return api; }, order(){ return api; }, limit(){ return api; },
    eq(k, v){ f.push(r => r[k] === v); return api; }, in(k, vs){ f.push(r => vs.includes(r[k])); return api; },
    gte(k, v){ f.push(r => String(r[k]) >= v); return api; }, lte(k, v){ f.push(r => String(r[k]) <= v); return api; },
    not(k, op, v){ f.push(r => r[k] != null); return api; },
    maybeSingle(){ const d = rows.filter(r => f.every(x => x(r))); return Promise.resolve({ data: d[0] || null, error: null }); },
    then(res){ const d = rows.filter(r => f.every(x => x(r))).sort((a, b) => String(a.started_at || '').localeCompare(String(b.started_at || ''))); return res({ data: d, error: DB.__noTables && /bn_trip/.test(table) ? { message: 'relation does not exist' } : null }); },
    upsert(list, o){ list = Array.isArray(list) ? list : [list]; const keys = String((o || {}).onConflict || (table === 'app_secrets' ? 'key' : 'id')).split(',');
      for (const r of list){ const i = rows.findIndex(x => keys.every(k => String(x[k]) === String(r[k]))); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push({ ...r }); }
      return Promise.resolve({ error: null }); },
    update(){ return { eq(){ return this; }, then(r){ return r({ error: null }); } }; }, insert(){ return Promise.resolve({ error: null }); },
  };
  return api;
}
const sbFake = { from: q };
let me = { id: 'u-admin' };
const googleStub = { svc: () => sbFake, userClient: () => ({ auth: { getUser: async () => ({ data: { user: me } }) }, from: q }),
  CORS: {}, jres: (b, s = 200) => ({ status: s, body: b }) };

/* ---- подмена Bouncie ---- */
const calls = [];
let TRIPS = [];
global.fetch = async (url) => {
  const u = new URL(url); calls.push({ imei: u.searchParams.get('imei'), from: u.searchParams.get('starts-after'), to: u.searchParams.get('ends-before') });
  const a = Date.parse(u.searchParams.get('starts-after')), b = Date.parse(u.searchParams.get('ends-before'));
  const out = TRIPS.filter(x => x.imei === u.searchParams.get('imei') && Date.parse(x.startTime) >= a && Date.parse(x.endTime) <= b);
  return { ok: true, status: 200, json: async () => out, text: async () => '' };
};

/* ---- загрузка функции ---- */
let handler = null;
global.Deno = { serve: h => { handler = h; }, env: { get: () => '' } };
const src = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/bouncie/index.ts'), 'utf8').replace(/^import .*?;\s*$/m, 'const { svc, userClient, CORS, jres } = __g;');
const js = ts.transpileModule(src, { compilerOptions: { target: 'ES2022', module: 'None' } }).outputText;
new Function('__g', js)(googleStub);
const call = async (qs) => handler({ method: 'GET', url: 'https://x/functions/v1/bouncie' + qs, headers: { get: () => 'Bearer x' } });
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const trip = (imei, isoStart, min, mi, tx) => ({ imei, transactionId: tx, startTime: isoStart, endTime: new Date(Date.parse(isoStart) + min * 60e3).toISOString(), distance: mi, gps: '_p~iF~ps|U_ulLnnqC' });

(async () => {
  console.log('— bouncie ?tracks=1 —');
  DB.profiles = [{ id: 'u-admin', role: 'admin', blocked: false, bn_access: null, bn_track: null }, { id: 'u-tech', role: 'tech', blocked: false, bn_access: null, bn_track: null }];

  me = { id: 'u-tech' };
  let r = await call('?tracks=1&from=' + day(-3) + '&to=' + day(-3));
  t('сотрудник без права «Трек дня» — 403 NO_ACCESS', r.status === 403 && r.body.error === 'NO_ACCESS', r);
  me = { id: 'u-admin' };
  r = await call('?tracks=1&from=2026-09-10&to=2026-09-01'); t('to < from — 400', r.status === 400, r.body);
  r = await call('?tracks=1&from=2026-01-01&to=2026-03-01'); t('диапазон шире 31 дня — RANGE_TOO_WIDE', r.status === 400 && r.body.error === 'RANGE_TOO_WIDE', r.body);
  DB.__noTables = true; r = await call('?tracks=1&from=' + day(-3) + '&to=' + day(-3));
  t('таблиц ещё нет — 409 NEED_SQL (приложение покажет «выполните update-to-1_09_10.sql»)', r.status === 409 && r.body.error === 'NEED_SQL', r.body); DB.__noTables = false;

  /* 12 прошедших дней: поездки каждый день у машины 111, через день у 222; дубль второго потока; поездка в 03:30 UTC = вечер предыдущего дня в Нью-Йорке */
  TRIPS = [];
  for (let d = -12; d <= -1; d++){ TRIPS.push(trip('111', day(d) + 'T14:00:00.000Z', 30, 10.04, 'a' + d)); if (d % 2 === 0) TRIPS.push(trip('222', day(d) + 'T16:00:00.000Z', 20, 5, 'b' + d)); }
  TRIPS.push(trip('111', day(-5) + 'T14:00:00.000Z', 30, 10.04, 'dup'));                 // тот же старт — второй поток данных
  TRIPS.push(trip('111', day(-4) + 'T03:30:00.000Z', 15, 3, 'late'));                     // 23:30 по Нью-Йорку дня −5
  calls.length = 0;
  r = await call('?tracks=1&from=' + day(-12) + '&to=' + day(-1));
  const spans = calls.map(c => (Date.parse(c.to) - Date.parse(c.from)) / 864e5);
  t('12 дней → 3 окна × 2 машины, каждое окно не шире недели', calls.length === 6 && spans.every(x => x <= 7), { n: calls.length, spans });
  t('ответ: все поездки диапазона, без дубля', r.status === 200 && r.body.trips.length === 12 + 6 + 1 && r.body.pulled >= 19, { n: r.body.trips && r.body.trips.length, pulled: r.body.pulled });
  const late = r.body.trips.find(x => x.s === day(-4) + 'T03:30:00.000Z');
  t('день поездки — по времени Нью-Йорка (03:30 UTC относится к предыдущему дню)', !!late && late.day === day(-5), late);
  t('мили округлены до десятых, машина и водитель записаны', DB.bn_trips.some(x => x.imei === '111' && x.mi === 10 && x.driver_id === 'd1' && x.vehicle_id === 'v1'));
  t('дни отмечены как сохранённые', DB.bn_trip_days.length === 12);

  calls.length = 0; r = await call('?tracks=1&from=' + day(-12) + '&to=' + day(-3));
  t('повторный запрос закрытых дней — Bouncie не вызывается, данные из базы', calls.length === 0 && r.body.trips.length > 0 && r.body.synced.length === 0, { calls: calls.length, synced: r.body.synced });
  calls.length = 0; r = await call('?tracks=1&from=' + day(-3) + '&to=' + day(-3) + '&refresh=1');
  t('refresh=1 перечитывает день заново', calls.length === 2 && r.body.synced.length === 1, { calls: calls.length });
  calls.length = 0; r = await call('?tracks=1&from=' + day(0) + '&to=' + day(0));
  const c1 = calls.length; calls.length = 0; await call('?tracks=1&from=' + day(0) + '&to=' + day(0));
  t('сегодняшний день не «закрыт»: запрашивается каждый раз', c1 === 2 && calls.length === 2, { c1, c2: calls.length });
  calls.length = 0; r = await call('?tracks=1&from=' + day(2) + '&to=' + day(5));
  t('будущие дни у Bouncie не запрашиваются', calls.length === 0 && r.status === 200 && r.body.trips.length === 0, { calls: calls.length });

  /* попутная запись из ?stats=1 */
  DB.bn_trips.length = 0; TRIPS = [trip('111', new Date(Date.now() - 3600e3).toISOString(), 20, 7.26, 's1')];
  r = await call('?stats=1&from=' + encodeURIComponent(new Date(Date.now() - 12 * 3600e3).toISOString()) + '&to=' + encodeURIComponent(new Date(Date.now() + 3600e3).toISOString()));
  t('?stats=1 попутно пишет поездки в историю и отвечает как раньше', r.status === 200 && r.body.cars && r.body.cars['111'] && r.body.cars['111'].n === 1 && DB.bn_trips.length === 1 && DB.bn_trips[0].mi === 7.3, { cars: r.body.cars, n: DB.bn_trips.length });

  console.log(`\nИтог: ✓ ${ok} · ✗ ${bad}`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
