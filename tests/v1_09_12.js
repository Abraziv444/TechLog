/* v1.09.12 — вторая пачка замечаний. Демо-режим (config.js = {}), CDN режутся.
   Проверяется: плашки главной в одну строку; одна строка дня; «Перенести день» скрыт по умолчанию;
   мини-окно печати с карточки и из шапки документа; отметки нового бланка в документе и в данных;
   буква U в номере документа и имени файла; поиск по настройкам и лента за прокруткой; переводы —
   подраздел «Настроек документов»; «Контроль отправки» молчит до входа и по умолчанию тихий;
   файл ждёт документ из очереди записей и не выбрасывается на NO_ACCESS (логика помощников);
   журнал отправки — текстом; окно «уведомления не включились»; своё название трекера.
   Запуск: node tests/v1_09_12.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8912;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + (typeof note === 'string' ? note : JSON.stringify(note)) : '')); }
}
async function boot(br, o, who){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
  await p.evaluate(([w, mode]) => { localStorage.clear(); sessionStorage.clear();
    if (w) localStorage.setItem('techlog_session_v1', w); localStorage.setItem('techlog_view_mode', mode); }, [who === undefined ? 'demo-admin' : who, o.mode]);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1800);
  return p;
}
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  /* ---- до входа: контроль отправки молчит ---- */
  { const p = await boot(br, { w: 412, h: 915, mode: 'mobile', touch: true }, '');
    const r = await p.evaluate(() => { mqLog('⛔ проба', 'err'); mediaBadge();
      const b = document.getElementById('tl-net'); return { mini: !!document.getElementById('mq-mini'), badge: b ? getComputedStyle(b).display : 'none', user: !!state.user }; });
    t('до входа: полоски контроля отправки и таблички очереди нет', !r.user && !r.mini && r.badge === 'none', r);
    await p.context().close(); }

  for (const o of [{ w: 1400, h: 1000, mode: 'desktop' }, { w: 412, h: 915, mode: 'mobile', touch: true }]){
    console.log('— ' + o.mode + ' —');
    const p = await boot(br, o);
    /* главная: обе плашки в одну строку */
    await p.evaluate(() => { const today = todayISO(); const j = state.data.jobs[0]; j.status = 'done';
      const pl = state.data.placements.find(x => !x.picked_up) ; if (pl){ pl.due_date = '2026-01-05'; pl.technician_id = state.user.id; }
      state.filterMine = false; App.go('home'); });
    await p.waitForTimeout(500);
    const bn = await p.evaluate(() => { const row = document.getElementById('banner-row'); if (!row) return null;
      const a = row.children[0].getBoundingClientRect(), b = row.children[1].getBoundingClientRect();
      return { n: row.children.length, sameRow: Math.abs(a.top - b.top) < 2, noOverlap: a.right <= b.left + 1, fit: b.right <= innerWidth + 1, h: [Math.round(a.height), Math.round(b.height)] }; });
    t('«Ждут апрува» и «Пикап сегодня» стоят в одной строке и не вылезают', bn && bn.n === 2 && bn.sameRow && bn.noOverlap && bn.fit, bn);
    const db = await p.evaluate(() => { const b = document.getElementById('day-bar'); const r = b.getBoundingClientRect();
      const kids = [...b.querySelectorAll('.day-bar-tools > *')].map(e => e.getBoundingClientRect());
      return { h: Math.round(r.height), oneLine: kids.every(k => Math.abs(k.top + k.height / 2 - (r.top + r.height / 2)) < 12), inside: kids.every(k => k.right <= innerWidth + 1),
        move: !!document.querySelector('.tpl-move'), loose: !!document.querySelector('#app > .today-jump') }; });
    t('строка дня — одна строка: дата · карта · «?»; отдельных кнопок под лентой нет', db.oneLine && db.inside && db.h <= 48 && !db.loose, db);
    t('«Перенести день» по умолчанию скрыт', !db.move);
    await p.evaluate(() => { state.data.org_settings.day_move_on = true; render(); }); await p.waitForTimeout(200);
    /* v1.09.26: «Перенести день» не используется — выключен совсем, даже если в базе осталась прежняя настройка */
    t('v1.09.26: «Перенести день» выключен — кнопки нет даже при старой настройке в базе', await p.evaluate(() => !document.querySelector('#day-bar .tpl-move') && !document.querySelector('.tpl-move')));
    await p.evaluate(() => { state.selDate = '2026-01-07'; state.weekStart = mondayOf(state.selDate); render(); }); await p.waitForTimeout(200);
    t('другой день — «сегодня» тоже в строке дня', await p.evaluate(() => !!document.querySelector('#day-bar .today-jump') && document.getElementById('day-bar').getBoundingClientRect().height <= 48));
    await p.evaluate(() => App.jumpToday()); await p.waitForTimeout(200);

    /* печать: мини-окно с карточки */
    const jid = await p.evaluate(() => state.data.jobs[0].id);
    await p.evaluate(id => App.jobPrint(id), jid); await p.waitForTimeout(300);
    t('кнопка печати на карточке открывает мини-окно с двумя вариантами', await p.evaluate(() => !!document.querySelector('#overlay #pr-dl') && !!document.querySelector('#overlay #pr-view')));
    await p.evaluate(() => App.closeModal());

    /* документ: отметки нового бланка, кнопка печати в шапке */
    await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(600);
    const frm = await p.evaluate(() => ({ flags: ['emergency', 'no_water', 'second_call', 'f_proposal'].every(k => !!document.querySelector(`#inv-flags input[data-s="root"][data-k="${k}"]`)),
      po: !!document.getElementById('jb-po'), print: !!document.getElementById('db-print'),
      boxes: ['steam|portable', 'removals|imprint', 'other|crb'].every(x => { const [s, k] = x.split('|'); return !!document.querySelector(`input[data-s="${s}"][data-k="${k}"]`); }) }));
    t('в документе есть Emergency call / No water / Second call / Proposal, PO, Portable, Imprint Removal, Crb Machine и кнопка печати в шапке', frm.flags && frm.po && frm.print && frm.boxes, frm);
    await p.evaluate(() => { document.querySelectorAll('.inv-sec[data-sec]').forEach(el => { try{ invSecToggle(el.dataset.sec, true); }catch(e){} }); });
    await p.evaluate(() => { const c = document.querySelector('#inv-flags input[data-k="emergency"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
      const i = document.getElementById('jb-po'); i.value = 'PO-778'; i.dispatchEvent(new Event('change', { bubbles: true })); });
    t('галочка и PO попадают в данные документа и делают его изменённым', await p.evaluate(() => jobDraft.form_data.emergency === true && jobDraft.form_data.po === 'PO-778' && jobDirty()));
    await p.evaluate(() => App.printMenu()); await p.waitForTimeout(300);
    t('кнопка печати в шапке документа открывает то же мини-окно', await p.evaluate(() => !!document.querySelector('#overlay #pr-dl')));
    await p.evaluate(() => App.closeModal());
    const names = await p.evaluate(() => ({ no: docNo('job', jobDraft), f: invFileName(jobDraft), unit: jobDraft.unit_number }));
    t('U перед юнитом в номере документа и имени файла', names.no.includes('U' + String(names.unit).toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 6)) && /_U[A-Z0-9.]+_\d{4}-\d\d-\d\d\.pdf$/.test(names.f), names);
    await p.evaluate(() => { App.saveJob(false); }); await p.waitForTimeout(700);
    await p.evaluate(() => { try{ App.jobClose(); }catch(e){} }); await p.waitForTimeout(400);

    /* настройки: поиск, переводы внутри «Настроек документов», лента за прокруткой */
    await p.evaluate(() => { localStorage.removeItem('techlog_fold'); App.go('settings'); }); await p.waitForTimeout(600);
    t('в ленте разделов нет отдельного пункта переводов; поле поиска на месте', await p.evaluate(() => !document.querySelector('#set-nav [data-k="tr"]') && !!document.getElementById('set-q')));
    await p.fill('#set-q', o.mode === 'desktop' ? 'переводить автомат' : 'лимит'); await p.waitForTimeout(500);
    const hits = await p.evaluate(() => [...document.querySelectorAll('#set-res .set-hit b')].map(b => b.textContent));
    t('поиск по настройкам находит пункты', hits.length > 0, hits.slice(0, 4));
    await p.click('#set-res .set-hit'); await p.waitForTimeout(900);
    const go = await p.evaluate(() => { const f = document.querySelector('.set-flash'); if (!f) return null; const r = f.getBoundingClientRect();
      return { vis: r.top >= 0 && r.bottom <= innerHeight + 4, docs: document.getElementById('fold-docs').classList.contains('on'), sub: !!f.closest('.fold-sub'), tr: !!document.getElementById('fold-tr') }; });
    t('результат раскрывает раздел и подраздел, пункт подсвечен и на экране', go && go.vis && go.docs, go);
    if (o.mode === 'desktop') t('«Переводы» — подраздел «Настроек документов»', go && go.tr && go.sub, go);
    /* лента за прокруткой */
    await p.evaluate(() => { ['docs', 'push', 'cam', 'dgs', 'misc'].forEach(k => foldSet(k, true)); render(); pageScrollTo(0, false); }); await p.waitForTimeout(1600);
    await p.evaluate(off => { const el = document.getElementById('fold-cam'); pageScrollTo(pageScrollY() + el.getBoundingClientRect().top - off, false); }, o.mode === 'desktop' ? 100 : 60); await p.waitForTimeout(700);
    const spy = await p.evaluate(() => { const b = document.querySelector('#set-nav .set-nav-b.on'); const nav = document.getElementById('set-nav'); if (!b) return null;
      const r = b.getBoundingClientRect(), n = nav.getBoundingClientRect(); return { k: b.dataset.k, inView: r.left >= n.left - 2 && r.right <= n.right + 2 }; });
    t('лента разделов едет за прокруткой: подсвечен раздел у верха экрана, пункт виден в ленте', spy && spy.k === 'cam' && spy.inView, spy);

    /* контроль отправки: тихий по умолчанию; файл ждёт документ; NO_ACCESS не выбрасывает */
    const mq = await p.evaluate(async () => {
      const quietDef = mqQuiet();
      const j = state.data.jobs[0]; const it = { qid: 'q1', doc: 'job', job_id: j.id, kind: 'photo', blob: { size: 1000 }, attempts: 0 };
      const before = mqOwnerPending(it); pendingAdd('upsert', 'jobs', j); const during = mqOwnerPending(it); pendingDone('upsert', 'jobs', j.id); const after = mqOwnerPending(it);
      const why = mqNoAccessWhy(it), whyGone = mqNoAccessWhy({ doc: 'job', job_id: 'нет-такого', kind: 'photo' });
      mqLog('⛔ ' + mqLabel(it) + ' — проба', 'err'); const txt = mqLogText();
      return { quietDef, before, during, after, keep: why.keep, whyText: why.text.length > 20, gone: whyGone.keep === false, txt: /TechLog v1\.\d\d\.\d\d/.test(txt) && /проба/.test(txt) }; });
    t('«показывать только когда не отправлено» включено по умолчанию', mq.quietDef === true);
    t('файл ждёт документ, пока тот в очереди записей', !mq.before && mq.during && !mq.after, mq);
    t('NO_ACCESS: документ на устройстве есть — файл остаётся, причина словами; документа нет — убирается', mq.keep && mq.whyText && mq.gone, mq);
    t('журнал отправки собирается в текст с версией и строками', mq.txt);
    await p.evaluate(() => App.mediaQueueModal()); await p.waitForTimeout(300);
    t('в окне «Контроль отправки…» есть «Копировать» и «Скачать лог»', await p.evaluate(() => !!document.getElementById('mq-log-dl') && !!document.getElementById('mq-log-copy') && /Контроль отправки/.test(document.querySelector('#overlay h3').textContent)));
    await p.evaluate(() => App.closeModal());

    /* уведомления не включились */
    await p.evaluate(() => { PB.lastErr = 'проба причины'; pbFailPop(); }); await p.waitForTimeout(250);
    t('окно «Уведомления не включились» с причиной и кнопкой «Включить ещё раз»', await p.evaluate(() => !!document.getElementById('push-fail') && /проба причины/.test(document.getElementById('push-fail').textContent)));
    await p.evaluate(() => App.closeModal());

    /* подсказка «?» закрывается нажатием мимо */
    await p.evaluate(() => App.toastInfo('net_hide_tip')); await p.waitForTimeout(700);
    const had = await p.evaluate(() => !!document.querySelector('.toast.tap .t-x'));
    await p.mouse.click(5, o.h - 5); await p.waitForTimeout(250);
    t('подсказка «?»: виден крестик, нажатие мимо её убирает', had && await p.evaluate(() => !document.querySelector('.toast.tap')));

    /* статистика связи: личная галочка */
    await p.evaluate(() => App.netHideSet(true)); await p.waitForTimeout(400);
    t('«Скрыть статистику связи»: бейдж в шапке спрятан, пока связь в порядке', await p.evaluate(() => { const b = document.querySelector('button.net-pill'); return !b || b.hidden || netState() !== 'on'; }));
    await p.evaluate(() => App.netHideSet(false));

    /* трекеры: своё название */
    if (o.mode === 'desktop'){
      const lab = await p.evaluate(async () => { const d = (state.data.bn_devices || [])[0]; if (!d) return { skip: true };
        App.trkLabel(String(d.imei)); await new Promise(r => setTimeout(r, 200));
        const i = document.getElementById('trk-label-in'); if (!i) return { noModal: true }; i.value = 'Склад — белый фургон';
        await App.trkLabelSave(String(d.imei)); return { label: bnDevLabel(bnDevByImei(String(d.imei))) }; });
      t('своё название трекера сохраняется и показывается первым', lab.skip || lab.label === 'Склад — белый фургон', lab);
    }
    await p.context().close();
  }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})();
