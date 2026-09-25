/* v1.09.53 — встроенный «Тест документооборота + ремонт» (Настройки → Диагностика). Весь тест документооборота, а после него —
   документ ремонта со всех сторон: все статусы, все цепочки документов и все роли (работник-автор, помощник в бригаде, посторонний,
   менеджер без права апрува, менеджер с правом, админ). Своя роль — кнопками, чужие — служебной функцией (в демо — dftDemoExec,
   двойник правил update-to-1_09_53.sql; серверная сторона — tests/v1_09_53.sql).
   Здесь: карточка и её видимость, справка, прогон «работник — весь тест», «менеджер — только ремонт», «менеджер с правом апрува —
   только ремонт», «админ — весь тест», «Пошагово» + «Остановить», уборка; плюс исправления клиента в форме ремонта (контрагент и
   комплекс не сбрасываются, перевод пишется в ремонт, правка шапки и заметки снимает апрув, цепочка с ремонтом из пропозала,
   «слетел апрув» в списке, ответ сервера на сохранение) и двойник правил сервера.
   Запуск: node tests/v1_09_53.js [порт] (демо-копия, как в README; прогон ~8 минут; T53_QUICK=1 — без четырёх сценариев). */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8953;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 900) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const src = rd('app.js'), up = rd('supabase/update-to-1_09_53.sql'), full = rd('supabase/full-install-1_09_53.sql');
  console.log('— исходники и SQL —');
  const V = (src.match(/const APP_VERSION = '([\d.]+)';/) || [])[1] || '', vge = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return true; };
  t('версии: app = sw = version.json (не ниже 1.09.53), файл базы — full-install-1_09_53.sql или новее', vge(V, '1.09.53') && rd('sw.js').includes(`VERSION = '${V}'`)
    && JSON.parse(rd('version.json')).version === V && /const DB_SQL_FILE = 'full-install-1_(09_(5[3-9]|[6-9]\d)|1\d_\d\d)\.sql';/.test(src), V);
  t('update-to-1_09_53.sql: бригада видит ремонт, сторож апрува по «что видел согласующий», события «отклонён» и «ждёт апрува», dft_exec с пропозалом и строгим rep_get, docflow_v = 11',
    up.includes("or coalesce(helper_ids, '[]'::jsonb) ? auth.uid()::text") && up.includes('create or replace function public.rep_content_key(r public.repairs)')
    && up.includes('if exists (select 1 from public.repairs where id = new.id) then return new; end if;') && up.includes("'act', 'reset', 'from', old.status, 'to', old.decided_by, 'srv', true")
    && up.includes("v_t := 'Ремонт отклонён'") && up.includes("v_t := 'Ремонт ждёт апрува'") && up.includes("coalesce((p_args->>'strict')::boolean, false)")
    && up.includes("(v_row->>'proposal_id') is not null and not exists (select 1 from public.proposals") && /update (public\.)?org_settings set docflow_v = 11/.test(up));
  t('full-install-1_09_53.sql = установка 1.09.44 + дельта 1.09.53 (заканчивается ею, заголовок дельты)', full.trimEnd().endsWith(up.trimEnd()) && full.includes('ДЕЛЬТА · update-to-1_09_53'));
  t('тест в приложении: режимы dftRun(mode), карточка «+ ремонт», набор шагов ремонта после основного цикла, «только ремонт» пропускает основной цикл',
    src.includes('async function dftRun(mode){') && src.includes("mode === 'full' || mode === 'rep' ? mode : 'docflow'")   /* с 1.09.54 перед ним — режимы ui / ui_rep */ && src.includes("if (M !== 'rep'){")
    && src.includes("if (M !== 'docflow') await dftRepSuite({") && src.includes("fold('dftr', t('dftr_card'), 'toolbox', dftrCardHtml(), true)") && src.includes("onclick=\"App.dftRun(DFT.repOnly ? 'rep' : 'full')\"")
    && src.includes("testPreflightGate('docflow')") && src.includes("testPreflightGate('docflow_rep')"));

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block', permissions: ['camera', 'microphone'] }); const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 300)); }); p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const login = async who => { await p.evaluate(w => { try{ saveLocalNow(); }catch(e){} localStorage.setItem('techlog_session_v1', w); }, who); await p.reload();
    await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1000); };
  const openCard = async () => { await p.evaluate(() => { try{ App.closeModal(); }catch(e){} const pn = document.getElementById('dft-panel'); if (pn) pn.remove(); foldSet('dgs', true); foldSet('dftr', true); _foldForce = true; App.go('settings'); }); await p.waitForTimeout(600); };
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-tech'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1000);
  await p.evaluate(() => { const ps = state.data.profiles; ps.push({ id: 'demo-tech2', login: 'oleg', display_name: 'Oleg Ivanov', role: 'tech', car_no: null, blocked: false, created_at: '2026-06-01T09:00:00Z' },
    { id: 'demo-appr', login: 'maria', display_name: 'Maria Approver', role: 'manager', can_approve: true, car_no: null, blocked: false, created_at: '2026-06-01T09:00:00Z' }); ps.find(x => x.id === 'demo-manager').can_approve = false; saveLocalNow(); });

  /* ---- карточка: без режима у работника её нет; админ видит всегда; справка ---- */
  console.log('— карточка «Тест документооборота + ремонт» —');
  await openCard();
  t('режим выключен: работник карточку «+ ремонт» не видит, запустить тест не может', await p.evaluate(async () => { const c = !document.getElementById('dftr-card'); await App.dftRun('rep'); return c && !DFT.running; }));
  await login('demo-admin'); await p.waitForTimeout(800); await openCard();
  const c0 = await p.evaluate(() => ({ card: !!document.getElementById('dftr-card'), off: !!document.getElementById('dftr-off'), run: !!document.getElementById('dftr-run'),
    ttl: ((document.querySelector('#dftr-card') || {}).textContent || '').slice(0, 400), both: !!document.getElementById('fold-dft') && !!document.getElementById('fold-dftr') }));
  t('админ видит карточку и при выключенном режиме: плашка «режим выключен», кнопки запуска нет; рядом — карточка «Тест документооборота»', c0.card && c0.off && !c0.run && /все статусы/.test(c0.ttl) && c0.both, c0);
  await p.evaluate(() => App.dftSetMode(true, 4)); await p.waitForTimeout(500); await openCard();
  const c1 = await p.evaluate(() => ({ run: !!document.getElementById('dftr-run'), only: !!document.getElementById('dftr-only'), worker: [...document.querySelectorAll('#dftr-worker option')].map(o => o.value),
    step: !!document.getElementById('dftr-stepmode'), media: !!document.getElementById('dftr-media'), wide: !!document.getElementById('dftr-wide'), off: !!document.getElementById('dftr-off') }));
  t('режим включён: выбор работника, «Только ремонт», «Пошагово», «Всем участникам», «Фото…», кнопка запуска', c1.run && c1.only && c1.worker.includes('demo-tech') && c1.worker.includes('demo-tech2') && c1.step && c1.media && c1.wide && !c1.off, c1);
  await p.evaluate(() => { const b = document.querySelector('#dftr-card .faq-i'); if (b) b.click(); }); await p.waitForTimeout(400);
  const hp = await p.evaluate(() => { const o = document.getElementById('overlay'); const tx = (o || {}).textContent || ''; const li = o ? o.querySelectorAll('li').length : 0; try{ App.closeModal(); }catch(e){} return { tx: tx.slice(0, 300), li }; });
  t('справка «?» карточки: что это, статусы, цепочки, роли, правила сервера (5 пунктов)', hp.li === 5 && /Тест документооборота \+ ремонт/.test(hp.tx), hp);
  const hen = await p.evaluate(() => { const l0 = state.lang; state.lang = 'en'; const h = sectionFaqHtml('dftr'), r = sectionFaqHtml('rep_screen'); state.lang = l0; return { cyr: /[Ѐ-ӿ]/.test(h + r), li: (h.match(/<li\b/g) || []).length, rli: (r.match(/<li\b/g) || []).length, rru: (() => { state.lang = 'ru'; const x = (sectionFaqHtml('rep_screen').match(/<li\b/g) || []).length; state.lang = l0; return x; })() }; });
  t('справка по-английски без кириллицы, пунктов поровну; справка «Ремонт» дополнена событиями и правилами апрува', !hen.cyr && hen.li === 5 && hen.rli === hen.rru && hen.rli === 7, hen);

  /* ---- прогоны ---- */
  const runAs = async (who, worker, mode) => {
    await login(who); await p.waitForTimeout(who === 'demo-admin' ? 1800 : 300); await openCard();
    await p.evaluate(() => { DFT.stepMode = false; DFT.repOnly = false; trApi = async ru => 'EN: ' + String(ru).length; });   /* сеть в тесте закрыта — переводчик подменён */
    await p.evaluate(() => { _foldForce = true; render(); }); await p.waitForTimeout(300);
    if (worker) await p.selectOption('#dftr-worker', worker);
    if (mode === 'rep') await p.click('#dftr-only');
    const before = await p.evaluate(() => ({ jobs: state.data.jobs.length, pl: state.data.placements.length, pr: state.data.proposals.length, rep: (state.data.repairs || []).length, worker: DFT.worker, only: DFT.repOnly }));
    const t0 = Date.now();
    await p.click('#dftr-run');
    await p.waitForFunction(() => !DFT.running && !!document.getElementById('dft-sum'), null, { timeout: mode === 'rep' ? 300000 : 480000, polling: 1000 });
    const res = await p.evaluate(() => { const c = tlogGet(), txt = tlogText(c), rs = DFT.rs || {}, rids = [rs.R1, rs.R2, rs.R3, rs.R5, rs.RD, rs.RD2].filter(Boolean);
      return { ok: c.ok, total: c.total, kind: c.kind, title: c.title, fname: tlogFileName(c), steps: c.steps.map(s => ({ n: s.name, ok: s.ok, x: s.extra })), txt,
        issues: (c.issues || []).map(i => ({ sev: i.sev, text: i.text, n: i.n })), critTxt: dftIssuesText(c, ['crit']),
        left: state.data.jobs.filter(j => j.is_test).length + state.data.placements.filter(x => x.is_test).length + state.data.proposals.filter(x => x.is_test).length + (state.data.repairs || []).filter(x => x.is_test).length,
        leftRep: (state.data.repairs || []).filter(r => rids.includes(r.id) || /^DFTEST/.test(r.unit_number || '')).length, leftNtf: (state.data.notices || []).filter(n => rids.some(id => String(n.url || '').includes(id))).length,
        leftQ: mediaQ.filter(x => rids.includes(x.repair_id)).length, rids: rids.length,
        jobs: state.data.jobs.length, pl: state.data.placements.length, pr: state.data.proposals.length, rep: (state.data.repairs || []).length, scr: state.screen,
        sum: document.getElementById('dft-sum').textContent, head: ((document.querySelector('#dft-panel .dft-ph') || {}).textContent || '').trim(), dfi: !!document.getElementById('dfi-crit') && !!document.getElementById('dfi-all') }; });
    res.before = before; res.sec = Math.round((Date.now() - t0) / 1000); return res;
  };
  const check = (label, r, mode, minSteps, mustRun) => {
    const failed = r.steps.filter(s => s.ok === false), skipped = r.steps.filter(s => s.ok === null);
    t(`${label}: сценарий прошёл без провалов (${r.ok} / ${r.total}, пропущено ${skipped.length}, ${r.sec} с)`, failed.length === 0 && r.ok === r.total && r.total >= minSteps, { failed: failed.slice(0, 5), sum: r.sum });
    t(`${label}: запуск кнопкой карточки — выбранный работник и «Только ремонт» дошли до прогона`, r.before.only === (mode === 'rep') && !!r.before.worker, r.before);
    t(`${label}: обязательные для роли шаги выполнены, а не пропущены`, mustRun.every(k => r.steps.some(s => s.n.includes(k) && s.ok === true)), mustRun.filter(k => !r.steps.some(s => s.n.includes(k) && s.ok === true)));
    t(`${label}: после теста ничего тестового не осталось — документы, ремонты, лента по ремонтам, очередь фото; рабочие данные те же; экран прежний`,
      r.left === 0 && r.leftRep === 0 && r.leftNtf === 0 && r.leftQ === 0 && r.rids >= 4 && r.jobs === r.before.jobs && r.pl === r.before.pl && r.pr === r.before.pr && r.rep === r.before.rep && r.scr === 'settings',
      { left: r.left, leftRep: r.leftRep, ntf: r.leftNtf, q: r.leftQ, rids: r.rids, jobs: [r.before.jobs, r.jobs], rep: [r.before.rep, r.rep], scr: r.scr });
    { const by = k => r.issues.filter(i => i.sev === k);
      t(`${label}: проблемы прогона — критических нет, пропуски в предупреждениях, отказы негативных шагов ожидаемые; кнопки выгрузки в панели`,
        r.dfi && by('crit').length === 0 && by('warn').filter(i => /шаг пропущен/.test(i.text)).reduce((a, i) => a + i.n, 0) === skipped.length && by('exp').length >= 3 && /⛔ КРИТИЧЕСКИЕ — нет/.test(r.critTxt),
        { crit: by('crit').map(i => i.text).slice(0, 3), err: by('err').map(i => i.text).slice(0, 4), exp: by('exp').length }); }
    const groups = ['R0', 'RA', 'RB', 'RC', 'RD', 'RF', 'RE'].filter(g => !r.txt.includes('=== ' + g + ' · '));
    t(`${label}: отчёт — вид «docflow_rep», заголовок и режим, группы ремонта R0…RE, снимок ремонтов (∑ R1), строка настроек ремонта, итог`,
      r.kind === 'docflow_rep' && /^techlog-docflow_rep-/.test(r.fname) && /Тест документооборота \+ ремонт/.test(r.title) && /Тест документооборота \+ ремонт/.test(r.head) && !groups.length
      && r.txt.includes('режим=' + (mode === 'rep' ? 'только ремонт' : 'документооборот + ремонт')) && (mode === 'rep' ? !r.txt.includes('=== A · ') : r.txt.includes('=== A · ') && r.txt.includes('=== R · '))
      && (r.txt.match(/∑ .*R1: /g) || []).length > 20 && /Ремонт: rep_all_create=/.test(r.txt) && /ИТОГ: ✓/.test(r.txt) && /=== I · /.test(r.txt),
      { groups, kind: r.kind, fname: r.fname, head: r.head.slice(0, 80) });
    t(`${label}: коды отказа сервера — FORBIDDEN_APPROVE и RLS_DENIED получены негативными шагами ремонта`, ['FORBIDDEN_APPROVE', 'RLS_DENIED'].every(c => r.steps.some(s => s.ok === true && s.x === '→ ' + c && /ремонт/i.test(s.n))));
  };

  if (!process.env.T53_QUICK){   /* T53_QUICK=1 — быстрый прогон без четырёх сценариев и «Пошагово» (для отладки остального) */
  console.log('— работник: весь тест (документооборот + ремонт) —');
  const rt = await runAs('demo-tech', 'demo-tech2', 'full');
  check('работник', rt, 'full', 140, ['Работник создаёт ремонт из инвойса', 'Отдельный ремонт', 'Отвязка инвойса и пропозала', 'не сохраняется — подсказка', 'Работник отправляет ремонт на апрув: «Черновик»',
    'Работник одобряет свой ремонт — кнопок нет', 'в ленту пришло «Ремонт отклонён» с причиной', 'Работник исправляет сумму', 'Работник отзывает ремонт', 'в ленту пришло «Ремонт апрувлен» (этот ремонт)',
    'в ленту пришло «Ремонт отклонён» после апрува', 'Правка суммы в одобренном ремонте кнопками', '«Слетел апрув»', 'работнику в ленту «Апрув снят с ремонта»', 'В ОБХОД интерфейса', 'Переводы и пометки фото',
    'Повторное «Сохранить»', 'Бригада ремонта', 'Помощник из бригады видит', 'Посторонний работник чужой ремонт не видит', 'PDF ремонта', 'Фото чека', 'Цепочка ремонта', 'строкой в инвойс', 'Повторный перенос',
    'Сданный инвойс сумму ремонта не принимает', 'работник удалить инвойс с цепочкой не может', 'окно цепочки → «В архив вместе с цепочкой»', 'У работника архива нет', 'Автор удаляет свой ремонт',
    /* основной цикл тоже прошёл — из карточки «+ ремонт» */ 'кнопками заполняет ВСЮ форму', 'второй согласующий апрувит', 'удаляет документ, который ни разу не отп']);
  t('работник: свои шаги ремонта — кнопками (☛ по форме ремонта, ⌨ полей), служебно только чужие роли и запросы в обход',
    (rt.txt.match(/☛ /g) || []).length > 200 && /⌨ PO Number = DFT-PO-R1/.test(rt.txt) && /☛ Отправить на апрув/.test(rt.txt) && /⌨ EN · note = repair after the wall cut-out/.test(rt.txt) && /☛ Перенести суммы в инвойс/.test(rt.txt),
    { clicks: (rt.txt.match(/☛ /g) || []).length });
  t('работник: помощник видит чужой ремонт только для просмотра — кнопками; «строгий» просмотр постороннего — отказ', rt.steps.some(s => s.n.includes('Помощник из бригады видит') && s.ok === true && /только для просмотра/.test(s.x))
    && rt.steps.some(s => s.n.includes('Посторонний работник чужой ремонт не видит') && s.x === '→ RLS_DENIED'));

  console.log('— менеджер без права апрува: только ремонт —');
  const rm = await runAs('demo-manager', 'demo-tech', 'rep');
  check('менеджер', rm, 'rep', 45, ['Инвойс для ремонта', 'Галочка «Требуется восстановление»', 'Ремонт из пропозала', 'Отдельный ремонт', 'Менеджер без права апрува одобряет ремонт — кнопок нет', 'Менеджер без права апрува одобряет свой ремонт',
    'Правка суммы в одобренном ремонте кнопками', '«Слетел апрув»', 'Менеджер правит ремонт работника (PO)', 'Менеджер чужой ремонт не удаляет', 'Менеджер инвойс работника не удаляет', '«Вернуть из архива»', 'Менеджер удалить навсегда не может', 'Менеджер пропозал не удаляет']);
  t('менеджер: основной цикл пропущен галочкой «Только ремонт»; правка PO и отправка — кнопками; «на доске» и в «Требуется действие» проверено',
    !rm.steps.some(s => /кнопками заполняет|Создаю задачу кнопкой/.test(s.n)) && rm.steps.some(s => s.n.includes('Менеджер правит ремонт работника') && s.ok === true && !/⇒/.test(s.x)) && rm.steps.some(s => s.n.includes('«Слетел апрув»') && /Доска/.test(s.x)));

  console.log('— менеджер с правом апрува: только ремонт —');
  const rp = await runAs('demo-appr', 'demo-tech', 'rep');
  check('менеджер с правом апрува', rp, 'rep', 45, ['Согласующий отклоняет ремонт с причиной', 'Согласующему в ленту пришло «Ремонт ждёт апрува»', 'Снова на апрув — МЕНЕДЖЕР с правом', 'Согласующий одобряет СВОЙ ремонт', 'Сданный инвойс: согласующий добавляет сумму ремонта', '«На апруве»']);
  t('согласующий решает кнопками: отклонение с причиной, одобрение из «Отправлен» и прямо из черновика', rp.steps.some(s => s.n.includes('Согласующий отклоняет') && s.ok === true && /Maria/.test(s.x))
    && /☛ Отклонить/.test(rp.txt) && /☛ Одобрить/.test(rp.txt) && /☛ Статус → Одобрен/.test(rp.txt));

  console.log('— админ: весь тест —');
  const ra = await runAs('demo-admin', 'demo-tech', 'full');
  check('админ', ra, 'full', 140, ['АДМИН передумал', 'АДМИН одобряет из «Отклонён»', 'Админ: «Скрыть суммы ремонта»', 'окно цепочки → «В архив вместе с цепочкой»', 'Админ удаляет ремонт навсегда', 'Удаление пропозала с цепочкой',
    'МЕНЕДЖЕР с правом апрува апрувит ремонт', 'Админ удаляет']);
  t('все роли вместе: все статусы ремонта и все цепочки пройдены хотя бы в одном прогоне', (() => { const all = [rt, rm, rp, ra].flatMap(r => r.steps).filter(s => s.ok === true).map(s => s.n);
    return ['«Черновик» → «Отправлен»', 'отклоняет ремонт с причиной', '«Отклонён» → «Отправлен»', '«Отправлен» → «Черновик»', 'МЕНЕДЖЕР с правом апрува одобряет', '«Одобрен» → «Отклонён»', 'из «Отклонён»', 'прямо из черновика',
      'апрув снят сразу', 'снимает сам сервер', 'Автор удаляет', '«Вернуть из архива»', 'навсегда', 'из инвойса', 'из пропозала', 'Отдельный ремонт', 'Отвязка', 'строкой в инвойс', 'Цепочка ремонта', 'окно цепочки', 'Удаление пропозала с цепочкой']
      .filter(k => !all.some(n => n.includes(k))); })().length === 0);

  /* ---- «Пошагово» и «Остановить»: уборка всё равно проходит, ремонты тоже ---- */
  console.log('— «Пошагово» и «Остановить» —');
  await openCard();
  await p.evaluate(() => { DFT.stepMode = true; DFT.repOnly = true; App.dftRun('rep'); }); await p.waitForFunction(() => !!DFT.next, null, { timeout: 30000 });
  for (let i = 0; i < 6; i++){ await p.evaluate(() => App.dftNext()); await p.waitForFunction(() => !!DFT.next || !DFT.running, null, { timeout: 60000 }); }
  const mid = await p.evaluate(() => ({ reps: (state.data.repairs || []).filter(r => r.is_test).length, jobs: state.data.jobs.filter(j => j.is_test).length }));
  await p.evaluate(() => App.dftStop()); await p.waitForFunction(() => !DFT.running, null, { timeout: 90000 });
  const st = await p.evaluate(() => ({ reps: (state.data.repairs || []).filter(r => r.is_test || /^DFTEST/.test(r.unit_number || '')).length, jobs: state.data.jobs.filter(j => j.is_test).length, props: state.data.proposals.filter(x => x.is_test).length, txt: /остановлен/.test(tlogText(tlogGet())) }));
  t('«Пошагово» + «Остановить» посреди ремонта: тест прерван, уборка убрала тестовые инвойсы, пропозал и ремонты', mid.reps >= 1 && mid.jobs >= 1 && st.reps === 0 && st.jobs === 0 && st.props === 0 && st.txt, { mid, st });
  await p.evaluate(() => { DFT.stepMode = false; DFT.repOnly = false; try{ App.closeModal(); }catch(e){} const pn = document.getElementById('dft-panel'); if (pn) pn.remove(); });

  }

  /* ---- исправления клиента в форме ремонта (1.09.53) ---- */
  console.log('— форма ремонта: исправления 1.09.53 —');
  await login('demo-admin'); await p.waitForTimeout(1500); await p.evaluate(() => { try{ App.closeModal(); }catch(e){} });
  const f1 = await p.evaluate(async () => {
    const cx = state.data.complexes[0], cp = state.data.counterparties.find(c => c.id === cx.counterparty_id);
    App.go('repairs'); App.openRepair(); await new Promise(r => setTimeout(r, 200));
    const inp = document.querySelector('#cb-cx .combo-in'); inp.value = cx.name; inp.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 100));
    const opt = document.querySelector('#cb-cx-list .combo-opt:not(.dim)'); opt.click(); await new Promise(r => setTimeout(r, 100));
    const pickDraft = { cp: repDraft.counterparty_id, cx: repDraft.complex_id };
    App.repItemAdd('work'); App.repCrewAdd('demo-tech'); await new Promise(r => setTimeout(r, 100));
    const after = { cp: repDraft.counterparty_id, cx: repDraft.complex_id, hcp: document.getElementById('nt-cp').value, hcx: document.getElementById('nt-cx').value, txt: document.querySelector('#cb-cp .combo-in').value };
    return { pickDraft, after, want: { cp: cp.id, cx: cx.id, cpn: cp.name } }; });
  t('контрагент и комплекс из списка — сразу в документ: строка и помощник больше не сбрасывают выбор (раньше «Сохранить» отвечал «укажите контрагента»)',
    f1.pickDraft.cx === f1.want.cx && f1.pickDraft.cp === f1.want.cp && f1.after.cp === f1.want.cp && f1.after.cx === f1.want.cx && f1.after.hcp === f1.want.cp && f1.after.hcx === f1.want.cx && f1.after.txt === f1.want.cpn, f1);
  const f2 = await p.evaluate(async () => {
    const note = document.getElementById('rep-note'); note.value = 'заделать дыру'; note.dispatchEvent(new Event('input', { bubbles: true }));
    const it = repDraft.items[0]; it.d = 'Шпаклёвка'; it.a = 30; render(); await new Promise(r => setTimeout(r, 100));
    const jd0 = jobDraft ? JSON.stringify(jobDraft) : null;
    const ta = document.querySelector('textarea.tr-en[data-tr="note"]'); ta.value = 'patch the hole'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    const saved = repDraft.note_en;
    trApi = async ru => 'EN(' + ru + ')'; repDraft.items[0].d_en = ''; await App.trFill('rep');
    return { saved, it: repDraft.items[0].d_en, jobSame: (jobDraft ? JSON.stringify(jobDraft) : null) === jd0 }; });
  t('перевод для PDF в ремонте пишется в сам ремонт (поле и «Перевести всё»), черновик инвойса не трогается — раньше всё уходило в черновик инвойса', f2.saved === 'patch the hole' && f2.it === 'EN(Шпаклёвка)' && f2.jobSame, f2);
  const f3 = await p.evaluate(async () => {
    await saveRepair(true); const id = repDraft.id; const r = repById(id); Object.assign(r, { status: 'approved', decided_by: 'demo-admin', decided_at: new Date().toISOString() }); App.openRepair(id); await new Promise(r => setTimeout(r, 150));
    const note = document.getElementById('rep-note'); note.value = 'заделать дыру и покрасить'; note.dispatchEvent(new Event('input', { bubbles: true }));
    const byNote = { st: repDraft.status, h: (repDraft.hist[0] || {}).act, from: (repDraft.hist[0] || {}).from, chip: !!document.querySelector('#rep-apr .chip.pst-draft') };
    App.repDrop(); App.openRepair(id); await new Promise(r => setTimeout(r, 150));
    const cx2 = state.data.complexes.find(c => c.counterparty_id === r.counterparty_id && c.id !== r.complex_id) || state.data.complexes.find(c => c.id !== r.complex_id);
    const inp = document.querySelector('#cb-cx .combo-in'); inp.value = cx2.name; inp.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 100));
    [...document.querySelectorAll('#cb-cx-list .combo-opt:not(.dim)')].find(o => (o.textContent || '').includes(cx2.name)).click(); await new Promise(r => setTimeout(r, 100));
    const byCx = { st: repDraft.status, cx: repDraft.complex_id === cx2.id, h: (repDraft.hist[0] || {}).act };
    App.repDrop(); App.openRepair(id); await new Promise(r => setTimeout(r, 150));
    const ta = document.querySelector('textarea.tr-en[data-tr="note"]'); ta.value = 'patch the hole (edited)'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    App.repPhoto('ph-1', 'before');
    const byTr = { st: repDraft.status };
    App.repDrop(); return { byNote, byCx, byTr, id }; });
  t('одобренный ремонт: правка заметки и смена комплекса снимают апрув (в истории — снятие), перевод и пометки фото — нет; так же решает сервер',
    f3.byNote.st === 'draft' && f3.byNote.h === 'reset' && f3.byNote.from === 'approved' && f3.byNote.chip && f3.byCx.st === 'draft' && f3.byCx.cx && f3.byCx.h === 'reset' && f3.byTr.st === 'approved', f3);
  const f4 = await p.evaluate(async id => {
    const r = repById(id); r.status = 'draft'; r.hist = [{ at: new Date().toISOString(), by: 'demo-admin', by_name: 'Ivan P.', act: 'reset', from: 'approved' }].concat(r.hist || []);
    App.go('repairs'); repDraft = null; render(); await new Promise(x => setTimeout(x, 150));
    const chip = document.querySelector(`[onclick="App.openRepair('${id}')"] .chip`); return { cls: chip && chip.className, tx: chip && chip.textContent }; }, f3.id);
  t('список ремонтов: у документа, с которого слетел апрув, — пометка «слетел апрув» (как на доске)', /pst-declined/.test(f4.cls || '') && /слетел апрув/.test(f4.tx || ''), f4);
  const f5 = await p.evaluate(async () => {
    const cx = state.data.complexes[0], pr = { id: 'prop-chain-1', no: 555, date: todayISO(), counterparty_id: cx.counterparty_id, complex_id: cx.id, unit_number: 'X', items: [], total: 0, status: 'approved' }, rid = 'rep-prop-only-1';
    state.data.proposals.push(pr);
    state.data.repairs.push({ id: rid, no: 777, date: todayISO(), counterparty_id: pr.counterparty_id, complex_id: pr.complex_id, unit_number: 'X', job_id: null, proposal_id: pr.id, items: [], materials: [], helper_ids: [], status: 'draft', hist: [] });
    const a = chainOf('prop', pr.id).map(x => x.t + ':' + (x.o.id === rid ? 'R' : '')), b = chainOf('rep', rid).map(x => x.t + ':' + (x.o.id === rid ? 'R' : ''));
    state.data.repairs = state.data.repairs.filter(r => r.id !== rid); state.data.proposals = state.data.proposals.filter(x => x.id !== pr.id); return { a, b }; });
  t('цепочка: ремонт, созданный прямо из пропозала, — сразу за пропозалом (и в цепочке пропозала, и в своей)', f5.a[0] === 'prop:' && f5.a[1] === 'rep:R' && f5.b.includes('rep:R'), f5);
  const f6 = await p.evaluate(() => {
    const row = { id: 'rb-1', status: 'approved', decided_by: 'x', hist: [], no: null }; repDraft = { ...row, hist: [] }; document.querySelectorAll('#toasts .toast').forEach(x => x.remove());
    repApplyBack(row, { id: 'rb-1', no: 12, status: 'draft', decided_by: null, decided_at: null, hist: [{ act: 'reset', srv: true, from: 'approved' }] });
    const res = { row: [row.no, row.status, row.decided_by, row.hist[0].srv], draft: [repDraft.no, repDraft.status, (repDraft.hist[0] || {}).srv], toast: ((document.querySelector('#toasts .toast') || {}).textContent || '') };
    repApplyBack(row, { id: 'other', status: 'sent' }); res.other = row.status; repDraft = null; return res; });
  t('ответ сервера на сохранение ремонта: номер, статус, решение и история — как записал сервер; снятый сервером апрув — подсказкой',
    f6.row.join() === '12,draft,,true' && f6.draft.join() === '12,draft,true' && /Сервер снял апрув/.test(f6.toast) && f6.other === 'draft', f6);
  t('сохранение ремонта читает ответ сервера только с новой базой (docflow_v ≥ 11): select статуса, решения и истории', src.includes("const _backR = table === 'repairs' && repSrvV11() && _q && typeof _q.select === 'function';")
    && src.includes("if (_backR) _q = _q.select('id,no,status,decided_by,decided_at,hist');") && src.includes('if (!error && _backR) repApplyBack(row,'));

  /* ---- двойник правил сервера (демо) ---- */
  console.log('— двойник правил сервера в демо —');
  const dm = await p.evaluate(() => {
    const D = state.data, s0 = { reps: D.repairs, ntf: D.notices, owner: DFT.owner }, out = {};
    try{
      DFT.owner = 'demo-tech'; D.notices = [];
      const base = { id: 'dr1', no: 90000001, is_test: true, test_owner: 'demo-tech', status: 'approved', created_by: 'demo-tech', decided_by: 'demo-appr', helper_ids: ['demo-tech'], unit_number: 'DFTEST-X', date: '2026-01-01', items: [{ q: 1, code: '', d: 'Row', d_en: '', a: 10 }], materials: [], total: 10, hist: [] };
      D.repairs = [JSON.parse(JSON.stringify(base))];
      const k0 = dftRepKey(base); out.keyEn = dftRepKey({ ...base, items: [{ q: '1', code: '', d: 'Row', d_en: 'EN', a: '10.0' }], note_en: 'x', photos: { before: ['a'] }, hist: [{}], job_id: 'j' }) === k0;
      out.keyAmt = dftRepKey({ ...base, items: [{ q: 1, code: '', d: 'Row', a: 11 }] }) !== k0 && dftRepKey({ ...base, helper_ids: [] }) !== k0 && dftRepKey({ ...base, note: 'n' }) !== k0;
      const tr = dftDemoExec('demo-tech', 'rep_update', { id: 'dr1', patch: { note_en: 'EN', photos: { before: ['p'], after: [] } } }); out.tr = tr.ok && tr.data.status === 'approved';
      const ed = dftDemoExec('demo-tech', 'rep_update', { id: 'dr1', patch: { items: [{ q: 1, code: '', d: 'Row', a: 15 }], total: 15 } });
      out.ed = ed.ok && ed.data.status === 'draft' && ed.data.hist[0].srv === true && ed.data.hist[0].from === 'approved' && !ed.data.decided_by;
      out.edNtf = D.notices.some(n => n.title === 'Апрув снят с ремонта' && n.user_id === 'demo-tech') === false;   /* правил сам автор — себе события нет */
      const sn = dftDemoExec('demo-tech', 'rep_update', { id: 'dr1', patch: { status: 'sent' } }); DFT.owner = 'demo-appr';
      const dc = dftDemoExec('demo-admin', 'rep_update', { id: 'dr1', patch: { status: 'declined', decline_reason: 'нет фото' } });
      out.dc = dc.ok && dc.data.decided_by === 'demo-admin'; DFT.owner = 'demo-tech';
      const sn2 = dftDemoExec('demo-tech', 'rep_update', { id: 'dr1', patch: { status: 'sent' } });
      DFT.owner = 'demo-appr'; D.notices = []; const sn3a = dftDemoExec('demo-tech', 'rep_update', { id: 'dr1', patch: { status: 'draft' } }), sn3 = dftDemoExec('demo-tech', 'rep_update', { id: 'dr1', patch: { status: 'sent' } });
      out.waitNtf = sn.ok && sn2.ok && sn3a.ok && sn3.ok && D.notices.some(n => n.title === 'Ремонт ждёт апрува' && n.user_id === 'demo-appr');
      DFT.owner = 'demo-tech'; D.notices = []; const dc2 = dftDemoExec('demo-appr', 'rep_update', { id: 'dr1', patch: { status: 'declined', decline_reason: 'смета не та' } });
      out.declNtf = dc2.ok && D.notices.some(n => n.title === 'Ремонт отклонён' && /смета не та/.test(n.body) && n.user_id === 'demo-tech');
      out.forbid = dftDemoExec('demo-manager', 'rep_update', { id: 'dr1', patch: { status: 'approved' } }).error.message === 'FORBIDDEN_APPROVE';
      out.strict = dftDemoExec('demo-tech2', 'rep_get', { id: 'dr1', strict: true }).error.message === 'RLS_DENIED' && dftDemoExec('demo-tech2', 'rep_get', { id: 'dr1' }).ok
        && dftDemoExec('demo-tech', 'rep_get', { id: 'dr1', strict: true }).ok && dftDemoExec('demo-manager', 'rep_get', { id: 'dr1', strict: true }).ok;
      out.helper = (() => { D.repairs[0].helper_ids = ['demo-tech', 'demo-tech2']; return dftDemoExec('demo-tech2', 'rep_get', { id: 'dr1', strict: true }).ok && dftDemoExec('demo-tech2', 'rep_update', { id: 'dr1', patch: { note: 'x' } }).error.message === 'RLS_DENIED'; })();
      { const rj = D.jobs.find(j => !j.is_test), rpp = (D.proposals || []).find(x => !x.is_test);
        out.link = !!rj && dftDemoExec('demo-tech', 'rep_update', { id: 'dr1', patch: { job_id: rj.id } }).error.message === 'DFT_NOT_TEST_DOC'
          && (!rpp || dftDemoExec('demo-tech', 'rep_create', { row: { proposal_id: rpp.id } }).error.message === 'DFT_NOT_TEST_DOC'); }
      const cr = dftDemoExec('demo-tech', 'rep_create', { row: { status: 'approved', po_number: 'PO-1', complete_by: '2026-02-01', sales_tax: 2, freight: 3, photos: { before: ['a'], after: [] }, hist: [{ act: 'created' }] } });
      out.create = cr.ok && cr.data.status === 'draft' && cr.data.po_number === 'PO-1' && cr.data.complete_by === '2026-02-01' && cr.data.sales_tax === 2 && cr.data.freight === 3 && cr.data.photos.before[0] === 'a' && cr.data.hist[0].act === 'created';
    } finally { D.repairs = s0.reps; D.notices = s0.ntf; DFT.owner = s0.owner; }
    return out; });
  t('двойник: «что видел согласующий» — без переводов, фото, истории и связей; числа как числа', dm.keyEn && dm.keyAmt, dm);
  t('двойник: правка сметы одобренного — черновик с пометкой «сервер», переводы и фото — апрув на месте; отклонение с причиной — событие автору, отправка — согласующим',
    dm.tr && dm.ed && dm.edNtf && dm.dc && dm.waitNtf && dm.declNtf, dm);
  t('двойник: апрув только согласующим, строгий просмотр постороннему закрыт (помощнику открыт, править — нет), связь только с тестовыми документами, поля ремонта при создании',
    dm.forbid && dm.strict && dm.helper && dm.link && dm.create, dm);

  /* ---- выключение: карточка снова скрыта у работника ---- */
  await p.evaluate(() => App.dftSetMode(false)); await p.waitForTimeout(400);
  await login('demo-tech'); await openCard();
  t('админ выключил режим: у работника карточки «+ ремонт» нет, запуск невозможен', await p.evaluate(async () => { const c = !document.getElementById('dftr-card'); await App.dftRun('full'); return c && !DFT.running; }));

  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.stack || e)); process.exit(1); });
