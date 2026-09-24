/* v1.09.43 — п. 8 «Замечаний по коду v1.09.38», сторона приложения: профили склеиваются из profiles_pub (коллеги) и
   profiles (своя строка целиком); без представления — как раньше; остатки для «Взять» при закрытом складе — из
   stock_avail(). База в демо не работает, поэтому state.sb подменяется заглушкой, а права базы проверяет
   tests/v1_09_43.sql. Запуск: node tests/v1_09_43.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1300, height: 860 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-tech'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length && state.user, null, { timeout: 20000 }); await p.waitForTimeout(600);

  /* заглушка Supabase: profiles отдаёт только свою строку, profiles_pub — всех без личных полей */
  const mk = (pubOk) => p.evaluate((pubOk) => {
    const me = state.user.id;
    const all = [{ id: me, login: 'sergey', display_name: 'Sergey Volkov', role: 'tech', car_no: 1, blocked: false, tag: 'SV', can_approve: false, push_prefs: { font_pct: 95 }, bn_access: true },
                 { id: 'demo-admin', login: 'ivan', display_name: 'Ivan Petrov', role: 'admin', car_no: 3, blocked: false, tag: 'IP', can_approve: true, push_prefs: { font_pct: 120 }, bn_access: true },
                 { id: 'demo-manager', login: 'alexey', display_name: 'Alexey Smirnov', role: 'manager', car_no: 2, blocked: false, tag: 'AS', can_approve: true, push_prefs: { secret: 1 } }];
    const pubCols = r => ({ id: r.id, login: r.login, display_name: r.display_name, role: r.role, car_no: r.car_no, blocked: r.blocked, tag: r.tag, can_approve: r.can_approve });
    const q = (data, error) => { const o = { select(){ return o; }, limit(){ return o; }, eq(){ return o; }, then(res, rej){ return Promise.resolve({ data, error }).then(res, rej); } }; return o; };
    window.__sb0 = state.sb;
    state.sb = { from(tb){
      if (tb === 'profiles') return q(all.filter(r => r.id === me), null);
      if (tb === 'profiles_pub') return pubOk ? q(all.map(pubCols), null) : q(null, { message: 'relation "public.profiles_pub" does not exist', code: '42P01' });
      if (tb === 'org_settings') return q([state.data.org_settings], null);
      return q([], null);
    }, rpc(fn){ return Promise.resolve(fn === 'stock_avail' ? { data: [{ equipment_type_id: (state.data.equipment_types[0] || {}).id, stock: 7, repair: 2 }], error: null } : { data: null, error: { message: 'x' } }); } };
  }, pubOk);

  await mk(true);
  const a = await p.evaluate(async () => { const out = await sbLoadAll(); state.sb = window.__sb0;
    const me = out.profiles.find(x => x.id === state.user.id), adm = out.profiles.find(x => x.id === 'demo-admin');
    return { n: out.profiles.length, mePrefs: me && me.push_prefs && me.push_prefs.font_pct, meTag: me && me.tag, admPrefs: adm && adm.push_prefs, admName: adm && adm.display_name, admTag: adm && adm.tag, admAppr: adm && adm.can_approve }; });
  t('п.8: сотрудник — коллеги из profiles_pub (имя, сокращение, право апрува), своя строка целиком (личные настройки)', a.n === 3 && a.mePrefs === 95 && a.meTag === 'SV' && a.admName === 'Ivan Petrov' && a.admTag === 'IP' && a.admAppr === true, a);
  t('п.8: личные настройки коллеги на устройство не приходят', a.admPrefs === undefined, a);
  await mk(false);
  const b = await p.evaluate(async () => { const out = await sbLoadAll(); state.sb = window.__sb0; return { n: out.profiles.length, fail: (window.SYNC_ERRORS || []).length }; });
  t('п.8: без представления (SQL 1.09.43 не выполнен) — профили как раньше, обмен не падает', b.n === 1 && b.fail === 0, b);

  /* склад: закрыт — доступное количество из stock_avail() */
  const c = await p.evaluate(async () => {
    const et = state.data.equipment_types[0].id;
    state.data.org_settings.stock_visible_all = false;
    const lim0 = window.stkLimited; window.stkLimited = () => true;
    state.sb = { rpc(fn){ return Promise.resolve(fn === 'stock_avail' ? { data: [{ equipment_type_id: et, stock: 7, repair: 2 }], error: null } : { data: null, error: { message: 'x' } }); } };
    await stkAvLoad(true);
    eqDraft = { kind: 'take', et, qty: 1, src: 'stock', note: '' }; const capTake = eqCap();
    eqDraft = { kind: 'unrepair', et, qty: 1, src: 'stock', note: '' }; const capRep = eqCap();
    window.stkLimited = lim0; state.sb = window.__sb0; eqDraft = null;
    const capOpen = (() => { eqDraft = { kind: 'take', et, qty: 1, src: 'stock', note: '' }; const v = eqCap(); eqDraft = null; return v; })();
    return { capTake, capRep, capOpen, own: emRow(et).stock };
  });
  t('п.8: склад закрыт — «Взять» и «Из ремонта» считают доступное по stock_avail() (7 и 2), а не по неполному журналу', c.capTake === 7 && c.capRep === 2, c);
  t('п.8: склад открыт (или демо) — как раньше, по журналу на устройстве', c.capOpen === c.own, c);

  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/update-to-1_09_43.sql'), 'utf8');
  t('SQL 1.09.43: profiles_pub без личных полей, profiles_sel — сам и админ, склад по галочке, stock_avail', /create or replace view public\.profiles_pub/.test(sql) && !/push_prefs/.test(sql.slice(sql.indexOf('create or replace view'), sql.indexOf('from public.profiles')))
    && /using \(id = auth\.uid\(\) or public\.my_role\(\) = 'admin'\)/.test(sql) && /stock_visible_me\(\) or tech_id = auth\.uid\(\)/.test(sql) && /function public\.stock_avail\(\)/.test(sql)
    && fs.readFileSync(path.join(ROOT, 'supabase/full-install-1_09_43.sql'), 'utf8').endsWith(sql) && /const DB_SQL_FILE = 'full-install-1_09_(4[3-9]|[5-9]\d)\.sql';/.test(src) && /'stock_avail'\]/.test(src));

  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
