/* v1.09.08 — документ работ:
     1) стандартные галочки вида задачи при создании, сумма сразу посчитана, документ «чистый»;
     2) тултип «Вид задачи» в форме задания и в шапке документа; вид OTHER;
     3) смена вида: галочки не трогали — встают стандартные нового вида без вопросов;
        свои галочки — окно с выбором; оборудование, заметка, Other services не трогаются никогда;
     4) Other services: «+ Строка», корзина у добавленных, строки в одну линию на телефоне,
        переводы под спойлером в разделе, в общей карточке переводов строк раздела нет,
        «+ Шаблон» в разделе; пилюля RU/EN идёт за текстом;
     5) «Создать пропозал» из документа: предзаполнение и автопривязка;
     6) справочник «Виды задач»: сетка стандартных галочек сохраняется и применяется;
     7) PDF (если есть jsPDF): на листе-продолжении Unit # и Property/Customer.
   jsPDF: JSPDF_UMD=/path/jspdf.umd.min.js (по умолчанию /tmp/vmtest/node_modules/jspdf/dist/jspdf.umd.min.js).
   Запуск: node tests/v1_09_08.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const PORT = process.argv[2] || 8908;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UMD = process.env.JSPDF_UMD || '/tmp/vmtest/node_modules/jspdf/dist/jspdf.umd.min.js';
const jspdfUmd = fs.existsSync(UMD) ? fs.readFileSync(UMD, 'utf8') : null;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + (typeof note === 'string' ? note : JSON.stringify(note)) : '')); }
}
async function boot(br, o){
  const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    if (jspdfUmd && /jspdf/.test(r.request().url())) return r.fulfill({ contentType: 'application/javascript', body: jspdfUmd });
    return r.abort();
  });
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.evaluate(([who, mode]) => { localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('techlog_session_v1', who); localStorage.setItem('techlog_view_mode', mode); }, [o.who || 'demo-admin', o.mode || 'mobile']);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 });
  await p.waitForTimeout(800);
  return p;
}
const wtId = (p, rx) => p.evaluate(rx => state.data.work_types.find(w => new RegExp(rx).test(w.name)).id, rx);

(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  for (const mode of ['mobile', 'desktop']){
    console.log('Документ работ — ' + mode);
    const p = await boot(br, mode === 'desktop' ? { w: 1400, h: 1000, mode } : { w: 412, h: 915, mode, touch: true });

    /* 1–2. создание */
    t('в справочнике демо есть вид OTHER', await p.evaluate(() => state.data.work_types.some(w => /^OTHER/.test(w.name))));
    await p.evaluate(() => App.addTask ? App.addTask() : addTaskModal()); await p.waitForTimeout(300);
    t('у «Вид задачи» в форме задания есть «?»', await p.evaluate(() => { const l = [...document.querySelectorAll('#overlay .lbl')].find(x => x.querySelector('.tipq') && /wt_tip/.test(x.querySelector('.tipq').getAttribute('onclick'))); return !!l; }));
    t('OTHER предлагается при создании, PROPOSAL — нет', await p.evaluate(() => { const b = [...document.querySelectorAll('#nt-wt .opt')].map(x => x.innerText); return b.some(x => /^OTHER/i.test(x)) && !b.some(x => /PROPOSAL/i.test(x)); }));
    await p.evaluate(() => { App.comboPick('cx', state.data.complexes[0].id); document.querySelector('#nt-unit').value = '55';
      [...document.querySelectorAll('#nt-wt .opt')].find(x => /STEAM/.test(x.innerText)).click(); });
    await p.evaluate(() => App.createTask()); await p.waitForTimeout(900);
    const c = await p.evaluate(() => ({ boxes: fdBoxes(jobDraft.form_data), total: jobDraft.total, dirty: jobDirty(), chk: !!document.querySelector('[data-s="steam"][data-k="deep_scrub"]:checked') }));
    t('STEAM CLEAN: стоит Deep Scrub, сумма посчитана, документ без «несохранённых правок»', JSON.stringify(c.boxes) === '["steam.deep_scrub"]' && c.total > 0 && !c.dirty && c.chk, c);
    t('вид в шапке документа — кнопка с «?»', await p.evaluate(() => !!document.querySelector('.wt-change') && /wt_tip/.test((document.querySelector('.wt-change ~ .tipq, .wt-change + .tipq') || { getAttribute(){ return ''; } }).getAttribute('onclick') || '')));

    /* 3. смена вида */
    await p.evaluate(() => App.wtChangeModal()); await p.waitForTimeout(300);
    t('окно выбора: текущий вид отмечен, есть памятка «не затрагивается»', await p.evaluate(() => { const o = document.querySelector('#overlay'); return /STEAM CLEAN ✓/.test(o.innerText) && !!o.querySelector('.note-green'); }));
    await p.evaluate(id => App.wtChangePick(id), await wtId(p, 'AIR DUCT')); await p.waitForTimeout(500);
    const s1 = await p.evaluate(() => ({ boxes: fdBoxes(jobDraft.form_data), modal: !!document.querySelector('#overlay'), dirty: jobDirty(), wt: wtById(jobDraft.work_type_id).name }));
    t('галочки не трогали → AIR DUCT: стандартные галочки без вопросов, правка видна как несохранённая', JSON.stringify(s1.boxes) === '["airduct.air_duct"]' && !s1.modal && s1.dirty && s1.wt === 'AIR DUCT', s1);
    await p.evaluate(() => { const fd = jobDraft.form_data; fd.removals.wax = true; fd.equipment[state.data.equipment_types[0].id] = { qty: 3, days: 2 }; jobDraft.note = 'моя заметка'; fd.others[0] = { desc: 'проверка', desc_en: '', amount: 40 }; });
    const vv = await wtId(p, 'VETVAG');
    await p.evaluate(id => App.wtChangePick(id), vv); await p.waitForTimeout(400);
    t('свои галочки → окно-вопрос с двумя вариантами и отменой', await p.evaluate(() => { const b = [...document.querySelectorAll('#overlay button.btn')].map(x => (x.getAttribute('onclick') || '')); return b.some(x => /wtChangeDo\('[^']+', true\)/.test(x)) && b.some(x => /wtChangeDo\('[^']+', false\)/.test(x)) && b.some(x => /closeModal/.test(x)); }));
    t('в окне названо, какие галочки встанут', await p.evaluate(() => /Wet Vac/.test(document.querySelector('#overlay').innerText)));
    await p.evaluate(id => App.wtChangeDo(id, false), vv); await p.waitForTimeout(400);
    const s2 = await p.evaluate(() => ({ boxes: fdBoxes(jobDraft.form_data), eq: Object.values(jobDraft.form_data.equipment)[0], note: jobDraft.note, oth: jobDraft.form_data.others[0].desc, wt: wtById(jobDraft.work_type_id).name }));
    t('«оставить как есть»: вид сменился, галочки, оборудование, заметка и Other services целы', /VETVAG/.test(s2.wt) && s2.boxes.includes('removals.wax') && s2.boxes.includes('airduct.air_duct') && s2.eq.qty === 3 && s2.note === 'моя заметка' && s2.oth === 'проверка', s2);
    const st = await wtId(p, 'STEAM');
    await p.evaluate(id => App.wtChangePick(id), st); await p.waitForTimeout(300);
    await p.evaluate(id => App.wtChangeDo(id, true), st); await p.waitForTimeout(400);
    const s3 = await p.evaluate(() => ({ boxes: fdBoxes(jobDraft.form_data), eq: Object.values(jobDraft.form_data.equipment)[0], note: jobDraft.note, oth: jobDraft.form_data.others[0] }));
    t('«поставить стандартные»: только Deep Scrub; оборудование, заметка и Other services целы', JSON.stringify(s3.boxes) === '["steam.deep_scrub"]' && s3.eq.qty === 3 && s3.eq.days === 2 && s3.note === 'моя заметка' && s3.oth.desc === 'проверка' && s3.oth.amount === 40, s3);

    /* 4. Other services */
    const sec = await p.evaluate(() => { const s = document.querySelector('.inv-sec[data-sec="others"]'); const has = rx => !![...s.querySelectorAll('button')].find(b => rx.test(b.getAttribute('onclick') || ''));
      return { rows: s.querySelectorAll('[data-oth-d]').length, add: has(/othAdd/), tpl: has(/extraPicker/), tr: has(/othTranslate/), extra: !!s.querySelector('#extra-list'),
        noteTpl: !![...document.querySelectorAll('.inv-sec[data-sec="note"] button')].find(b => /extraPicker/.test(b.getAttribute('onclick') || '')),
        dupInCard: [...document.querySelectorAll('.tr-card [data-tr]')].some(x => /^oth/.test(x.dataset.tr)), box: !!s.querySelector('.oth-trbox') }; });
    t('в разделе: 3 строки, «+ Строка», «+ Шаблон», «Перевести», список шаблонов; в заметке «Шаблона» больше нет', sec.rows === 3 && sec.add && sec.tpl && sec.tr && sec.extra && !sec.noteTpl, sec);
    t('переводы строк — под спойлером в разделе, в общей карточке их нет', sec.box && !sec.dupInCard, sec);
    await p.evaluate(() => { App.othAdd(); App.othAdd(); }); await p.waitForTimeout(200);
    await p.fill('#oth-d-3', 'четвёртая строка с длинным описанием работ'); await p.fill('[data-oth-a="3"]', '15'); await p.locator('#oth-d-4').focus(); await p.waitForTimeout(800);
    const s4 = await p.evaluate(() => ({ n: jobDraft.form_data.others.length, d3: jobDraft.form_data.others[3], tr: document.querySelectorAll('.oth-trbox [data-tr]').length, del: document.querySelectorAll('.oth-del').length,
      hs: [...document.querySelectorAll('.oth-line')].map(r => Math.round(r.getBoundingClientRect().height)), cur: [...document.querySelectorAll('.oth-line')].findIndex(r => r.classList.contains('oth-cur')) }));
    t('добавлены 2 строки: текст и сумма в документе, корзина только у добавленных', s4.n === 5 && s4.d3.desc.startsWith('четвёртая') && s4.d3.amount === 15 && s4.del === 2, s4);
    t('зона переводов выросла вместе со строками (2 русские строки)', s4.tr === 2, s4.tr);
    t('все строки в одну линию одинаковой высоты; строка с курсором подсвечена', new Set(s4.hs).size === 1 && s4.hs[0] < 60 && s4.cur === 4, s4);
    await p.fill('#oth-d-4', 'english row'); await p.waitForTimeout(150);
    const l1 = await p.evaluate(() => [state.dictLang, (document.querySelector('.oth-tools .lang-seg .on') || {}).textContent]);
    await p.fill('#oth-d-4', 'english и русский'); await p.waitForTimeout(150);
    const l2 = await p.evaluate(() => [state.dictLang, (document.querySelector('.oth-tools .lang-seg .on') || {}).textContent, localStorage.getItem('techlog_dictlang')]);
    t('пилюля: латиница → EN, появилась кириллица → RU; личная настройка не переписана', l1[0] === 'en-US' && l1[1] === 'EN' && l2[0] === 'ru-RU' && l2[1] === 'RU' && l2[2] !== 'en-US', [l1, l2]);
    await p.evaluate(() => App.othDel(1)); await p.waitForTimeout(100);
    t('первые три строки не удаляются', await p.evaluate(() => jobDraft.form_data.others.length) === 5);
    await p.evaluate(() => App.othDel(4)); await p.waitForTimeout(200);
    t('добавленная строка удаляется', await p.evaluate(() => jobDraft.form_data.others.length) === 4);
    await p.evaluate(() => App.saveJob(false)); await p.waitForTimeout(900);
    t('сохранение: вид, строки и сумма в базе, правок не осталось', await p.evaluate(() => { const j = state.data.jobs.find(x => x.id === jobDraft.id); return /STEAM/.test(wtById(j.work_type_id).name) && j.form_data.others.length === 4 && j.total > 0 && !jobDirty(); }));

    /* 7. PDF */
    if (jspdfUmd){
      const txt = await p.evaluate(() => { jobDraft.note_en = 'Long note. '.repeat(60); jobDraft.note = jobDraft.note_en;
        const calls = []; const doc = buildInvoicePdfDoc(true); const raw = doc.output(); return { unit: raw.includes('(Unit #:)'), prop: raw.includes('(Property/Customer:)'), att: raw.includes('INVOICE ATTACHMENT') }; });
      t('PDF: лист-продолжение есть, на нём Unit # и Property/Customer', txt.att && txt.unit && txt.prop, txt);
      await p.evaluate(() => { const j = state.data.jobs.find(x => x.id === jobDraft.id); jobDraft.note = j.note; jobDraft.note_en = j.note_en; });
    } else console.log('  · jsPDF не найден — проверка PDF пропущена');

    /* 5. пропозал из задачи */
    t('в зоне PROPOSAL есть «Создать пропозал»', await p.evaluate(() => !![...document.querySelectorAll('#app button')].find(b => /propFromJob/.test(b.getAttribute('onclick') || ''))));
    const jid = await p.evaluate(() => jobDraft.id);
    await p.evaluate(() => App.propFromJob()); await p.waitForTimeout(700);
    t('пропозал открыт с тем же комплексом и юнитом', await p.evaluate(j => { const x = state.data.jobs.find(y => y.id === j); return state.screen === 'proposals' && !!propDraft && propDraft.complex_id === x.complex_id && propDraft.counterparty_id === x.counterparty_id && propDraft.unit_number === '55'; }, jid));
    await p.evaluate(() => { propDraft.items = [{ q: 1, code: 'X', d: 'test', a: 100 }]; return App.saveProposal(); }); await p.waitForTimeout(900);
    t('после сохранения пропозал привязан к задаче', await p.evaluate(j => { const x = state.data.jobs.find(y => y.id === j); return !!x.proposal_id && !!propById(x.proposal_id); }, jid));

    /* 6. справочник */
    await p.evaluate(() => { propDraft = null; App.go('dirs'); App.dirTab('worktypes'); }); await p.waitForTimeout(400);
    const dm = await wtId(p, 'DEMOLITION');
    await p.evaluate(id => App.editWtModal(id), dm); await p.waitForTimeout(400);
    t('в карточке вида — сетка стандартных галочек (все разделы бланка)', await p.evaluate(() => document.querySelectorAll('#overlay [data-wtbox]').length) === await p.evaluate(() => WT_BOX_KEYS.length));
    await p.evaluate(() => { const c = document.querySelector('#overlay [data-wtbox="other.trash_out"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.evaluate(id => { const w = wtById(id); return App.saveWt(id, w.sort || 0); }, dm); await p.waitForTimeout(600);
    t('набор сохранён и остальные поля вида целы', await p.evaluate(id => { const w = wtById(id); return JSON.stringify(w.preset) === '["other.trash_out"]' && /DEMOLITION/.test(w.name) && !!w.color; }, dm));
    await p.evaluate(() => { App.go('home'); App.addTask ? App.addTask() : addTaskModal(); }); await p.waitForTimeout(300);
    await p.evaluate(() => { App.comboPick('cx', state.data.complexes[0].id); [...document.querySelectorAll('#nt-wt .opt')].find(x => /DEMOLITION/.test(x.innerText)).click(); });
    await p.evaluate(() => App.createTask()); await p.waitForTimeout(900);
    t('новая задача DEMOLITION получила настроенную галочку Trash Out', await p.evaluate(() => JSON.stringify(fdBoxes(jobDraft.form_data)) === '["other.trash_out"]'));
    await p.context().close();
  }
  await br.close();
  console.log(`\nИтог: ✓ ${ok} · ✗ ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
