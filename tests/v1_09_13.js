/* v1.09.13 — доска: режим правки порядка (задачи и пикапы), «Отменить» / «Сохранить», общий порядок
   сотрудника на день; подсказка о пуше внутри приложения и ссылка ?day=; профиль сотрудника и
   «Ремонт» только ремонтникам; поворот экрана (манифест any, настройка устройства); компактные
   спойлеры инвойса на телефоне. Демо-режим, CDN режутся.
   Запуск: node tests/v1_09_13.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8913;
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
  await p.evaluate(([w, mode]) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('techlog_session_v1', w); localStorage.setItem('techlog_view_mode', mode); }, [who || 'demo-admin', o.mode]);
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1800);
  return p;
}
(async () => {
  const ROOT = path.join(__dirname, '..');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  t('манифест: orientation = any (установленное приложение поворачивается)', man.orientation === 'any');
  const push = fs.readFileSync(path.join(ROOT, 'supabase/functions-dashboard/push/index.ts'), 'utf8');
  t('Edge Function push: утренняя сводка раз в сутки, ссылка на день, версия 1.09.13',
    push.includes('async function enqueueMorning') && push.includes('push_morning_day') && push.includes('"./?day=" + today') && /PUSH_VER = "1\.09\.(1[3-9]|[2-9]\d)"/.test(push) && push.includes('searchParams.get("morning")'));
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/update-to-1_09_13.sql'), 'utf8');
  t('SQL: staff_kind, rep_kind_only, board_order_notify только для админа и менеджера; включает 1.09.12',
    sql.includes('add column if not exists staff_kind text') && sql.includes('add column if not exists rep_kind_only boolean not null default false')
    && sql.includes("not in ('admin','manager') then raise exception 'FORBIDDEN'") && sql.includes("perform public.push_enqueue(p_user, 'order'") && sql.includes('bn_device_label'));
  t('файл расписания push-setup.sql на месте', fs.existsSync(path.join(ROOT, 'supabase/push-setup.sql')));

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  { console.log('— доска (ПК, админ) —');
    const p = await boot(br, { w: 1500, h: 1000, mode: 'desktop' });
    /* готовим колонку: три задачи и два пикапа одного сотрудника на сегодня */
    const prep = await p.evaluate(() => {
      const iso = todayISO(); state.selDate = iso; state.weekStart = mondayOf(iso);
      const tech = state.data.profiles.find(x => x.role === 'tech' && !x.blocked); const base = state.data.jobs[0];
      const mk = (n) => ({ ...JSON.parse(JSON.stringify(base)), id: uid(), date: iso, technician_id: tech.id, helper_ids: [], unit_number: 'T' + n, sort_order: n, status: 'draft', priority: false, archived_at: null, no: 900 + n });
      const js = [mk(0), mk(1), mk(2)]; state.data.jobs.push(...js);
      const pl0 = state.data.placements[0];
      const pj = [mk(7), mk(8)].map((j, i) => ({ ...j, date: '2026-01-0' + (i + 2) })); state.data.jobs.push(...pj);
      pj.forEach((j, i) => state.data.placements.push({ ...JSON.parse(JSON.stringify(pl0)), id: uid(), job_id: j.id, technician_id: tech.id, due_date: iso, picked_up: false, superseded: false, returned_at: null, ext_of: null, unit_number: j.unit_number }));
      App.go('board'); return { tech: tech.id, jobs: js.map(j => j.id), pks: pj.map(j => j.id) }; });
    await p.waitForTimeout(600);
    const col = `.bcol[data-tech="${prep.tech}"]`;
    const order0 = await p.evaluate(c => [...document.querySelectorAll(c + ' .bjob b')].map(b => b.textContent).filter(x => /^T\d/.test(x)), col);
    t('колонка собрана: задачи T0 T1 T2, у пикапов тоже есть ▲▼', order0.join() === 'T0,T1,T2' && await p.evaluate(c => document.querySelectorAll(c + ' .bpk .brail').length === 2, col), order0);
    t('до правок полосы режима нет', await p.evaluate(() => !document.getElementById('brd-edit')));
    await p.evaluate(id => App.boardMove(id, 1), prep.jobs[0]); await p.waitForTimeout(300);
    const st1 = await p.evaluate(([c, ids]) => ({ bar: !!document.getElementById('brd-edit'), ui: [...document.querySelectorAll(c + ' .bjob b')].map(b => b.textContent).filter(x => /^T\d/.test(x)).join(),
      db: ids.map(id => state.data.jobs.find(j => j.id === id).sort_order).join(), mark: !!document.querySelector(c + '.bcol-edit') }), [col, prep.jobs]);
    t('первая стрелка включает режим правки: на экране T1 T0 T2, в данных порядок прежний, колонка обведена', st1.bar && st1.ui === 'T1,T0,T2' && st1.db === '0,1,2' && st1.mark, st1);
    await p.evaluate(id => App.boardMove(id, 1, 'pk'), prep.pks[0]); await p.waitForTimeout(300);
    const pkUi = await p.evaluate(c => [...document.querySelectorAll(c + ' .bpk')].map(e => e.dataset.pk), col);
    t('пикапы тоже переставляются в режиме правки', pkUi.join() === [prep.pks[1], prep.pks[0]].join(), pkUi);
    await p.evaluate(() => App.boardOrderCancel()); await p.waitForTimeout(300);
    t('«Отменить» возвращает порядок и убирает полосу', await p.evaluate(c => !document.getElementById('brd-edit') && [...document.querySelectorAll(c + ' .bjob b')].map(b => b.textContent).filter(x => /^T\d/.test(x)).join() === 'T0,T1,T2', col));
    await p.evaluate(([a, b]) => { App.boardMove(a, 1); App.boardMove(b, 1, 'pk'); }, [prep.jobs[0], prep.pks[0]]); await p.waitForTimeout(300);
    await p.evaluate(() => App.boardOrderSave()); await p.waitForTimeout(900);
    const sv = await p.evaluate(({ jobs, pks }) => { const so = id => state.data.jobs.find(j => j.id === id).sort_order;
      const J = jobs.map(so), P = pks.map(so);
      return { bar: !!document.getElementById('brd-edit'), J, P, okJobs: J[1] < J[0] && J[0] < J[2], okPks: P[1] < P[0] && Math.min(...P) > Math.max(...J),
        uniq: new Set(J.concat(P)).size === 5, log: (state.data.audit_log || []).some(a => a.action === 'board_order') }; }, prep);
    t('«Сохранить» пишет общий порядок дня (T1 → T0 → T2, затем пикапы в новом порядке), полоса уходит, запись в журнале', !sv.bar && sv.okJobs && sv.okPks && sv.uniq && sv.log, sv);
    /* подсказка о пуше внутри приложения и ссылка на день */
    await p.evaluate(() => { App.go('settings'); pushInAppPop({ title: 'Порядок задач изменён', body: 'на 01/07', url: './?day=2026-01-07' }); }); await p.waitForTimeout(300);
    t('пуш при открытом приложении — подсказка с кнопкой «Открыть день»', await p.evaluate(() => { const e = document.getElementById('push-pop'); return !!e && /Порядок задач изменён/.test(e.textContent) && !!e.querySelector('[data-a="go"]'); }));
    await p.click('#push-pop [data-a="go"]'); await p.waitForTimeout(400);
    t('кнопка открывает главную на дне из ссылки', await p.evaluate(() => state.screen === 'home' && state.selDate === '2026-01-07' && !document.getElementById('push-pop')));
    /* профиль сотрудника */
    await p.evaluate(id => { App.go('dirs'); App.staffGear ? App.staffGear(id) : null; }, prep.tech); await p.waitForTimeout(300);
    const hasSeg = await p.evaluate(() => !!document.getElementById('st-kind'));
    if (hasSeg){ await p.click('#st-kind button[data-v="helper"]'); await p.waitForTimeout(400); }
    t('профиль сотрудника задаётся в ⚙ (или функцией)', await p.evaluate(async id => { if (!document.getElementById('st-kind')) await App.staffKindSet(id, 'helper'); return state.data.profiles.find(x => x.id === id).staff_kind === 'helper'; }, prep.tech));
    await p.context().close(); }

  { console.log('— «Ремонт» только ремонтникам (сотрудник) —');
    const p = await boot(br, { w: 1400, h: 1000, mode: 'desktop' }, 'demo-tech');
    const r = await p.evaluate(() => { const has = () => !!document.querySelector('[data-tab="repairs"], .tab-btn[onclick*="repairs"], [onclick*="go(\'repairs\')"]');
      const a = repTabOn(); state.data.org_settings.rep_kind_only = true; render(); const b = repTabOn(); const bUi = has();
      state.user.staff_kind = 'repair'; render(); const c = repTabOn(); const cUi = has(); return { a, b, c, bUi, cUi }; });
    t('по умолчанию вкладка «Ремонт» есть; с галочкой у техника её нет; у ремонтника — есть', r.a === true && r.b === false && r.c === true && r.bUi === false && r.cUi === true, r);
    await p.context().close(); }

  { console.log('— телефон —');
    const p = await boot(br, { w: 412, h: 915, mode: 'mobile', touch: true });
    await p.evaluate(() => { App.go('settings'); }); await p.waitForTimeout(500);
    t('настройка «Поворот экрана» в карточке профиля, по умолчанию «Авто»', await p.evaluate(() => { const r = document.getElementById('orient-row'); return !!r && r.querySelector('.lang-seg .on') && orientPref() === 'any'; }));
    await p.evaluate(() => App.orientSet('landscape')); await p.waitForTimeout(400);
    t('выбор запоминается на устройстве', await p.evaluate(() => localStorage.getItem('techlog_orient') === 'landscape' && orientPref() === 'landscape'));
    await p.evaluate(() => App.orientSet('any'));
    const jid = await p.evaluate(() => state.data.jobs[0].id);
    await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(700);
    const sp = await p.evaluate(() => { const c = [...document.querySelectorAll('.inv-sec.sec-closed .inv-head')].map(e => Math.round(e.getBoundingClientRect().height));
      const o = [...document.querySelectorAll('.inv-sec:not(.sec-closed) .inv-head')].map(e => Math.round(e.getBoundingClientRect().height)); return { c, o }; });
    t('свёрнутые разделы инвойса на телефоне — низкие строки (≤ 44 px), цель нажатия не меньше 40 px', sp.c.length > 0 && sp.c.every(h => h <= 44 && h >= 40), sp);
    await p.context().close(); }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})();
