/* v1.09.23 — регрессии по ревью чата и пушей: цикл запросов карточки ключей; меню сообщения (закрытие мимо и Esc);
   заблокированный собеседник с непрочитанным; запоминание фильтра сообщений; предупреждение админу без открытого ключа;
   статические проверки воркера, функции push и SQL. Демо-режим. Запуск: node tests/v1_09_23.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8923;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 340) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..'), src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  t('воркер: чат-уведомление не всплывает поверх открытого и сфокусированного TechLog; на iPhone и для прочих видов — всегда',
    sw.includes("if (d.kind === 'chat' && !ios && list.some(c => c.focused && c.visibilityState === 'visible')) return;") && sw.indexOf("await tlKvSet('last'") < sw.indexOf('c.focused'));
  t('полная перезагрузка чата сохраняет подгруженную раньше историю; группы и отметки чтения — не на каждый опрос',
    src.includes("CH.rows = oldest ? fresh.concat(CH.rows.filter(m => !ids.has(m.id) && String(m.created_at) < oldest)) : fresh;") && src.includes('(CH.rtOk ? 60000 : 24000)') && (src.match(/CH\._gsig = ''; CH\.metaAt = 0; await chLoad\(true\);/g) || []).length >= 2);
  for (const d of ['functions-dashboard', 'functions']){
    const f = fs.readFileSync(path.join(ROOT, 'supabase', d, 'push/index.ts'), 'utf8');
    t(`push (${d}): сводки вставляются одной записью — один толчок от базы вместо N`, f.includes('if (batch.length) await s.from("push_queue").insert(batch);') && f.includes('if (rows.length) await s.from("push_queue").insert(rows);')
      && !/for \(const pr of profs \?\? \[\]\) \{[^}]*await s\.from\("push_queue"\)\.insert\(\{/s.test(f) && f.includes('PUSH_VER = "1.09.23"'));
  }
  for (const n of ['update-to-1_09_23.sql', 'full-install-1_09_23.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', n), 'utf8'), send = q.slice(q.lastIndexOf('create or replace function public.chat_send('));
    t(`${n}: заголовок уведомления — переписка, автор в строке; отметка чтения — только настоящий ключ и только участник группы; тайм-аут вызова от базы 10 с`,
      send.includes("when p_group is not null then coalesce(v_gname, 'Группа') else coalesce(v_name, 'TechLog') end;") && send.includes("case when p_to is null then split_part(coalesce(v_name, ''), ' ', 1) || ': ' else '' end")
      && q.includes("then raise exception 'BAD_THREAD'") && q.includes("not public.chat_is_member(substr(p_thread, 3)::uuid) then raise exception 'FORBIDDEN'") && q.includes('timeout_milliseconds := 10000'));
  }
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); }); p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1300);

  /* 1 · карточка ключей: сервер не отвечает — проверка не должна крутиться без паузы */
  const loop = await p.evaluate(async () => { let n = 0; const orig = ckFetch; ckFetch = async () => { n++; return false; };
    App.go('settings'); foldSet('ck', true); render(); await new Promise(r => setTimeout(r, 1800)); ckFetch = orig; return n; });
  t('таблицы ключей нет: за 1,8 с на открытых настройках — не больше двух проверок (раньше — бесконечный цикл)', loop <= 2, loop);
  const loop2 = await p.evaluate(async () => { let n = 0; const orig = ckSupported; CK.at = 0; ckSupported = () => { n++; return false; }; render(); await new Promise(r => setTimeout(r, 1200)); ckSupported = orig; return n; });
  t('браузер без защищённого хранилища: тоже без цикла', loop2 <= 3, loop2);

  /* 2 · меню сообщения */
  const ids = await p.evaluate(() => { const tech = state.data.profiles.find(x => x.role === 'tech'); const now = Date.now();
    state.data.chat_msgs = [{ id: uid(), from_user: tech.id, to_user: state.user.id, channel: null, body: 'привет, админ', important: false, created_at: new Date(now - 60000).toISOString(), reactions: {} },
                            { id: uid(), from_user: tech.id, to_user: null, channel: 'all', body: 'всем привет', important: false, created_at: new Date(now - 50000).toISOString(), reactions: {} }];
    App.go('chat'); App.chOpen('all'); return { tech: tech.id, me: state.user.id }; });
  await p.waitForTimeout(400);
  await p.click('#ch-msgs .ch-bub'); await p.waitForTimeout(250);
  await p.evaluate(() => { const m = document.getElementById('ch-menu'); m.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await p.waitForTimeout(200);
  t('клик внутри меню его не закрывает', await p.evaluate(() => !!document.getElementById('ch-menu')));
  await p.click('.ch-head'); await p.waitForTimeout(250);
  t('клик мимо закрывает меню и ПОСЛЕ клика внутри (раньше слушатель был одноразовым)', await p.evaluate(() => !document.getElementById('ch-menu') && CH.menu === null));
  await p.click('#ch-msgs .ch-bub'); await p.waitForTimeout(250); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  t('Esc закрывает меню', await p.evaluate(() => !document.getElementById('ch-menu')));
  const armed = await p.evaluate(async () => { for (let i = 0; i < 5; i++){ const b = document.querySelector('#ch-msgs .ch-bub'); b.click(); await new Promise(r => setTimeout(r, 40)); b.click(); await new Promise(r => setTimeout(r, 40)); } return { menu: CH.menu, off: typeof _chMenuOff }; });
  t('многократное открытие-закрытие не копит слушателей', armed.menu === null, armed);

  /* 3 · запоминание фильтра */
  const memo = await p.evaluate(() => { const a = chRows(), b = chRows(); state.data.chat_msgs.push({ id: uid(), from_user: state.user.id, to_user: null, channel: 'all', body: 'ещё', created_at: new Date().toISOString(), reactions: {} }); const c = chRows();
    return { same: a === b, fresh: c !== a && c.length === a.length + 1 }; });
  t('фильтр сообщений запоминает результат и сбрасывается при новом сообщении', memo.same && memo.fresh, memo);

  /* 4 · заблокированный собеседник */
  const blk = await p.evaluate(tech => { const pr = state.data.profiles.find(x => x.id === tech); pr.blocked = true; render();
    const row = document.querySelector(`#ch-ths .ch-th[data-k="${tech}"]`); const un = chUnread(tech); App.chOpen(tech);
    return { inList: !!row, off: row && row.classList.contains('off'), un, ro: (document.querySelector('.ch-ro') || {}).textContent || '', input: !!document.getElementById('ch-in'), after: chUnread(tech), post: chCanPost(tech) }; }, ids.tech);
  await p.waitForTimeout(300);
  t('заблокированный собеседник с перепиской остаётся в списке (приглушён), непрочитанное открывается и гасится, писать ему нельзя — с объяснением',
    blk.inList && blk.off && blk.un === 1 && /заблокирован/i.test(blk.ro) && !blk.input && blk.post === false && await p.evaluate(tech => chUnread(tech) === 0, ids.tech), blk);
  t('заблокированного БЕЗ переписки в списке нет', await p.evaluate(() => { const m = state.data.profiles.find(x => x.role === 'manager'); m.blocked = true; render(); const r = !document.querySelector(`#ch-ths .ch-th[data-k="${m.id}"]`); m.blocked = false; return r; }));

  /* 5 · админ без открытого ключа сбрасывает пароль */
  const adm = await p.evaluate(async tech => { CK.st = 'need_pw'; CK.noDb = false; CK.pubs = [{ user_id: tech, mode: 'recover', key_id: 'x' }]; const a = await ckAdminRewrap(tech, 'new-password-12'); CK.pubs = []; const b = await ckAdminRewrap(tech, 'new-password-12'); return { a, b, txt: t('ck_adm_notready') }; }, ids.tech);
  t('админ без открытого ключа: вместо тишины — «сейф остался под старым паролем»; у сотрудника без ключа — молча', adm.a === 'notready' && adm.b === 'skip' && /СТАРЫМ паролем/.test(adm.txt), adm);
  await ctx.close(); await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
