/* v1.09.11 — «Несохранённые изменения» без правок.
   Демо-данные приводятся к тому виду, в каком документ возвращает PostgreSQL: ключи jsonb на
   всех уровнях отсортированы по длине и по байтам; у одного документа вдобавок убраны разделы,
   которых не было в старых версиях (aux_take, extra). Проверяется:
     1) нетронутый документ не считается изменённым; крестик и «Назад» в шапке закрывают его
        без вопроса; системная «назад» не пересохраняет (updated_at и журнал не меняются);
     2) настоящая правка любого рода по-прежнему ловится: галочка, заметка, строка Other services,
        количество оборудования, вид задачи, юнит, состав бригады;
     3) после «Сохранить» документ снова чистый.
   Запуск: node tests/v1_09_11.js [порт]. Демо-режим (config.js = {}), CDN режутся. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8911;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + (typeof note === 'string' ? note : JSON.stringify(note)) : '')); }
}
const SEED = () => {
  const jsonb = v => { if (Array.isArray(v)) return v.map(jsonb);
    if (v && typeof v === 'object'){ const o = {}; Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).forEach(k => { o[k] = jsonb(v[k]); }); return o; } return v; };
  const d = JSON.parse(localStorage.getItem('techlog_state_v1'));
  d.jobs.forEach(j => { j.form_data = jsonb(j.form_data); j.updated_at = '2026-01-01T00:00:00.000Z'; });
  if (d.jobs[1]){ delete d.jobs[1].form_data.aux_take; delete d.jobs[1].form_data.extra; }
  localStorage.setItem('techlog_state_v1', JSON.stringify(d));
  localStorage.removeItem('techlog_draft');
};
async function boot(br, o){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
  await p.evaluate(([who, mode]) => { localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('techlog_session_v1', who); localStorage.setItem('techlog_view_mode', mode); }, ['demo-admin', o.mode]);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(2500);
  await p.evaluate(SEED);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(800);
  return p;
}

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  for (const o of [{ w: 1400, h: 1000, mode: 'desktop' }, { w: 412, h: 915, mode: 'mobile', touch: true }]){
    console.log('— ' + o.mode + ' —');
    const p = await boot(br, o);
    const ids = await p.evaluate(() => state.data.jobs.map(j => j.id));
    t('данные приведены к серверному виду: порядок ключей form_data не как в бланке', await p.evaluate(() => Object.keys(state.data.jobs[0].form_data).join() !== Object.keys(emptyFormData()).join()));

    for (const [i, id] of ids.entries()){
      const tag = i === 1 ? 'документ старой версии (без aux_take и extra)' : 'документ с сервера';
      await p.evaluate(id => App.openJob(id), id); await p.waitForTimeout(500);
      t(tag + ': после открытия не считается изменённым, точки «не сохранено» нет', await p.evaluate(() => !jobDirty() && !document.querySelector('.dirty-dot')));
      await p.evaluate(() => App.jobClose()); await p.waitForTimeout(400);
      t(tag + ': закрытие без вопроса «Несохранённые изменения»', await p.evaluate(() => !document.querySelector('#overlay') && state.screen !== 'job'));
    }
    /* системная «назад» не пересохраняет нетронутый документ */
    await p.evaluate(id => App.openJob(id), ids[0]); await p.waitForTimeout(500);
    const before = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return { u: j.updated_at, a: (state.data.audit_log || []).length }; }, ids[0]);
    await p.evaluate(() => App.back()); await p.waitForTimeout(900);
    const after = await p.evaluate(id => { const j = state.data.jobs.find(x => x.id === id); return { u: j.updated_at, a: (state.data.audit_log || []).length, scr: state.screen }; }, ids[0]);
    t('системная «назад»: документ закрыт, в базу не писался (updated_at и журнал прежние)', after.scr !== 'job' && after.u === before.u && after.a === before.a, { before, after });

    /* настоящие правки ловятся */
    const edits = [
      ['галочка бланка', () => { const fd = jobDraft.form_data; fd.removals.wax = !fd.removals.wax; }],
      ['заметка', () => { jobDraft.note = (jobDraft.note || '') + ' правка'; }],
      ['строка Other services', () => { jobDraft.form_data.others[0] = { desc: 'new line', desc_en: '', amount: 15 }; }],
      ['количество оборудования', () => { const et = state.data.equipment_types[0].id; const e = jobDraft.form_data.equipment[et] || { qty: 0, days: 1 }; jobDraft.form_data.equipment[et] = { ...e, qty: (+e.qty || 0) + 1 }; }],
      ['вид задачи', () => { jobDraft.work_type_id = state.data.work_types.find(w => w.id !== jobDraft.work_type_id).id; }],
      ['номер юнита', () => { jobDraft.unit_number = String(jobDraft.unit_number || '') + 'A'; }],
      ['состав бригады', () => { const h = state.data.profiles.find(x => x.id !== jobDraft.technician_id && !(jobDraft.helper_ids || []).includes(x.id)); jobDraft.helper_ids = [...(jobDraft.helper_ids || []), h.id]; }],
    ];
    for (const [name, fn] of edits){
      await p.evaluate(id => App.openJob(id), ids[0]); await p.waitForTimeout(350);
      await p.evaluate(`(${fn.toString()})()`);
      t('правка «' + name + '» — документ считается изменённым', await p.evaluate(() => jobDirty()));
      await p.evaluate(() => { App.jobClose(); }); await p.waitForTimeout(300);
      const asked = await p.evaluate(() => !!document.querySelector('#overlay'));
      if (name === 'галочка бланка') t('и закрытие спрашивает про несохранённые изменения', asked);
      if (asked) await p.evaluate(() => App.jobDrop()); await p.waitForTimeout(250);
    }
    /* после сохранения — снова чистый */
    await p.evaluate(id => App.openJob(id), ids[0]); await p.waitForTimeout(400);
    await p.evaluate(() => { jobDraft.note = 'saved note'; const el = document.querySelector('#jb-note'); if (el) el.value = 'saved note'; });
    await p.evaluate(() => App.saveJob(false)); await p.waitForTimeout(1000);
    t('после «Сохранить» документ снова чистый', await p.evaluate(() => state.screen === 'job' && !jobDirty()));
    await p.context().close();
  }
  await br.close();
  console.log(`\nИтог: ✓ ${ok} · ✗ ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
