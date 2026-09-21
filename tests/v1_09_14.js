/* v1.09.14 — поделиться документом: кнопка в шапке задачи / пропозала / ремонта, ссылка ?doc=kind:id,
   отправка внутри TechLog (с v1.09.17 — сообщением в чат), плашка у получателя,
   открытие документа по ссылке и из подсказки о пуше. Демо-режим, CDN режутся.
   Запуск: node tests/v1_09_14.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8914;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + (typeof note === 'string' ? note : JSON.stringify(note)) : '')); }
}
(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/update-to-1_09_14.sql'), 'utf8');
  t('SQL: doc_shares с RLS (отправитель, получатель, админ), запись только функциями, проверка доступа отправителя, push со ссылкой',
    sql.includes('create table if not exists public.doc_shares') && sql.includes('to_user = auth.uid() or from_user = auth.uid() or public.my_role() = \'admin\'')
    && sql.includes('revoke insert, update, delete on public.doc_shares from authenticated, anon') && sql.includes('v_ok := public.can_view_job(p_doc)')
    && sql.includes("'./?doc=' || p_kind || ':' || p_doc::text") && sql.includes('board_order_notify'));
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  for (const o of [{ w: 1400, h: 1000, mode: 'desktop' }, { w: 412, h: 915, mode: 'mobile', touch: true }]){
    console.log('— ' + o.mode + ' —');
    const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); });
    p.on('dialog', d => d.accept());
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const login = async who => { await p.evaluate(w => { localStorage.setItem('techlog_session_v1', w); }, who); await p.reload();
      await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1500); };
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
    await p.evaluate(mode => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('techlog_view_mode', mode); }, o.mode);
    await login('demo-tech');
    const jid = await p.evaluate(() => (state.data.jobs.find(j => j.technician_id === state.user.id) || state.data.jobs[0]).id);
    await p.evaluate(id => App.openJob(id), jid); await p.waitForTimeout(600);
    const bar = await p.evaluate(() => { const b = document.getElementById('db-share'); if (!b) return null; const r = b.getBoundingClientRect(), d = document.querySelector('.docbar').getBoundingClientRect();
      return { in: r.left >= d.left - 1 && r.right <= d.right + 1, w: Math.round(r.width), h: Math.round(r.height) }; });
    t('в шапке документа есть кнопка «Поделиться», она внутри шапки и не мельче 24 px', bar && bar.in && bar.w >= 24 && bar.h >= 24, bar);
    await p.click('#db-share'); await p.waitForTimeout(300);
    const m = await p.evaluate(id => ({ link: document.getElementById('ds-link').value, want: '?doc=job:' + id,
      pre: [...document.querySelectorAll('#ds-chips .ds-chip.ok')].length, all: document.querySelectorAll('#ds-chips .ds-chip').length }), jid);
    t('ссылка вида ?doc=job:<id>; менеджеры и админы отмечены заранее', m.link.endsWith(m.want) && m.pre >= 1 && m.all >= m.pre, m);
    await p.click('#ds-copy'); await p.waitForTimeout(200);
    t('«Копировать ссылку» кладёт её в буфер', (await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))).endsWith(m.want));
    await p.fill('#ds-note', 'Посмотрите потолок в ванной'); await p.click('#ds-send'); await p.waitForTimeout(500);
    /* v1.09.17: отдельного журнала пересылок больше нет — документ уходит сообщением в чат */
    const sent = await p.evaluate(() => ({ n: (state.data.chat_msgs || []).filter(m => m.doc_kind === 'job').length, modal: !!document.getElementById('overlay'), log: (state.data.audit_log || []).some(a => a.action === 'doc_share') }));
    t('отправка создаёт сообщения чата с документом (по одному на получателя), окно закрыто, запись в журнале событий', sent.n === m.pre && !sent.modal && sent.log, sent);
    await p.evaluate(() => { try{ App.jobClose(); }catch(e){} saveLocalNow(); }); await p.waitForTimeout(600);   // запись на устройство — сразу
    await login('demo-admin');
    const bnr = await p.evaluate(() => { const b = document.getElementById('b-chat'); return { txt: b ? b.textContent.replace(/\s+/g, ' ').trim() : null, unread: chUnread(), msgs: (state.data.chat_msgs || []).length, scr: state.screen, me: state.user.id }; });
    t('у получателя на главной плашка «Новые сообщения: 1»', !!bnr.txt && /: 1/.test(bnr.txt), bnr);
    /* ссылка и подсказка о пуше */
    await p.evaluate(id => { App.go('settings'); deepLinkApply('./?doc=job:' + id); }, jid); await p.waitForTimeout(600);
    t('ссылка ?doc=job:<id> открывает документ в уже открытом окне', await p.evaluate(() => state.screen === 'job'));
    await p.evaluate(() => { try{ App.jobClose(); }catch(e){} }); await p.waitForTimeout(300);
    await p.evaluate(() => deepLinkApply('./?doc=job:00000000-0000-4000-8000-000000000000')); await p.waitForTimeout(400);
    t('чужой или удалённый документ по ссылке не открывается', await p.evaluate(() => state.screen !== 'job'));
    await p.evaluate(id => pushInAppPop({ title: 'Вам отправили документ', body: 'Ivan: Unit 916', url: './?doc=job:' + id }), jid); await p.waitForTimeout(300);
    t('подсказка о пуше со ссылкой на документ — кнопка «Открыть документ»', await p.evaluate(() => { const b = document.querySelector('#push-pop [data-a="go"]'); return !!b && /Открыть документ/i.test(b.textContent); }));
    await p.click('#push-pop [data-a="go"]'); await p.waitForTimeout(600);
    t('кнопка открывает документ', await p.evaluate(() => state.screen === 'job'));
    await ctx.close();
  }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})();
