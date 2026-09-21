/* v1.09.16 — чек-лист вида задачи как настраиваемый список: редактор (добавить, удалить, переставить,
   RU/EN, «обязательный», копирование из другого вида), отметки в документе по id пункта — не съезжают
   при правке списка, старые отметки по номеру читаются и переводятся на id, предупреждение об
   обязательных пунктах, менеджеру — только чтение. Демо-режим. Запуск: node tests/v1_09_16.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8916;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 340) : '')); } }
async function boot(br, o, who){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
  await p.evaluate(([w, mode]) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('techlog_session_v1', w); localStorage.setItem('techlog_view_mode', mode); }, [who, o.mode]);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1600);
  return p;
}
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  for (const o of [{ w: 1400, h: 1000, mode: 'desktop' }, { w: 412, h: 915, mode: 'mobile', touch: true }]){
    console.log('— ' + o.mode + ' —');
    const p = await boot(br, o, 'demo-admin');
    /* вид задачи со СТАРЫМ текстовым списком и документ со СТАРЫМИ отметками по номеру строки */
    const prep = await p.evaluate(() => { const j = state.data.jobs[0]; const w = wtById(j.work_type_id);
      w.checklist = ['Шланги | Hoses', 'Насадки', 'Химия']; j.form_data.cl = { 1: true };               // отмечены «Насадки»
      const other = state.data.work_types.find(x => x.id !== w.id); other.checklist = ['Химия', { id: 'zz1', t: 'Перчатки | Gloves', req: true }];
      return { wt: w.id, job: j.id, other: other.id, ids: clItems(w).map(i => i.id) }; });
    t('старый текстовый список читается как пункты с постоянными id', prep.ids.length === 3 && new Set(prep.ids).size === 3);
    await p.evaluate(() => { App.go('dirs'); App.dirTab ? App.dirTab('work_types') : null; }); await p.waitForTimeout(500);
    await p.evaluate(id => App.wtChecklistModal(id), prep.wt); await p.waitForTimeout(300);
    const ed = await p.evaluate(() => { const rows = [...document.querySelectorAll('#cl-ed .cl-row')]; const m = document.querySelector('#overlay .modal').getBoundingClientRect();
      return { n: rows.length, ru0: rows[0].querySelector('.cl-ru').value, en0: rows[0].querySelector('.cl-en').value, add: !!document.getElementById('cl-add'), copy: !!document.getElementById('cl-copy'),
        fit: rows.every(r => { const b = r.getBoundingClientRect(); return b.left >= m.left - 1 && b.right <= m.right + 1; }), btn: [...document.querySelectorAll('#cl-ed .cl-acts .btn')].every(b => b.getBoundingClientRect().width >= 38) }; });
    t('редактор: три строки, «Шланги | Hoses» разложено на RU и EN, есть «+ Пункт» и «Скопировать из вида», строки в границах окна', ed.n === 3 && ed.ru0 === 'Шланги' && ed.en0 === 'Hoses' && ed.add && ed.copy && ed.fit && ed.btn, ed);
    /* вставляем новый пункт ПЕРВЫМ, переименовываем «Насадки», удаляем «Химия», копируем из другого вида */
    await p.click('#cl-add'); await p.waitForTimeout(150);
    await p.evaluate(() => { const rows = document.querySelectorAll('#cl-ed .cl-row'); const last = rows[rows.length - 1]; last.querySelector('.cl-ru').value = 'Ключи от юнита'; last.querySelector('.cl-en').value = 'Unit keys'; last.querySelector('.cl-req').checked = true; });
    await p.evaluate(() => { App.clEdMove(3, -1); App.clEdMove(2, -1); App.clEdMove(1, -1); }); await p.waitForTimeout(150);
    await p.evaluate(() => { const rows = [...document.querySelectorAll('#cl-ed .cl-row')]; const r = rows.find(x => x.querySelector('.cl-ru').value === 'Насадки'); r.querySelector('.cl-ru').value = 'Насадки и щётки'; });
    await p.evaluate(() => { const rows = [...document.querySelectorAll('#cl-ed .cl-row')]; App.clEdDel(rows.findIndex(x => x.querySelector('.cl-ru').value === 'Химия')); }); await p.waitForTimeout(150);
    await p.selectOption('#cl-copy', prep.other); await p.waitForTimeout(250);
    const beforeSave = await p.evaluate(() => [...document.querySelectorAll('#cl-ed .cl-ru')].map(i => i.value));
    t('перестановка ▲, удаление и копирование работают в окне (скопированы оба пункта другого вида)', beforeSave.join('|') === 'Ключи от юнита|Шланги|Насадки и щётки|Химия|Перчатки', beforeSave);
    await p.click('#cl-save'); await p.waitForTimeout(600);
    const saved = await p.evaluate(({ wt, ids }) => { const items = clItems(wtById(wt)); return { t: items.map(i => i.t), req: items.filter(i => i.req).map(i => i.t), keptId: items.find(i => /Насадки/.test(i.t)).id === ids[1],
      objs: wtById(wt).checklist.every(x => x && typeof x === 'object' && x.id), log: (state.data.audit_log || []).some(a => a.action === 'wt_checklist'),
      btn: (document.querySelector('.wt-cl-btn') || {}).textContent }; }, prep);
    t('сохранено списком объектов с id; переименованный пункт сохранил id; обязательные помечены; запись в журнале', saved.objs && saved.keptId && saved.req.length === 2 && saved.t[0] === 'Ключи от юнита | Unit keys' && saved.log, saved);
    const legacy = await p.evaluate(({ job, ids }) => { const cl = state.data.jobs.find(j => j.id === job).form_data.cl; return { keys: Object.keys(cl), isNasadki: Object.keys(cl).join() === ids[1] }; }, prep);
    t('при сохранении списка старая отметка документа (по номеру строки) переведена на id своего пункта', legacy.isNasadki, legacy);
    /* документ: старая отметка «по номеру 1» была у «Насадки» — после вставки пункта первым она НЕ съехала */
    await p.evaluate(id => App.openJob(id), prep.job); await p.waitForTimeout(700);
    const doc = await p.evaluate(() => { const labs = [...document.querySelectorAll('#cl-card label.opt')]; return { n: labs.length, on: labs.filter(l => l.querySelector('input').checked).map(l => l.textContent.replace(/\s+/g, ' ').trim()),
      chip: document.querySelector('#cl-card .chip').textContent, stars: document.querySelectorAll('#cl-card .cl-star').length, dirty: jobDirty() }; });
    t('карточка чек-листа в документе: 5 пунктов, две звёздочки обязательных, отмечены по-прежнему «Насадки…», документ не считается изменённым',
      doc.n === 5 && doc.stars === 2 && !doc.dirty && doc.on.length === 1 && /Насадки и щётки/.test(doc.on[0]), doc);
    await p.evaluate(() => { const items = clItems(wtById(jobDraft.work_type_id)); jobDraft.form_data.cl = {}; App.clToggle(items.find(i => /Насадки/.test(i.t)).id, true); }); await p.waitForTimeout(200);
    const idMark = await p.evaluate(() => Object.keys(jobDraft.form_data.cl));
    t('новая отметка хранится по id пункта, а не по номеру', idMark.length === 1 && !/^\d+$/.test(idMark[0]), idMark);
    await p.evaluate(() => App.saveJob(false)); await p.waitForTimeout(800);
    /* админ снова вставляет пункт в начало — отметка остаётся у «Насадки и щётки» */
    await p.evaluate(wt => { const w = wtById(wt); w.checklist = [{ id: 'new0', t: 'Бахилы' }].concat(w.checklist); render(); }, prep.wt); await p.waitForTimeout(300);
    const kept = await p.evaluate(() => [...document.querySelectorAll('#cl-card label.opt')].filter(l => l.querySelector('input').checked).map(l => l.textContent.replace(/\s+/g, ' ').trim()));
    t('после вставки пункта в начало списка отметка осталась у «Насадки и щётки»', kept.length === 1 && /Насадки и щётки/.test(kept[0]), kept);
    /* обязательные пункты — предупреждение при «Выполнено», сохранение не блокируется */
    const miss = await p.evaluate(() => clMissingReq(jobDraft));
    t('не отмеченные обязательные пункты находятся (для предупреждения)', miss.length === 2 && miss.some(x => /Ключи/.test(x)), miss);
    const warn = await p.evaluate(async () => { const c = document.getElementById('jb-done'); if (c) c.checked = true; await App.saveJob(false); await new Promise(r => setTimeout(r, 500));
      return { toast: [...document.querySelectorAll('#toasts .toast')].some(x => /обязательные пункты/.test(x.textContent)), status: state.data.jobs.find(j => j.id === jobDraft.id).status }; });
    t('«Выполнено» с пропущенным обязательным пунктом: предупреждение есть, документ всё равно сохранён', warn.toast && warn.status !== 'draft', warn);
    /* старая отметка по номеру переводится на id при первой правке */
    const mig = await p.evaluate(() => { const items = clItems(wtById(jobDraft.work_type_id)); jobDraft.form_data.cl = { 0: true, 2: true }; App.clToggle(items[4].id, true); const k = Object.keys(jobDraft.form_data.cl);
      return { k, ok: k.length === 3 && k.every(x => !/^\d+$/.test(x)) && k.includes(items[0].id) && k.includes(items[2].id) }; });
    t('старые отметки по номеру переводятся на id при первой правке', mig.ok, mig.k);
    await p.context().close();
  }
  { console.log('— менеджер —');
    const p = await boot(br, { w: 1400, h: 1000, mode: 'desktop' }, 'demo-manager');
    const r = await p.evaluate(() => { const w = state.data.work_types[0]; w.checklist = ['Один', 'Два']; App.wtChecklistModal(w.id);
      return { ro: [...document.querySelectorAll('#cl-ed .cl-ru')].every(i => i.readOnly), noSave: !document.getElementById('cl-save'), noAdd: !document.getElementById('cl-add'), noActs: !document.querySelector('#cl-ed .cl-acts') }; });
    t('менеджер видит список только для чтения', r.ro && r.noSave && r.noAdd && r.noActs, r);
    await p.context().close(); }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
