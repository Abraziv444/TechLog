/* v1.09.17 — «Сообщения»: пункт меню со счётчиком, каналы и личная переписка, документ карточкой, «Важно»,
   объявления только от менеджера и админа, самолётик документа шлёт в чат, плашка на главной, ссылка ?chat=,
   подсказка о пуше, «Назад» на телефоне, удаление, вёрстка ленты. Демо-режим: оба пользователя — в одном
   localStorage. Запуск: node tests/v1_09_17.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8917;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 360) : '')); } }
(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/update-to-1_09_17.sql'), 'utf8');
  t('SQL: личное видят только двое, запись только через chat_send, объявления — админ и менеджер, вложение — только видимый отправителю документ, push со ссылкой на переписку',
    sql.includes('using (channel is not null or from_user = auth.uid() or to_user = auth.uid())') && sql.includes('revoke insert, update on public.chat_msgs from authenticated, anon')
    && sql.includes("if p_channel = 'ann' and v_role not in ('admin','manager') then raise exception 'FORBIDDEN'") && sql.includes('v_ok := public.can_view_job(p_doc)')
    && sql.includes("'./?chat=' || v_me::text") && sql.includes("and v_role in ('admin','manager');") && sql.includes('acc_payments'));
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  for (const o of [{ w: 1400, h: 900, mode: 'desktop' }, { w: 412, h: 915, mode: 'mobile', touch: true }]){
    console.log('— ' + o.mode + ' —');
    const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); });
    p.on('dialog', d => d.accept());
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const login = async who => { await p.evaluate(w => localStorage.setItem('techlog_session_v1', w), who); await p.reload();
      await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1500); };
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
    await p.evaluate(mode => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('techlog_view_mode', mode); }, o.mode);
    await login('demo-tech');
    const ids = await p.evaluate(() => ({ me: state.user.id, admin: state.data.profiles.find(x => x.role === 'admin').id, job: (state.data.jobs.find(j => j.technician_id === state.user.id) || state.data.jobs[0]).id }));
    t('в меню есть «Сообщения», счётчик скрыт, пока нечего читать', await p.evaluate(() => { const b = document.querySelector('.tab[data-tab="chat"]'); return !!b && b.querySelector('.tab-badge').hidden; }));
    if (o.mode === 'mobile'){
      const adminBar = await p.evaluate(() => { const me = state.user; state.user = state.data.profiles.find(x => x.role === 'admin'); render();
        const tabs = [...document.querySelectorAll('.tabbar .tab')]; const r = { n: tabs.length, multi: document.querySelector('.tabbar').classList.contains('tb-multi'), minW: Math.min(...tabs.map(b => Math.round(b.getBoundingClientRect().width))) };
        state.user = me; render(); return r; });
      t('телефон, админ: 17 пунктов — меню само в 2 ряда, кнопки не у́же 40 px', adminBar.n >= 16 && adminBar.multi && adminBar.minW >= 40, adminBar);
    }
    await p.evaluate(() => App.go('chat')); await p.waitForTimeout(500);
    const lst = await p.evaluate(() => [...document.querySelectorAll('#ch-ths .ch-th')].map(b => b.dataset.k));
    t('список: «Общий чат», «Объявления» и сотрудники (v1.09.20: общий чат — первым)', lst[0] === 'all' && lst[1] === 'ann' && lst.includes(ids.admin) && !lst.includes(ids.me), lst);
    await p.evaluate(() => App.chOpen('ann')); await p.waitForTimeout(300);
    t('сотрудник в «Объявления» писать не может: поля ввода нет', await p.evaluate(() => !document.getElementById('ch-in') && !!document.querySelector('.ch-ro')));
    /* личное сообщение админу с документом */
    await p.evaluate(id => App.chOpen(id), ids.admin); await p.waitForTimeout(300);
    t('у сотрудника нет кнопки «Важно»', await p.evaluate(() => !document.getElementById('ch-imp-btn') && !!document.getElementById('ch-doc-btn')));
    await p.click('#ch-doc-btn'); await p.waitForTimeout(300);
    t('выбор документа: список своих документов с поиском', await p.evaluate(() => document.querySelectorAll('#ch-pick-list .ds-row').length > 0 && !!document.getElementById('ch-pick-q')));
    await p.evaluate(id => App.chAttach({ kind: 'job', id }), ids.job); await p.waitForTimeout(300);
    t('вложение показано над полем ввода', await p.evaluate(() => !!document.getElementById('ch-att')));
    await p.fill('#ch-in', 'Посмотрите потолок в ванной,\nнужен апрув'); await p.click('#ch-send'); await p.waitForTimeout(500);
    const sent = await p.evaluate(() => { const m = [...document.querySelectorAll('#ch-msgs .ch-msg')]; const last = m[m.length - 1]; const box = document.getElementById('ch-msgs'), wrap = document.getElementById('ch-wrap').getBoundingClientRect();
      const comp = document.getElementById('ch-compose').getBoundingClientRect(), tb = document.querySelector('.tabbar'); const tbr = tb ? tb.getBoundingClientRect() : null;
      return { n: m.length, mine: last.classList.contains('mine'), card: !!last.querySelector('.ch-doc:not(.locked)'), text: last.querySelector('.ch-text').textContent, input: document.getElementById('ch-in').value, att: !!document.getElementById('ch-att'),
        atEnd: box.scrollHeight - box.scrollTop - box.clientHeight < 4, fitX: wrap.right <= innerWidth + 1, compVisible: comp.bottom <= innerHeight + 1 && (!tbr || tbr.top < innerHeight / 2 || comp.bottom <= tbr.top + 1) }; });
    t('сообщение ушло: своё справа, с карточкой документа и переносом строки; поле очищено, лента прокручена вниз, поле ввода на экране и не под нижним меню',
      sent.n === 1 && sent.mine && sent.card && /\n/.test(sent.text) && sent.input === '' && !sent.att && sent.atEnd && sent.fitX && sent.compVisible, sent);
    await p.fill('#ch-in', 'второе'); if (o.mode === 'desktop') await p.press('#ch-in', 'Enter'); else await p.click('#ch-send'); await p.waitForTimeout(400);
    t(o.mode === 'desktop' ? 'на ПК Enter отправляет' : 'на телефоне отправка кнопкой', await p.evaluate(() => document.querySelectorAll('#ch-msgs .ch-msg').length === 2));
    if (o.mode === 'mobile'){
      const r = await p.evaluate(async () => { const a = await backPressed(); return { a, thread: CH.thread, list: getComputedStyle(document.getElementById('ch-list')).display }; });
      t('телефон: «Назад» из переписки возвращает к списку', r.a === 'chat-thread' && r.thread === null && r.list !== 'none', r);
    }
    /* самолётик документа → в общий чат */
    await p.evaluate(id => App.openJob(id), ids.job); await p.waitForTimeout(600);
    await p.click('#db-share'); await p.waitForTimeout(300);
    await p.evaluate(() => { document.querySelectorAll('#ds-chips .ds-chip.ok').forEach(b => b.click()); document.querySelector('#ds-chips [data-u="all"]').click(); });
    await p.fill('#ds-note', 'Кто рядом — заберите ключи'); await p.click('#ds-send'); await p.waitForTimeout(500);
    t('самолётик документа отправляет его сообщением в «Общий чат»', await p.evaluate(() => { const m = chMsgsOf('all'); return m.length === 1 && m[0].doc_kind === 'job' && /ключи/.test(m[0].body) && !document.getElementById('overlay'); }));
    await p.evaluate(() => { try{ App.jobClose(); }catch(e){} }); await p.waitForTimeout(1800);      // saveLocal отложен

    /* получатель — админ */
    await login('demo-admin');
    const adm = await p.evaluate(() => { const b = document.querySelector('.tab[data-tab="chat"] .tab-badge'); const bn = document.getElementById('b-chat');
      return { badge: b && !b.hidden ? b.textContent : '', banner: bn ? bn.textContent.replace(/\s+/g, ' ').trim() : '', n: chUnread() }; });
    t('у админа: счётчик в меню = 3 и плашка «Новые сообщения: 3» на главной', adm.badge === '3' && /: 3/.test(adm.banner) && adm.n === 3, adm);
    await p.click('#b-chat'); await p.waitForTimeout(400);
    const th = await p.evaluate(me => { const b = document.querySelector(`#ch-ths .ch-th[data-k="${me}"]`); return b ? { unread: b.classList.contains('unread'), n: (b.querySelector('.ch-n') || {}).textContent, first: ([...document.querySelectorAll('#ch-ths .ch-th')].filter(x => !['all', 'ann', 'ntf'].includes(x.dataset.k) && !/^g:/.test(x.dataset.k))[0] || { dataset: {} }).dataset.k === me }   /* v1.09.25: каналов стало три (+ лента «Уведомления») — первого человека ищем не по номеру строки */ : null; }, ids.me);
    t('переписка с сотрудником — первая среди людей, непрочитанных 2', th && th.unread && th.n === '2' && th.first, th);
    await p.evaluate(me => App.chOpen(me), ids.me); await p.waitForTimeout(500);
    const conv = await p.evaluate(() => ({ newMark: !!document.querySelector('#ch-msgs .ch-new'), card: !!document.querySelector('#ch-msgs .ch-doc:not(.locked)'), imp: !!document.getElementById('ch-imp-btn'), left: !document.querySelector('#ch-msgs .ch-msg.mine'), unread: chUnread() }));
    t('в переписке: отметка «новые сообщения», чужие слева, карточка документа открываемая, у админа есть «Важно»; прочитанное снято со счётчика', conv.newMark && conv.card && conv.imp && conv.left && conv.unread === 1, conv);
    await p.click('#ch-msgs .ch-doc'); await p.waitForTimeout(700);
    t('нажатие на карточку сразу открывает документ', await p.evaluate(id => state.screen === 'job' && jobDraft && jobDraft.id === id, ids.job));
    await p.evaluate(() => { try{ App.jobClose(); }catch(e){} App.go('chat'); }); await p.waitForTimeout(400);
    /* важное объявление */
    await p.evaluate(() => App.chOpen('ann')); await p.waitForTimeout(300);
    await p.click('#ch-imp-btn'); await p.fill('#ch-in', 'Завтра выезд в 7:00'); await p.click('#ch-send'); await p.waitForTimeout(400);
    const ann = await p.evaluate(() => { const m = chMsgsOf('ann')[0]; const el = document.querySelector('#ch-msgs .ch-msg'); return { imp: m && m.important, red: !!el && el.classList.contains('imp') && !!el.querySelector('.ch-imp'), off: document.getElementById('ch-imp-btn').getAttribute('aria-pressed') }; });
    t('админ пишет в «Объявления» с пометкой «Важно»: выделено красным, кнопка отжата после отправки', ann.imp === true && ann.red && ann.off === 'false', ann);
    /* документ без доступа — карточка с замком */
    await p.evaluate(me => { state.data.chat_msgs.push({ id: uid(), from_user: me, to_user: state.user.id, channel: null, body: '', important: false, doc_kind: 'job', doc_id: '00000000-0000-4000-8000-000000000000', doc_title: 'WORK-X · Unit 1', created_at: new Date().toISOString() }); App.chOpen(me); }, ids.me); await p.waitForTimeout(300);
    const lock = await p.evaluate(() => { const c = document.querySelector('#ch-msgs .ch-doc.locked'); if (!c) return null; c.click(); return { txt: c.textContent.replace(/\s+/g, ' '), scr: state.screen }; });
    t('документ, которого у получателя нет, — карточка с замком и названием; нажатие никуда не ведёт', lock && /WORK-X/.test(lock.txt) && /нет доступа/.test(lock.txt) && lock.scr === 'chat', lock);
    /* чужая личная переписка не видна и не считается */
    const foreign = await p.evaluate(me => { const mgr = state.data.profiles.find(x => x.role === 'manager').id; const n0 = chUnread();
      state.data.chat_msgs.push({ id: uid(), from_user: me, to_user: mgr, channel: null, body: 'не для админа', important: false, doc_kind: null, doc_id: null, doc_title: '', created_at: new Date().toISOString() });
      return { same: chUnread() === n0, hidden: !chMsgsOf(me).some(m => m.body === 'не для админа') }; }, ids.me);
    t('чужая личная переписка (сотрудник → менеджер) админу не видна и в счётчик не идёт', foreign.same && foreign.hidden, foreign);
    /* удаление своего сообщения */
    await p.evaluate(() => App.chOpen('ann')); await p.waitForTimeout(300);
    await p.click('#ch-msgs .ch-msg .ch-bub'); await p.waitForTimeout(250); await p.click('#ch-menu .ch-menu-a .dng'); await p.waitForTimeout(300); await p.click('#ask-ok'); await p.waitForTimeout(400);   // v1.09.19: удаление — из меню сообщения
    t('своё сообщение удаляется через вопрос', await p.evaluate(() => chMsgsOf('ann').length === 0));
    /* ссылка из уведомления и подсказка о пуше */
    await p.evaluate(() => { App.go('settings'); deepLinkApply('./?chat=all'); }); await p.waitForTimeout(500);
    t('ссылка ?chat=all открывает «Общий чат»', await p.evaluate(() => state.screen === 'chat' && CH.thread === 'all' && chUnread('all') === 0));
    await p.evaluate(me => { App.go('home'); pushInAppPop({ title: 'Ivan', body: 'привет', url: './?chat=' + me }); }, ids.me); await p.waitForTimeout(300);
    t('пуш при открытом приложении — подсказка с кнопкой «Открыть чат»', await p.evaluate(() => { const b = document.querySelector('#push-pop [data-a="go"]'); return !!b && /Открыть чат/i.test(b.textContent); }));
    await p.click('#push-pop [data-a="go"]'); await p.waitForTimeout(400);
    t('кнопка открывает нужную переписку', await p.evaluate(me => state.screen === 'chat' && CH.thread === me, ids.me));
    await p.evaluate(me => pushInAppPop({ title: 'Ivan', body: 'ещё', url: './?chat=' + me }), ids.me); await p.waitForTimeout(250);
    t('если эта переписка уже на экране, подсказка не всплывает', await p.evaluate(() => !document.getElementById('push-pop')));
    /* черновик сообщения переживает перерисовку */
    await p.fill('#ch-in', 'недописанное'); await p.evaluate(() => render()); await p.waitForTimeout(250);
    t('недописанный текст не теряется при перерисовке экрана', await p.evaluate(() => document.getElementById('ch-in').value === 'недописанное'));
    await ctx.close();
  }
  { console.log('— бухгалтер —');
    const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'desktop'); });
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1400);
    const r = await p.evaluate(() => { state.user.role = 'accountant'; render(); const has = !!document.querySelector('.tab[data-tab="chat"]'); App.go('chat'); return { has, scr: state.screen }; });
    t('у бухгалтера «Сообщения» тоже есть и открываются', r.has && r.scr === 'chat', r);
    await ctx.close(); }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
