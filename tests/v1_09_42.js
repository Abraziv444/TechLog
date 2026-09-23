/* v1.09.42 — третий пакет «Замечаний по коду v1.09.38»: вопросы в окне приложения вместо confirm/prompt (п. 42),
   подсказка у названия (п. 50), размер файлов в настройках (п. 51), мёртвый код (п. 52), архив таблиц (п. 53),
   подписи ТО mnt_* (п. 54), роль в create table (п. 55), свои версии функций (п. 56). Демо-режим.
   Запуск: node tests/v1_09_42.js [порт]. */
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
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.accept(); });
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length && state.user, null, { timeout: 20000 }); await p.waitForTimeout(700);

  /* ---------- п. 42: окно приложения поверх открытого окна ---------- */
  await p.evaluate(() => { window.__tlAskModal = true; });
  const a = await p.evaluate(async () => {
    openModal(`${modalHead('Base', 'box')}<input id="base-in" value="keep">`);
    const pr = askYes('Удалить?', { danger: true });
    await new Promise(r => setTimeout(r, 80));
    const both = !!document.getElementById('overlay') && !!document.getElementById('ask-ov');
    const underInert = document.getElementById('overlay').inert === true;
    document.getElementById('ask-ok').click(); const yes = await pr;
    const baseAlive = (document.getElementById('base-in') || {}).value === 'keep' && !document.getElementById('ask-ov');
    const pr2 = askYes('Ещё?'); await new Promise(r => setTimeout(r, 60));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); const esc = await pr2;
    const baseAfterEsc = !!document.getElementById('overlay');
    const pr3 = askText('Причина?', 'abc'); await new Promise(r => setTimeout(r, 60));
    const inp = document.getElementById('ask-in'); inp.value = 'нет запчасти'; document.getElementById('ask-ok').click(); const txt = await pr3;
    const pr4 = askText('Причина?', ''); await new Promise(r => setTimeout(r, 60)); document.getElementById('ask-no').click(); const txtNo = await pr4;
    const pr5 = askYes('Назад?'); await new Promise(r => setTimeout(r, 60)); const bp = await backPressed(); const byBack = await pr5;
    const baseAfterBack = !!document.getElementById('overlay');
    closeModal();
    return { both, underInert, yes, baseAlive, esc, baseAfterEsc, txt, txtNo, bp, byBack, baseAfterBack, inertAfter: document.querySelector('#app').inert };
  });
  t('п.42: вопрос открывается ПОВЕРХ окна, окно под ним неактивно, но не закрыто', a.both && a.underInert, a);
  t('п.42: «Да» → true, поле окна под вопросом цело', a.yes === true && a.baseAlive, a);
  t('п.42: Esc — «нет», окно под вопросом остаётся', a.esc === false && a.baseAfterEsc, a);
  t('п.42: ввод текста: «Готово» → строка, «Отмена» → null', a.txt === 'нет запчасти' && a.txtNo === null, a);
  t('п.42: системная «назад» закрывает сначала вопрос (= «нет»), окно под ним остаётся', a.bp === 'ask' && a.byBack === false && a.baseAfterBack, a);
  t('п.42: после закрытия всего приложение снова активно', a.inertAfter === false, a);
  const stub = await p.evaluate(async () => {
    const c0 = window.confirm, p0 = window.prompt; let asked = '';
    window.confirm = q => { asked = q; return false; }; window.prompt = () => 'из прогона';
    const r1 = await askYes('Встроенный прогон?'), r2 = await askText('Текст?', '');
    const noModal = !document.getElementById('ask-ov');
    window.confirm = c0; window.prompt = p0; return { r1, r2, asked, noModal };
  });
  t('п.42: встроенный прогон (подменённый confirm/prompt) отвечает сам — окна приложения нет', stub.r1 === false && stub.r2 === 'из прогона' && stub.asked === 'Встроенный прогон?' && stub.noModal, stub);
  const flow = await p.evaluate(async () => {
    const pr = state.data.proposals && state.data.proposals.find(x => !isArch(x));
    if (!pr) return { skip: true };
    const call = delProposal(pr.id); await new Promise(r => setTimeout(r, 80));
    const shown = !!document.getElementById('ask-ov'), danger = !!document.querySelector('#ask-ov .btn-red');
    document.getElementById('ask-no').click(); await call;
    return { shown, danger, still: !isArch(propById(pr.id)) };
  });
  t('п.42: «Удалить» пропозала спрашивает окном приложения (красная кнопка), «Отмена» ничего не делает', flow.skip || (flow.shown && flow.danger && flow.still), flow);
  await p.evaluate(() => { window.__tlAskModal = false; });
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const left = src.split('\n').filter(l => /(?<![\w.])(confirm|prompt)\(/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l.trim()) && !/window\.(confirm|prompt)\s*=|nat\.call|_NATIVE_|системн/.test(l));
  t('п.42: в коде не осталось вызовов confirm()/prompt() вне прогонов', left.length === 0, left.slice(0, 5));
  t('п.42: системных окон браузера за тест не было', dialogs === 0, dialogs);

  /* ---------- п. 50, 51 ---------- */
  const s51 = await p.evaluate(() => {
    const brand = (document.querySelector('.brand') || {}).title || '';
    const card = mediaLimitsCardHtml();
    state.data.org_settings.media_mb_file = 3;
    const b3 = mFileBytes(); state.data.org_settings.media_mb_file = null; const bDef = mFileBytes();
    return { brand, has: /id="media-mb"/.test(card) && ['media_mb_photo', 'media_mb_video', 'media_mb_file', 'media_mb_invoice'].every(k => card.includes("'" + k + "'")), b3, bDef };
  });
  t('п.50: у названия приложения подсказка «Проверить обновления», а не «Проверяю версию…»', /Проверить обновления|Check for updates/.test(s51.brand), s51);
  t('п.51: размеры фото / видео / вложения / PDF — степперы в карточке лимитов', s51.has, s51);
  t('п.51: предел вложения на устройстве берётся из настроек (3 МБ), пусто — прежние 25 МБ', s51.b3 === 3e6 && s51.bDef === 25 * 1024 * 1024, s51);

  /* ---------- п. 52, 53, 54 ---------- */
  const s52 = await p.evaluate(() => ({ track: typeof window.bnTrackShow, svc: typeof window.vehServiceSet, appSvc: typeof App.vehServiceSet,
    rpc: DB_NEED_RPCS.includes('vehicle_service_set'), tables: TABLES.includes('equipment_stock'),
    mnt: t('mnt_title'), mntEn: I18N.en.mnt_title, oldKey: 'mt_title' in I18N.ru, queue: 'mt_queued' in I18N.ru }));
  t('п.52: мёртвый код убран (bnTrackShow, vehServiceSet, RPC vehicle_service_set в проверке БД)', s52.track === 'undefined' && s52.svc === 'undefined' && s52.appSvc === 'undefined' && !s52.rpc, s52);
  t('п.53: equipment_stock больше не грузится при обмене', !s52.tables, s52);
  t('п.54: подписи ТО — mnt_*, у очереди файлов остались mt_*', !!s52.mnt && s52.mnt !== 'mnt_title' && !!s52.mntEn && !s52.oldKey && s52.queue, s52);
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  t('п.52: мёртвые стили убраны (жёлтый .rt-admin, цвета рамки аватара по ролям)', !/\.rt-admin\{background:var\(--yellow\)/.test(css) && !/\.avatar\.role-tech\{border-color:var\(--blue\)/.test(css));
  const mc = await p.evaluate(() => { state.screen = 'mycar'; render(); return document.querySelector('#app').innerHTML.includes('mnt_') ? 'raw-key' : 'ok'; });
  t('п.54: «Моя машина» рисуется без сырых ключей подписей', mc === 'ok', mc);

  /* ---------- SQL и функции ---------- */
  const up = fs.readFileSync(path.join(ROOT, 'supabase/update-to-1_09_42.sql'), 'utf8');
  const full = fs.readFileSync(path.join(ROOT, 'supabase/full-install-1_09_42.sql'), 'utf8');
  t('п.51, 53: SQL — колонки media_mb_* с границами, архивные пометки; full-install заканчивается обновлением', /media_mb_invoice int/.test(up) && /org_settings_media_mb_chk/.test(up) && /comment on table public\.equipment_stock is 'АРХИВ/.test(up) && full.endsWith(up) && src.includes("const DB_SQL_FILE = 'full-install-1_09_42.sql';"));
  t('п.55: роль бухгалтера — прямо в create table profiles', /role text not null default 'tech' check \(role in \('admin','manager','tech','accountant'\)\)/.test(full));
  const fn = n => fs.readFileSync(path.join(ROOT, 'supabase/functions', n, 'index.ts'), 'utf8');
  t('п.51: media-begin берёт предел размера из org_settings.media_mb_*', /media_mb_photo/.test(fn('media-begin')) && /BEGIN_VER = "1\.09\.42"/.test(fn('media-begin')) && src.includes("'media-begin': '1.09.42'"));
  t('п.56: у media-commit / health / view / oauth своя версия в ver', ['media-commit:COMMIT_VER', 'media-health:HEALTH_VER', 'media-view:VIEW_VER', 'media-oauth:OAUTH_VER'].every(x => { const [f, c] = x.split(':'); return new RegExp('ver: ' + c + ', lib: FN_VER').test(fn(f)); }));

  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
