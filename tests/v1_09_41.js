/* v1.09.41 — второй пакет «Замечаний по коду v1.09.38»: ремонт «только посмотреть» (п. 17), своя справка экрана «Ремонт»
   и «Моей машины» (п. 19, 48), классы этапов (п. 25), комплекс без владельца (п. 27), «Блоки Note» и «ремонтная работа» (п. 28),
   номер машины через «Автомобили» (п. 29), настройки пропозалов/ремонта (п. 30–31), фильтры журнала (п. 32), поиск (п. 33, 58),
   заявки на продление и «Ждут апрува» (п. 34–35), бригада (п. 36), баннер пикапов (п. 37), «Назад» документа (п. 38),
   «завис» (п. 39), своя колонка на Доске и лента недели (п. 40–41), окно склада (п. 43), «EN» заметки пикапа (п. 44),
   цвет контрагента (п. 47), поиск в сообщениях (п. 49). Демо-режим. Запуск: node tests/v1_09_41.js [порт]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8099;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 700) : '')); } }
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const p = await (await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_view_mode', 'desktop'); });
  const login = async role => {
    await p.evaluate(r => { localStorage.setItem('techlog_session_v1', 'demo-' + r); }, role);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length && state.user, null, { timeout: 20000 });
    await p.waitForTimeout(600);
  };
  const html = () => p.evaluate(() => document.querySelector('#app').innerHTML);

  /* ---------- п. 17: ремонт чужого автора — только просмотр ---------- */
  await login('admin');
  const repId = await p.evaluate(() => {
    const cx = state.data.complexes[0];
    const r = { id: uid(), no: 911, date: todayISO(), status: 'draft', counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: '41',
      items: [{ q: 1, code: '', d: 'W', a: 100 }], materials: [], sales_tax: 0, freight: 0, created_by: 'demo-admin', helper_ids: ['demo-tech'], created_at: new Date().toISOString() };
    (state.data.repairs = state.data.repairs || []).push(r); state.data.org_settings.rep_hide_prices = false; saveLocal(); return r.id;
  });
  await p.waitForTimeout(1700);
  await login('tech');
  const ro = await p.evaluate(async id => {
    openRepair(id); await new Promise(r => setTimeout(r, 200));
    const h = document.querySelector('#app').innerHTML;
    const fs = [...document.querySelectorAll('fieldset.rep-fs')];
    const before = repById(id).status; await repSetStatus('sent'); const after = repDraft.status;
    return { ro: repRo(repDraft), banner: !!document.getElementById('rep-ro'), fsDis: fs.length >= 2 && fs.every(f => f.disabled),
      save: /App\.saveRepair\(\)/.test(h), send: /App\.repSetStatus\('sent'\)/.test(h) && !/disabled[^>]*onclick="App\.repSetStatus\('sent'\)"/.test(h), before, after, dirty: repDirty() };
  }, repId);
  t('п.17: помощник открывает чужой ремонт — плашка «только просмотр», поля в fieldset[disabled], нет «Сохранить»', ro.ro && ro.banner && ro.fsDis && !ro.save, ro);
  t('п.17: статус не меняется на экране до проверки права (было: меняется, потом отказ)', ro.before === 'draft' && ro.after === 'draft' && !ro.dirty, ro);
  const faq = await p.evaluate(() => { repDraft = null; state.screen = 'repairs'; render(); const b = document.querySelector('#app .section-title .help-btn, #app .section-title button');
    const h = document.querySelector('#app .section-title').innerHTML; return { key: /sectionFaq\('rep_screen'\)|helpBtn|rep_screen/.test(h), has: typeof sectionFaqHtml === 'function' }; });
  const faqTxt = await p.evaluate(() => { try{ return sectionFaqHtml('rep_screen'); }catch(e){ return String(e); } });
  t('п.19: у экрана «Ремонт» своя справка (ключ rep_screen), а не секция бланка Repairs', /rep_screen/.test(await p.evaluate(() => document.querySelector('#app .section-title').outerHTML)) && /REP/.test(faqTxt) && !/Threshold/.test(faqTxt), { faq, faqTxt: String(faqTxt).slice(0, 200) });
  const mc = await p.evaluate(() => { state.screen = 'mycar'; render(); return { help: /mycar_help/.test(document.querySelector('#app .section-title').outerHTML), faq: /Bouncie/.test(sectionFaqHtml('mycar_help')) }; });
  t('п.48: у «Моей машины» есть «?» со справкой', mc.help && mc.faq, mc);

  /* ---------- п. 36, 38 (сотрудник) ---------- */
  const crew = await p.evaluate(() => {
    const me = state.user.id, iso = todayISO(), cx = state.data.complexes[0];
    const j = { id: uid(), date: iso, technician_id: 'demo-admin', helper_ids: [me], shared_with_helpers: false, counterparty_id: cx.counterparty_id, complex_id: cx.id,
      unit_number: 'CREW41', status: 'draft', sort_order: 0, form_data: emptyFormData(), total: 50, created_at: new Date().toISOString() };
    state.data.jobs.push(j);
    state.weekStart = mondayOf(iso);
    const week = /CREW41/.test(viewBoardWeek()), rep = repScopeJobs().some(x => x.id === j.id), stat = statScopeJobs().some(x => x.id === j.id), home = visibleJobs().some(x => x.id === j.id);
    return { week, rep, stat, home };
  });
  t('п.36: помощник из бригады видит задачу и на Главной, и на недельной доске, и в отчётах, и в статистике', crew.week && crew.rep && crew.stat && crew.home, crew);

  /* ---------- админ: п. 27, 28, 29, 30–31, 32, 47 ---------- */
  await login('admin');
  const dirs = await p.evaluate(async () => {
    const cx = { id: uid(), counterparty_id: null, name: 'Orphan41', abbr: 'O41', address: 'x' }; state.data.complexes.push(cx);
    state.screen = 'dirs'; _dirTabInit = true; state.dirTab = 'complexes'; render();
    const edit = !!document.querySelector('.cx-orphan-edit');
    editCxModal(cx.id); const sel = document.getElementById('cx-cp'); const v = sel ? sel.value : 'none'; closeModal();
    state.dirTab = 'notes'; render();
    const tab = !!document.getElementById('nt-dir');
    ntEdit(); document.getElementById('nt-title').value = 'Гарантия'; document.getElementById('nt-body').value = 'Warranty 1 year'; await ntSave(document.querySelector('#nt-save').getAttribute('onclick').match(/'([^']+)'/)[1], 0);
    const saved = (state.data.note_templates || []).some(n => n.title === 'Гарантия' && n.body === 'Warranty 1 year');
    editEwModal(); const rep = !!document.getElementById('ew-rep'); closeModal();
    return { edit, v, tab, saved, rep };
  });
  t('п.27: у комплекса без владельца есть «Изменить», в окне выбрано «без владельца» (не первый контрагент молча)', dirs.edit && dirs.v === '', dirs);
  t('п.28: вкладка «Блоки Note» — блок добавляется и попадает в note_templates; у доп. работы галочка «Ремонтная работа»', dirs.tab && dirs.saved && dirs.rep, dirs);
  const car = await p.evaluate(async () => {
    const v = bnVehicles().find(x => x.driver_id === 'demo-tech'); const free = vehFreeNo(v.id);
    await setCarNo('demo-tech', String(free));
    const v2 = bnVehicles().find(x => x.id === v.id), pr = state.data.profiles.find(x => x.id === 'demo-tech');
    return { free, veh: v2.car_no, prof: pr.car_no };
  });
  t('п.29: номер из «Сотрудников» у водителя с машиной меняется в карточке машины, профиль следует (номера не расходятся)', car.veh === car.free && car.prof === car.free, car);
  const set = await p.evaluate(async () => { _foldForce = true; state.screen = 'settings'; render(); await new Promise(r => setTimeout(r, 200));
    const docs = document.getElementById('docs-pr'); const ids = ['opt-prop-mgr', 'opt-prop-send', 'opt-prop-hide', 'opt-rep-all', 'opt-rep-hide'];
    const inDocs = !!docs && ids.every(i => docs.querySelector('#' + i));
    const dead = [...document.querySelectorAll('input[type=checkbox][disabled]')].some(x => /gd_inv/.test(x.outerHTML));
    _foldForce = false; return { inDocs, dead, line: /gd-inv-line/.test(mediaSettingsCardHtml()) }; });
  t('п.31: пять прав пропозалов и ремонта — в «Настройках документов», видны без режима правки ключей Диска', set.inDocs, set);
  t('п.30: вместо мёртвой галочки «Инвойсы по папкам сотрудников» — строка текста', !set.dead && set.line, set);
  const jr = await p.evaluate(() => ({ doc: JR_DOC_ACTIONS.length, tech: JR_TECH_ACTIONS.length, sys: ['mfa_on', 'push_sub', 'sess_kill', 'doc_rights'].every(a => JR_TECH_SET.has(a)), acc: JR_DOC_ACTIONS.includes('acc_pay_add'), board: JR_DOC_ACTIONS.includes('board_order') }));
  t('п.32: журнал — все действия в фильтрах, 2FA/пуши/сессии/доступы во вкладке «Система»', jr.sys && jr.acc && jr.board && jr.doc + jr.tech >= 110, jr);
  const col = await p.evaluate(() => { const cps = state.data.counterparties; const c0 = cpColor(cps[cps.length - 1].id);
    const extra = { id: 'zz-new-cp', name: 'AAA first', abbr: 'AAA' }; cps.unshift(extra); const c1 = cpColor(cps[cps.length - 1].id); cps.shift(); return { c0, c1 }; });
  t('п.47: цвет контрагента не меняется, когда в список добавили другого', col.c0 === col.c1, col);

  /* ---------- п. 44 ---------- */
  const pkEn = await p.evaluate(async () => { const pl = state.data.placements.find(pkPending); if (!pl) return null; noteModal(pl.job_id); await new Promise(r => setTimeout(r, 100));
    const m = document.querySelector('#overlay .modal'); const s = m ? m.innerHTML : ''; closeModal(); return { en: />EN<\/div>/.test(s), pdf: /PDF/.test(s.split('pk-note-en')[0].slice(-120)) }; }).catch(e => ({ err: String(e) }));
  t('п.44: в заметке пикапа поле подписано «EN», без «печатается в PDF»', pkEn && pkEn.en && !pkEn.pdf, pkEn);

  /* ---------- п. 33, 58: поиск ---------- */
  const sr = await p.evaluate(() => {
    const r = repById(state.data.repairs[state.data.repairs.length - 1].id);
    const rA = { ...r, id: uid(), no: 912, unit_number: 'ARCH41', archived_at: new Date().toISOString() }; state.data.repairs.push(rA);
    srchSel = new Set(['rep', 'pk', 'job']); srchUnit = true;
    const a = srchRows('ARCH41'), b = srchRows('41');
    const pDone = state.data.placements.find(x => x.picked_up && !x.archived_at);
    return { arch: a.reps.length, live: b.reps.some(x => x.no === 911), no: srchDocNo('rep', r), fmt: docNo('rep', r), pkDone: pDone ? /srch-done/.test(srchLine('pk', pDone)) : null };
  });
  t('п.33: архивный ремонт в поиск не попадает, живой — попадает', sr.arch === 0 && sr.live, sr);
  t('п.58: номер ремонта в поиске — по шаблону номера (как в документе), а не «REP-N»', sr.no === sr.fmt && sr.no !== 'REP-911', sr);
  t('п.33: забранный пикап в поиске помечен и ведёт в историю задачи', sr.pkDone !== false, sr);
  await login('tech');
  t('п.33: сотруднику пропозал в поиске не «открываемый»', await p.evaluate(() => srchCanOpen('prop', { created_by: state.user.id }) === false));

  /* ---------- п. 34, 35, 39, 40, 41, 37: менеджер ---------- */
  await login('manager');
  const apv = await p.evaluate(async () => {
    state.data.ext_requests = (state.data.ext_requests || []).concat([{ id: uid(), status: 'pending', unit: '41', cx: 'CX', eq: 'BLW', days: 5, requested_by: 'demo-tech' }]);
    const meP = meProf(); meP.can_approve = false;
    const c = apvCollect(); const dfl = dflCollect();
    state.screen = 'approvals'; render(); const h1 = document.querySelector('#app').innerHTML;
    state.screen = 'docflow'; render(); const h2 = document.querySelector('#app').innerHTML;
    return { appr: canApprove(), n: c.n, exts: c.exts.length, ro: /id="apv-ro"/.test(h1), extInApv: /id="apv-ext"/.test(h1), dflExt: /id="dfl-ext"/.test(h2), mineN: dfl.mineN >= 1 };
  });
  t('п.34: заявка на продление сверх лимита — в «На апруве», в «Документообороте» и в числе «ждёт вас»', apv.exts === 1 && apv.extInApv && apv.dflExt && apv.mineN, apv);
  t('п.35: менеджер без права апрува — баннер считает только его решения (продления), список с пометкой «только просмотр»', !apv.appr && apv.n === apv.exts && apv.ro, apv);
  const brd = await p.evaluate(() => {
    state.data.org_settings.mgr_reorder = false; state.screen = 'board'; render();
    const myCol = document.querySelector('.bcol[data-tech="demo-manager"]');
    const other = [...document.querySelectorAll('.bcol')].find(c => c.dataset.tech !== 'demo-manager' && c.querySelectorAll('.bjob').length > 1);
    return { mgrReorder: boardCanReorder(), myRail: myCol ? !!myCol.querySelector('.brail') || myCol.querySelectorAll('.bjob').length < 1 : null, myColExists: !!myCol,
      otherRail: other ? !!other.querySelector('.brail') : null };
  });
  t('п.40: менеджер без настройки двигает свою колонку, чужие — нет', !brd.mgrReorder && brd.myColExists && brd.myRail !== false && brd.otherRail !== true, brd);
  t('п.41: свободный менеджер получает колонку на Доске («Свободные показаны»)', brd.myColExists, brd);
  const wk = await p.evaluate(() => { const iso = todayISO(); state.filterMine = true; state.screen = 'board';
    const b = weekScope(iso).js.length; state.screen = 'home'; const h = weekScope(iso).js.length; state.filterMine = false; return { b, h }; });
  t('п.41: лента недели на Доске считает всех на Доске, а не «Мои» Главной', wk.b >= wk.h && wk.b > 0, wk);
  const pk = await p.evaluate(() => { state.screen = 'home'; state.selDate = todayISO(); state.filterMine = false; render();
    const all = myDueCount(), title = (document.getElementById('pk-title') || {}).textContent || '';
    state.filterMine = true; render(); const mine = myDueCount(), title2 = (document.getElementById('pk-title') || {}).textContent || '';
    const rows = pkDueRows(); return { all, mine, title, title2, same: rows.due.length === mine.due && rows.over.length === mine.over }; });
  t('п.37: баннер «Пикап сегодня» считает по фильтру «Мои / Все», окно пикапов — то же число', pk.all.due + pk.all.over >= pk.mine.due + pk.mine.over && pk.same, pk);
  t('п.37: в режиме «Все» заголовок списка — «Пикапы», в «Мои» — «Мои пикапы»', (!pk.title || /^Пикапы/.test(pk.title.trim())) && (!pk.title2 || /Мои пикапы/.test(pk.title2)), pk);

  /* ---------- п. 38: «Назад» документа ---------- */
  const back = await p.evaluate(async () => { state.screen = 'board'; render(); await new Promise(r => setTimeout(r, 100));
    const j = liveJobs().find(x => x.date === state.selDate) || liveJobs()[0]; openJob(j.id); await new Promise(r => setTimeout(r, 200));
    const opened = state.screen; jobClose(); await new Promise(r => setTimeout(r, 150)); return { opened, after: state.screen }; });
  t('п.38: документ, открытый с Доски, по «Назад»/✕ возвращается на Доску', back.opened === 'job' && back.after === 'board', back);

  /* ---------- п. 43: склад ---------- */
  const eq = await p.evaluate(() => { state.data.org_settings.stock_mode = 'lite';
    eqDraft = { kind: 'repair', et: state.data.equipment_types[0].id, qty: 1, src: 'car', note: '' }; eqModal();
    const m = document.querySelector('#overlay .modal').innerHTML; const r = { head: /class="back-x"/.test(m), car: /App\.eqSrc\('car'\)/.test(m), src: eqDraft.src };
    closeModal(); state.data.org_settings.stock_mode = 'full'; return r; });
  t('п.43: окно складской операции — стандартная шапка со стрелкой; в облегчённом режиме нет «из моей машины»', eq.head && !eq.car && eq.src === 'stock', eq);

  /* ---------- п. 25, 49 ---------- */
  const misc = await p.evaluate(() => ({ stg: stgCls('done'), here: stgCls('here'),
    ch: typeof chFoundHtml === 'function' ? /ch-found-note/.test(chFoundHtml('zzzz-no-hit')) : null }));
  t('п.25: классы этапов водителя — stg-here / stg-done (не пересекаются со статусом «Выполнено»)', misc.stg === ' stg-done' && misc.here === ' stg-here', misc);
  t('п.49: поиск по сообщениям предупреждает, что ищет среди загруженных', misc.ch === true, misc);
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'styles.css'), 'utf8');
  t('п.25: в стилях нет правил этапов на st-here / st-done у карточек', !/\.bjob\.st-done|\.bjob\.st-here|\.tvpin\.st-done/.test(css) && /\.bjob\.stg-done/.test(css));

  t('без ошибок страницы', !errs.length, errs);
  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
