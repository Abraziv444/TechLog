/* v1.09.24 — чат: роли и модерация в группе, «не беспокоить», очередь неотправленного, поиск по сообщениям, пересылка,
   срок хранения (по умолчанию без ограничения), бухгалтер с правами менеджера в чате; SQL. Демо-режим.
   Запуск: node tests/v1_09_24.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8924;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 360) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  for (const n of ['update-to-1_09_24.sql', 'full-install-1_09_24.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', n), 'utf8'), send = q.slice(q.lastIndexOf('create or replace function public.chat_send('));
    t(`${n}: удалять в группе может автор и модератор группы (создатель или админ группы); роли назначает создатель или админ фирмы; создателя админ группы убрать не может`,
      q.includes('or (group_id is not null and public.chat_is_group_mod(group_id)));') && q.includes("m.user_id = auth.uid() and m.role = 'admin'") && q.includes("(created_by = auth.uid() or public.my_role() = 'admin')) then raise exception 'FORBIDDEN'")
      && q.includes('(public.chat_is_group_mod(p_group) and p_user is distinct from v_owner)'));
    t(`${n}: «не беспокоить» гасит пуш на сервере, «Важно» проходит; лимиты 30 сообщений в минуту и 20 групп в сутки; бухгалтер — как менеджер; срок хранения по умолчанию 0; пароль от 10 на сервере`,
      (send.match(/if v_imp or not public\.chat_muted\(/g) || []).length === 3 && send.includes(">= 30 then raise exception 'RATE_LIMIT'") && q.includes(">= 20 then raise exception 'RATE_LIMIT'")
      && send.includes("v_role not in ('admin','manager','accountant')") && q.includes('alter column chat_keep_days set default 0') && q.includes('update public.org_settings set chat_keep_days = 0 where chat_keep_days = 180')
      && (q.match(/< 10 then raise exception 'WEAK_PASSWORD'/g) || []).length === 2 && q.includes('revoke all on function public.chat_muted(uuid, text) from public, anon, authenticated;'));
  }
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); }); p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const login = async who => { await p.evaluate(w => { try{ saveLocalNow(); }catch(e){} localStorage.setItem('techlog_session_v1', w); }, who); await p.reload();
    await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1300); };
  await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-tech'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1300);
  const ids = await p.evaluate(() => ({ tech: state.user.id, admin: state.data.profiles.find(x => x.role === 'admin').id, mgr: state.data.profiles.find(x => x.role === 'manager').id, acc: (state.data.profiles.find(x => x.role === 'accountant') || {}).id }));

  /* ---- группа: создатель = сотрудник, участники: менеджер и админ фирмы ---- */
  const gid = await p.evaluate(async ({ mgr, admin }) => { App.go('chat'); CH.gsel = new Set([mgr, admin]); const i = document.createElement('input'); i.id = 'chg-name'; i.value = 'Бригада'; document.body.appendChild(i); await App.chGroupCreate(); i.remove(); return chGroups()[0].id; }, ids);
  await p.waitForTimeout(300);
  await p.evaluate(g => App.chGroupInfo(g), gid); await p.waitForTimeout(300);
  t('создатель видит у участников «Сделать админом»', await p.evaluate(() => document.querySelectorAll('.chg-m .chg-role').length === 2));
  await p.evaluate(([g, m]) => { App.chGroupRoleSet(g, m, 'admin'); }, [gid, ids.mgr]); await p.waitForTimeout(500);
  t('менеджер назначен админом группы: чип «админ группы», запись в журнале', await p.evaluate(([g, m]) => chGroupRole(g, m) === 'admin' && /админ группы/.test(document.querySelector(`.chg-m[data-u="${m}"]`).textContent) && (state.data.audit_log || []).some(a => a.action === 'chat_group_role'), [gid, ids.mgr]));
  await p.evaluate(() => App.closeModal());
  await p.evaluate(async g => { await chSendTo('g:' + g, 'сообщение создателя', null, false, {}); }, gid);
  /* админ группы (менеджер) удаляет чужое сообщение; обычный участник (админ ФИРМЫ, но не группы) — не может */
  await login('demo-admin');
  const a1 = await p.evaluate(g => { const m = chMsgsOf('g:' + g)[0]; App.chOpen('g:' + g); return { can: chCanDelete(m), mod: chIsGroupMod(g) }; }, gid);
  t('администратор ФИРМЫ, будучи обычным участником группы, чужое сообщение в ней удалить не может', a1.can === false && a1.mod === false, a1);
  await login('demo-manager');
  await p.evaluate(g => App.chOpen('g:' + g), gid); await p.waitForTimeout(400);
  await p.click('#ch-msgs .ch-bub'); await p.waitForTimeout(250);
  t('админ группы видит «Удалить» у чужого сообщения', await p.evaluate(() => !!document.querySelector('#ch-menu .dng')));
  await p.click('#ch-menu .dng'); await p.waitForTimeout(300); await p.click('#ask-ok'); await p.waitForTimeout(500);
  t('сообщение удалено модератором, в журнале — кто, чьё и где', await p.evaluate(g => chMsgsOf('g:' + g).length === 0 && (state.data.audit_log || []).some(a => a.action === 'chat_del' && a.details && a.details.where === 'Бригада'), gid));
  await p.evaluate(g => App.chGroupInfo(g), gid); await p.waitForTimeout(300);
  t('админ группы может убирать участников, но не создателя и не удалять группу; ролей он не раздаёт', await p.evaluate(({ tech }) => !document.getElementById('chg-del') && !document.querySelector('.chg-role') && !document.querySelector(`.chg-m[data-u="${tech}"] .btn`) && document.querySelectorAll('.chg-m .btn').length === 1, ids));
  await p.evaluate(() => App.closeModal());

  /* ---- «не беспокоить» ---- */
  await p.evaluate(async ({ tech }) => { state.data.chat_msgs.push({ id: uid(), from_user: tech, to_user: null, channel: 'all', body: 'шум', created_at: new Date().toISOString(), reactions: {} }); App.chOpen('ann'); render(); }, ids); await p.waitForTimeout(300);
  const before = await p.evaluate(() => chUnread());
  await p.evaluate(() => App.chMuteToggle('all')); await p.waitForTimeout(400);
  const mute = await p.evaluate(() => ({ total: chUnread(), own: chUnread('all'), saved: (state.user.push_prefs.chat_mute || []).includes('all'), ic: !!document.querySelector('#ch-ths .ch-th[data-k="all"] .ch-muted'), grey: !!document.querySelector('#ch-ths .ch-th[data-k="all"] .ch-n.mut') }));
  t('«не беспокоить»: переписка ушла из общего счётчика, свой счётчик серый, значок в списке, настройка в профиле', before === 1 && mute.total === 0 && mute.own === 1 && mute.saved && mute.ic && mute.grey, { before, ...mute });
  await p.evaluate(() => App.chOpen('all')); await p.waitForTimeout(300);
  t('в шапке переписки колокольчик нажат; повторное нажатие включает уведомления', await p.evaluate(async () => { const b = document.getElementById('ch-mute'); const on = b.getAttribute('aria-pressed') === 'true'; await App.chMuteToggle('all'); return on && !chMuted('all'); }));

  const qbox = await p.evaluate(() => { const q = document.getElementById('ch-q').getBoundingClientRect(), b = document.getElementById('ch-newg').getBoundingClientRect(); return { q: Math.round(q.width), b: Math.round(b.width), row: Math.abs(q.top - b.top) < 12 }; });
  t('ПК: поле поиска и кнопка «+ Группа» делят строку — поле не сжато до нуля (дефект 1.09.20, найден в этом выпуске)', qbox.q >= 120 && qbox.b >= 44 && qbox.b <= 160 && qbox.row, qbox);
  /* ---- поиск по сообщениям и пересылка ---- */
  await p.evaluate(({ tech }) => { state.data.chat_msgs.push({ id: 'find-me', from_user: tech, to_user: state.user.id, channel: null, body: 'ключи от юнита 916 лежат в офисе', created_at: new Date(Date.now() - 5000).toISOString(), reactions: {} }); render(); }, ids);
  await p.fill('#ch-q', 'юнита 916'); await p.waitForTimeout(300);
  const found = await p.evaluate(() => { const h = document.querySelector('#ch-ths .ch-hit'); return h ? { mark: (h.querySelector('mark') || {}).textContent, people: document.querySelectorAll('#ch-ths .ch-th:not(.ch-hit)').length } : null; });
  t('поиск находит сообщение, совпадение подсвечено, людей с таким именем нет', found && found.mark === 'юнита 916' && found.people === 0, found);
  await p.click('#ch-ths .ch-hit'); await p.waitForTimeout(700);
  t('нажатие открывает переписку и подводит к сообщению', await p.evaluate(({ tech }) => CH.thread === tech && document.querySelector('.ch-msg[data-id="find-me"]').classList.contains('flash'), ids));
  await p.evaluate(() => App.chForward('find-me')); await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector('#ds-chips [data-u="all"]').click(); }); await p.click('#ch-fwd-go'); await p.waitForTimeout(500);
  t('«Переслать»: сообщение ушло в выбранную переписку', await p.evaluate(() => chMsgsOf('all').some(m => /ключи от юнита 916/.test(m.body) && m.from_user === state.user.id) && !document.getElementById('overlay')));

  /* ---- очередь неотправленного (логика; в демо сервера нет — кладём и вынимаем напрямую) ---- */
  const ob = await p.evaluate(({ tech }) => { localStorage.removeItem(chOutboxKey()); const a = chOutboxPut(tech, 'напишу без связи', null, false, null, null), img = chOutboxPut(tech, '', null, false, null, { full: 'x' });
    App.chOpen(tech); const el = [...document.querySelectorAll('#ch-msgs .ch-msg.pending')].pop(); return { a, img, n: chOutbox().length, pending: !!el, wait: el ? /ждёт сети/.test(el.textContent) : false, stored: /напишу без связи/.test(localStorage.getItem(chOutboxKey()) || ''), id: chOutbox()[0].id }; }, ids);
  await p.waitForTimeout(300);
  t('без связи: сообщение встаёт в очередь и видно в переписке «ждёт сети», хранится на устройстве; снимок в очередь не берётся', ob.a === true && ob.img === false && ob.n === 1 && ob.pending && ob.wait && ob.stored, ob);
  await p.click('#ch-msgs .ch-msg.pending .ch-bub'); await p.waitForTimeout(250);
  t('у неотправленного в меню только «Не отправлять»', await p.evaluate(() => { const b = [...document.querySelectorAll('#ch-menu button')]; return b.length === 1 && /Не отправлять/i.test(b[0].textContent); }));
  await p.click('#ch-menu .dng'); await p.waitForTimeout(400);
  t('«Не отправлять» убирает сообщение из очереди без вопросов', await p.evaluate(() => chOutbox().length === 0 && !document.querySelector('#ch-msgs .ch-msg.pending')));

  /* ---- срок хранения ---- */
  await login('demo-admin');
  await p.evaluate(() => { App.go('settings'); foldSet('misc', true); render(); }); await p.waitForTimeout(500);
  t('срок хранения по умолчанию не ограничен: галочка снята, числа дней нет', await p.evaluate(() => { const c = document.querySelector('#chat-keep-chk input'); return !!c && !c.checked && !document.getElementById('chat-keep-row'); }));
  await p.click('#chat-keep-chk input'); await p.waitForTimeout(600);
  t('включили ограничение — появилось число дней (180), его можно менять', await p.evaluate(() => { const r = document.getElementById('chat-keep-row'); return !!r && r.querySelector('input').value === '180' && +state.data.org_settings.chat_keep_days === 180; }));
  await p.click('#chat-keep-chk input'); await p.waitForTimeout(600);
  t('сняли галочку — снова без ограничения', await p.evaluate(() => +state.data.org_settings.chat_keep_days === 0 && !document.getElementById('chat-keep-row')));

  /* ---- бухгалтер в чате = менеджер ---- */
  const acc = await p.evaluate(() => { const was = state.user.role; state.user.role = 'accountant'; App.go('chat'); App.chOpen('ann'); const r = { boss: chBoss(), post: chCanPost('ann'), imp: !!document.getElementById('ch-imp-btn'), input: !!document.getElementById('ch-in') }; state.user.role = was; return r; });
  t('бухгалтер в чате — с правами менеджера: пишет в «Объявления», ставит «Важно»', acc.boss && acc.post && acc.imp && acc.input, acc);
  await ctx.close(); await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
