/* v1.09.20 — группы в чате: создание, список по разделам, сообщения видят только участники, состав и название,
   добавить / убрать / выйти / удалить, переход создателя, документ в группу самолётиком, ссылка ?chat=g:<id>, SQL.
   Демо-режим (общий localStorage на всех «пользователей»). Запуск: node tests/v1_09_20.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8920;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 340) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  for (const f of ['update-to-1_09_20.sql', 'full-install-1_09_20.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
    const last = q.lastIndexOf('create or replace function public.chat_send(');
    t(`${f}: сообщения группы — только участникам (через chat_is_member, без рекурсии политик), запись в группы только функциями, отправка проверяет членство, старая chat_send(12) удалена`,
      q.includes('or (group_id is not null and public.chat_is_member(group_id)));') && q.includes('revoke insert, update, delete on public.chat_groups, public.chat_members from authenticated, anon;')
      && q.slice(last, last + 2500).includes("if not public.chat_is_member(p_group) then raise exception 'FORBIDDEN'; end if;") && q.slice(last, last + 300).includes('p_group uuid')
      && q.lastIndexOf('drop function if exists public.chat_send(uuid, text, text, boolean, text, uuid, text, uuid, text, text, int, int);') < last
      && q.includes('check (num_nonnulls(to_user, channel, group_id) = 1)') && q.includes("'./?chat=g:' || p_group::text"));
  }
  t('схема шифрования лежит в сборке', fs.existsSync(path.join(ROOT, 'TZ-chat-encryption.md')));
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ONLY = process.env.TL_MODE || '';                     // TL_MODE=desktop|mobile — прогнать один режим (в песочнице с лимитом времени)
  for (const o of [{ w: 1400, h: 900, mode: 'desktop' }, { w: 412, h: 915, mode: 'mobile', touch: true }].filter(x => !ONLY || x.mode === ONLY)){
    console.log('— ' + o.mode + ' —'); const T0 = Date.now();
    const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); });
    p.on('dialog', d => d.accept());
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const login = async who => { await p.evaluate(w => { try{ saveLocalNow(); }catch(e){} localStorage.setItem('techlog_session_v1', w); }, who); await p.reload();
      await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1400); };
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
    await p.evaluate(mode => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('techlog_view_mode', mode); localStorage.setItem('techlog_session_v1', 'demo-tech'); }, o.mode);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1400);
    const ids = await p.evaluate(() => ({ tech: state.user.id, admin: state.data.profiles.find(x => x.role === 'admin').id, mgr: state.data.profiles.find(x => x.role === 'manager').id, job: (state.data.jobs.find(j => j.technician_id === state.user.id) || state.data.jobs[0]).id }));
    await p.evaluate(() => App.go('chat')); await p.waitForTimeout(400);
    const top = await p.evaluate(() => { const b = document.getElementById('ch-newg'), r = b.getBoundingClientRect(); return { has: !!b, fit: r.right <= innerWidth + 1 && r.height >= 40, first: document.querySelector('#ch-ths .ch-th').dataset.k }; });
    t('над списком — кнопка «+ Группа», первым в списке — «Общий чат»', top.has && top.fit && top.first === 'all', top);
    await p.click('#ch-newg'); await p.waitForTimeout(300);
    await p.click('#chg-create'); await p.waitForTimeout(250);
    t('без названия группа не создаётся', await p.evaluate(() => !!document.getElementById('chg-create') && chGroups().length === 0));
    await p.fill('#chg-name', 'Бригада Magnolia'); await p.click(`#chg-chips [data-u="${ids.admin}"]`); await p.click('#chg-create'); await p.waitForTimeout(500);
    const made = await p.evaluate(() => { const g = chGroups()[0]; return { n: chGroups().length, thread: CH.thread, key: g ? 'g:' + g.id : '', mem: g ? chGroupMembers(g.id).length : 0, owner: g && g.created_by === state.user.id,
      head: (document.querySelector('.ch-head b') || {}).textContent, gear: !!document.getElementById('ch-ginfo'), sec: [...document.querySelectorAll('#ch-ths .ch-sec')].map(e => e.textContent), log: (state.data.audit_log || []).some(a => a.action === 'chat_group') }; });
    t('группа создана: открыта сразу, в ней создатель и отмеченный, в шапке название и шестерёнка, в списке разделы «Группы» и «Сотрудники», запись в журнале',
      made.n === 1 && made.thread === made.key && made.mem === 2 && made.owner && made.head === 'Бригада Magnolia' && made.gear && made.sec.length === 2 && made.log, made);
    const gkey = made.key, gid = gkey.slice(2);
    await p.fill('#ch-in', 'Завтра в 8 у ворот'); await p.click('#ch-send'); await p.waitForTimeout(400);
    t('сообщение в группу ушло', await p.evaluate(k => chMsgsOf(k).length === 1 && chMsgsOf(k)[0].group_id === k.slice(2) && !chMsgsOf(k)[0].to_user && !chMsgsOf(k)[0].channel, gkey));
    /* документ в группу самолётиком */
    await p.evaluate(id => App.openJob(id), ids.job); await p.waitForTimeout(600);
    await p.click('#db-share'); await p.waitForTimeout(300);
    await p.evaluate(k => { document.querySelectorAll('#ds-chips .ds-chip.ok').forEach(b => b.click()); document.querySelector(`#ds-chips [data-u="${k}"]`).click(); }, gkey);
    await p.click('#ds-send'); await p.waitForTimeout(500);
    t('самолётик документа отправляет его в группу', await p.evaluate(k => { const m = chMsgsOf(k); return m.length === 2 && m[1].doc_kind === 'job'; }, gkey));
    await p.evaluate(() => { try{ App.jobClose(); }catch(e){} }); await p.waitForTimeout(300);
    /* не участник группу не видит */
    await login('demo-manager');
    const mgr = await p.evaluate(k => ({ inList: !!document.querySelector(`#ch-ths .ch-th[data-k="${k}"]`), rows: chRows().filter(m => m.group_id).length, unread: chUnread(), post: chCanPost(k) }), gkey);
    await p.evaluate(() => App.go('chat')); await p.waitForTimeout(300);
    t('не участник: группы нет в списке, её сообщений нет в данных и счётчиках, писать в неё нельзя', !mgr.inList && mgr.rows === 0 && mgr.unread === 0 && mgr.post === false && await p.evaluate(k => !document.querySelector(`#ch-ths .ch-th[data-k="${k}"]`), gkey), mgr);
    /* участник: видит, счётчик, ссылка из пуша */
    await login('demo-admin');
    const adm = await p.evaluate(k => ({ unread: chUnread(k), badge: (document.querySelector('.tab[data-tab="chat"] .tab-badge') || {}).textContent }), gkey);
    t('участник: 2 непрочитанных в группе, счётчик в меню', adm.unread === 2 && adm.badge === '2', adm);
    await p.evaluate(k => deepLinkApply('./?chat=' + k), gkey); await p.waitForTimeout(500);
    const open = await p.evaluate(() => ({ scr: state.screen, thread: CH.thread, who: [...document.querySelectorAll('#ch-msgs .ch-who')].length, card: !!document.querySelector('#ch-msgs .ch-doc') }));
    t('ссылка ?chat=g:<id> открывает группу; у чужих сообщений видно имя, документ — карточкой', open.scr === 'chat' && open.thread === gkey && open.who >= 1 && open.card, open);
    /* состав: добавить менеджера, переименовать не-создателю нельзя (админу — можно) */
    await p.click('#ch-ginfo'); await p.waitForTimeout(300);
    await p.click(`#chg-chips [data-u="${ids.mgr}"]`); await p.evaluate(g => App.chGroupAdd(g), gid); await p.waitForTimeout(500);
    t('участник добавил человека: в группе трое', await p.evaluate(g => chGroupMembers(g).length === 3, gid));
    await p.evaluate(() => App.closeModal());
    await login('demo-manager');
    t('добавленный видит группу и ВСЮ её историю', await p.evaluate(k => chMsgsOf(k).length === 2, gkey));
    await p.evaluate(g => App.chGroupInfo(g), gid); await p.waitForTimeout(300);
    t('обычному участнику недоступны «Убрать» и «Удалить группу», название только для чтения; «Выйти» есть', await p.evaluate(() => !document.getElementById('chg-del') && !document.querySelector('.chg-m .btn') && document.getElementById('chg-name').readOnly && !!document.getElementById('chg-leave')));
    await p.evaluate(() => App.closeModal());
    /* создатель выходит — группа переходит следующему */
    await login('demo-tech');
    await p.evaluate(g => { App.chOpen('g:' + g); App.chGroupKick(g, state.user.id); }, gid); await p.waitForTimeout(300); await p.click('#ask-ok'); await p.waitForTimeout(500);
    const left = await p.evaluate(g => { const gr = chGroup(g); return { mem: chGroupMembers(g).length, owner: gr && gr.created_by, thread: CH.thread, inList: !!document.querySelector(`#ch-ths .ch-th[data-k="g:${g}"]`) }; }, gid);
    t('создатель вышел: группа осталась у двоих, перешла другому участнику, у вышедшего пропала из списка', left.mem === 2 && left.owner && left.owner !== ids.tech && left.thread === null && !left.inList, left);
    /* админ удаляет группу */
    await login('demo-admin');
    await p.evaluate(g => { App.chGroupDelete(g); }, gid); await p.waitForTimeout(300); await p.click('#ask-ok');   // без return: функция ждёт ответа на вопрос await p.waitForTimeout(500);
    t('удаление группы убирает её, состав и переписку', await p.evaluate(g => !chGroup(g) && chGroupMembers(g).length === 0 && !(state.data.chat_msgs || []).some(m => m.group_id === g), gid));
    await ctx.close(); console.log('  · ' + Math.round((Date.now() - T0) / 1000) + ' с');
  }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
