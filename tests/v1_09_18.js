/* v1.09.18 — бэкап: полный список таблиц (SQL-автобэкап и ручной JSON с восстановлением оплат и шаблонов заметок);
   чат: «✓ отправлено / ✓✓ прочитано» в личной переписке, realtime-подписка с запасным опросом, очистка при выходе.
   Демо-режим (оба пользователя — в одном localStorage). Запуск: node tests/v1_09_18.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8918;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 340) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  for (const d of ['functions-dashboard', 'functions']){
    const bk = fs.readFileSync(path.join(ROOT, 'supabase', d, 'backup/index.ts'), 'utf8');
    const list = (/const TABLES = \[([\s\S]*?)\];/.exec(bk) || [])[1] || '';
    const names = (list.match(/"([a-z_]+)"/g) || []).map(x => x.replace(/"/g, ''));
    t(`SQL-автобэкап (${d}): в списке прайс, остатки, настройки и оплаты бухгалтерии, шаблоны заметок, учёба; секретов и чата нет`,
      ['price_list', 'equipment_stock', 'acc_settings', 'acc_payments', 'note_templates', 'study_sessions', 'jobs', 'profiles'].every(x => names.includes(x))
      && !names.includes('app_secrets') && !names.includes('chat_msgs')   /* v1.09.19: чат из бэкапа на Диск убран намеренно */
      && new Set(names).size === names.length && /const BK_VER = "1\.09\.(1[89]|[2-9]\d)";/.test(bk), names.length);
  }
  const bkT = (/const BK_TABLES = \[([\s\S]*?)\];/.exec(src) || [])[1] || '';
  t('ручной JSON-бэкап выгружает оплаты и шаблоны заметок', /'acc_payments'/.test(bkT) && /'note_templates'/.test(bkT));
  for (const f of ['update-to-1_09_18.sql', 'full-install-1_09_18.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
    const fn = q.slice(q.lastIndexOf('create or replace function public.admin_restore_rows'));
    t(`${f}: восстановление принимает acc_payments и note_templates; «прочитано» видит собеседник; realtime включается без падения скрипта`,
      /'acc_payments','note_templates'\]/.test(fn.slice(0, 900)) && fn.includes("if public.my_role() is distinct from 'admin' then raise exception 'FORBIDDEN'")
      && q.includes('using (user_id = auth.uid() or thread = auth.uid()::text)') && q.includes('alter publication supabase_realtime add table public.chat_msgs')
      && q.includes("exception when others then raise notice 'TechLog: realtime для chat_msgs не включён"));
  }
  t('realtime — ускоритель с запасным опросом: подписка в try/catch, статус в журнале, опрос остаётся',
    src.includes(".on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_msgs' }") && src.includes("if (!CH.rtOk || Date.now() - CH.at > 30000) chLoad(true);")
    && src.includes("dlog('⚠ чат: realtime не запустился —', e); CH.rt = null;"));

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const login = async who => { await p.evaluate(w => localStorage.setItem('techlog_session_v1', w), who); await p.reload();
    await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1400); };
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await login('demo-tech');
  const ids = await p.evaluate(() => ({ me: state.user.id, admin: state.data.profiles.find(x => x.role === 'admin').id }));
  await p.evaluate(id => App.chOpen(id), ids.admin); await p.waitForTimeout(300);
  await p.fill('#ch-in', 'привет'); await p.press('#ch-in', 'Enter'); await p.waitForTimeout(400);
  const t1 = await p.evaluate(() => { const e = document.querySelector('#ch-msgs .ch-msg.mine .ch-tick'); return e ? { txt: e.textContent, read: e.classList.contains('read') } : null; });
  t('своё личное сообщение: «✓ отправлено»', t1 && t1.txt === '✓' && !t1.read, t1);
  await p.evaluate(() => App.chOpen('all')); await p.waitForTimeout(250);
  await p.fill('#ch-in', 'всем'); await p.press('#ch-in', 'Enter'); await p.waitForTimeout(350);
  t('в общем чате отметок прочтения нет', await p.evaluate(() => !document.querySelector('#ch-msgs .ch-tick')));
  await p.evaluate(() => saveLocalNow()); await p.waitForTimeout(300);
  await login('demo-admin');
  await p.evaluate(me => App.chOpen(me), ids.me); await p.waitForTimeout(500);
  t('у получателя чужие сообщения без отметок', await p.evaluate(() => document.querySelectorAll('#ch-msgs .ch-msg').length === 1 && !document.querySelector('#ch-msgs .ch-tick')));
  await p.evaluate(() => saveLocalNow()); await p.waitForTimeout(300);
  await login('demo-tech');
  await p.evaluate(id => App.chOpen(id), ids.admin); await p.waitForTimeout(400);
  const t2 = await p.evaluate(() => { const e = document.querySelector('#ch-msgs .ch-msg.mine .ch-tick'); return e ? { txt: e.textContent, read: e.classList.contains('read') } : null; });
  t('после того как собеседник открыл переписку — синие «✓✓ прочитано»', t2 && t2.txt === '✓✓' && t2.read, t2);
  await p.fill('#ch-in', 'а это ещё нет'); await p.press('#ch-in', 'Enter'); await p.waitForTimeout(350);
  const t3 = await p.evaluate(() => [...document.querySelectorAll('#ch-msgs .ch-msg.mine .ch-tick')].map(e => e.textContent));
  t('новое сообщение — снова «✓», прежнее остаётся «✓✓»', t3.join() === '✓✓,✓', t3);
  const lo = await p.evaluate(() => { CH.rows = [{ id: 'x' }]; CH.draft = { a: 'b' }; App.logout(); return { rows: CH.rows.length, draft: Object.keys(CH.draft).length, thread: CH.thread, rt: CH.rt, user: !!state.user }; });
  t('выход из аккаунта стирает переписку и черновики из памяти приложения', lo.rows === 0 && lo.draft === 0 && lo.thread === null && lo.rt === null && !lo.user, lo);
  await ctx.close(); await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
