/* v1.09.44 — проверка «Замечаний по коду v1.09.38» и доделки: номера по шаблону везде (п. 58), одинаковые названия
   в меню и на экране (п. 50), «сразу / пакетом» в справке (п. 40), мёртвый код (п. 52). Демо-режим.
   Запуск: node tests/v1_09_44.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  const login = async (role) => {
    await p.evaluate(r => { localStorage.setItem('techlog_session_v1', 'demo-' + r); localStorage.setItem('techlog_view_mode', 'desktop'); }, role);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length && state.user, null, { timeout: 20000 }); await p.waitForTimeout(600);
  };
  await p.evaluate(() => localStorage.clear());
  await login('admin');
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  /* п. 58 */
  const n58 = await p.evaluate(() => {
    const cx = state.data.complexes[0];
    const pr = { id: uid(), no: 44, date: '2026-09-09', counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: '44', status: 'draft', items: [], total: 0, created_by: state.user.id, created_at: new Date().toISOString() };
    const j = liveJobs()[0]; j.proposal_id = pr.id;
    const r = { id: uid(), no: 45, date: '2026-09-09', status: 'draft', job_id: j.id, counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: '44', items: [], materials: [], created_by: state.user.id, helper_ids: [], created_at: new Date().toISOString() };
    state.data.proposals.push(pr); (state.data.repairs = state.data.repairs || []).push(r);
    return { prop: propNo(pr), rep: repNo(r), tr: trDocLabel('rep', r), trp: trDocLabel('prop', pr) };
  }).catch(e => ({ err: String(e) }));
  t('п.58: номер пропозала и ремонта — по шаблону (как в документе и PDF)', /^PROP-/.test(n58.prop || '') && /^REP-/.test(n58.rep || '') && n58.tr.startsWith(n58.rep) && n58.trp.startsWith(n58.prop), n58);
  const left = src.split('\n').filter(l => /(R-\$\{|'R-' \+ \(r\.no|P-\$\{|'P-' \+ \(p\.no|'P-' \+ \(x\.no)/.test(l) && !/function (propNo|repNo)|short \? '[PR]'/.test(l));
  t('п.58: в разметке не осталось коротких «P-N» / «R-N» вне запасного варианта', left.length === 0, left.slice(0, 4).map(x => x.trim().slice(0, 120)));
  const cards = await p.evaluate(() => { const j = liveJobs().find(x => x.proposal_id); return { full: proposalChipHtml(j, false), short: proposalChipHtml(j, true), no: propNo(propById(j.proposal_id)) }; });
  t('п.58: фишка пропозала на карточке — вид документа («PROP» / «P»), номер по шаблону — в подсказке; «P-N» нет', />PROP</.test(cards.full) && />P</.test(cards.short) && cards.full.includes('PROPOSAL ' + cards.no) && !/P-\d/.test((cards.full + cards.short).replace(/title="[^"]*"/g, '')), cards);

  /* п. 50 */
  const menu = await p.evaluate(() => { const tip = k => { const b = [...document.querySelectorAll('button.tab')].find(x => (x.getAttribute('onclick') || '').includes("'" + k + "'")); return b ? b.title : null; };
    return { df: tip('docflow'), dfT: t('tab_docflow'), act: tip('archive'), actT: t('act_title') }; });
  t('п.50: подсказка пункта меню = заголовок экрана («Документооборот», «Требуется действие»); подпись — короткая, полная не влезает', menu.df === menu.dfT && menu.act === menu.actT, menu);

  /* п. 40 */
  const help = await p.evaluate(() => ['board', 'home', 'map'].map(k => { const h = sectionFaqHtml(k); return /Порядок работ/.test(h) && /«Сохранить»/.test(h) && /с 0/.test(h); }));
  t('п.40: в справке Главной, Доски и Карты — где порядок сохраняется сразу, где «Сохранить», кто двигает, нумерация с 0', help.every(Boolean), help);

  /* п. 52 */
  const dead = await p.evaluate(() => ({ dm: typeof window.dayMoveOn, tm: typeof window.tplMoveModal, app: typeof App.tplMove,
    keyTrack: 'veh_track_off' in I18N.ru, keyMgr: 'mgr_approve_chk' in I18N.ru }));
  t('п.52: «Перенести день» удалён целиком (функции, кнопки, подписи)', dead.dm === 'undefined' && dead.tm === 'undefined' && dead.app === 'undefined' && !/tpl_move_day/.test(src), dead);
  t('п.52: подписи «Скрыть трек» и общей галочки апрува удалены', !dead.keyTrack && !dead.keyMgr && !/manager_can_approve/.test(src), dead);
  await login('manager');
  const appr = await p.evaluate(() => { state.data.org_settings.manager_can_approve = true; const me = meProf(); const was = me.can_approve;
    me.can_approve = false; const a = canApprove(); me.can_approve = true; const b = canApprove(); me.can_approve = was; return { a, b }; });
  t('п.52: право апрува менеджера — только личное (общая галочка больше ничего не решает)', appr.a === false && appr.b === true, appr);
  const up = fs.readFileSync(path.join(ROOT, 'supabase/update-to-1_09_44.sql'), 'utf8');
  t('п.52: SQL 1.09.44 удаляет vehicle_service_set; full-install = 1.09.43 + обновление', /drop function if exists public\.vehicle_service_set\(uuid, int\)/.test(up)
    && fs.readFileSync(path.join(ROOT, 'supabase/full-install-1_09_44.sql'), 'utf8').endsWith(up) && /const DB_SQL_FILE = 'full-install-1_09_(4[4-9]|[5-9]\d)\.sql';/.test(src));

  /* горячая правка 1.09.44: повторный запуск full-install на базе с PDF-инвойсами падал (23514, media_kind_check) */
  const narrow = fs.readdirSync(path.join(ROOT, 'supabase')).filter(f => /\.sql$/.test(f))
    .filter(f => /add constraint media_kind_check\s+check \(kind in \('photo','video','file'\)\)/.test(fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8')));
  t('SQL: ни в одном скрипте ранняя секция не сужает виды media (PDF-инвойс разрешён сразу)', narrow.length === 0, narrow.slice(0, 5));
  t('SQL: есть проверка повторного запуска на «живых» данных (tests/full-install-rerun.sql)', fs.existsSync(path.join(ROOT, 'tests/full-install-rerun.sql')));
  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
