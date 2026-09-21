/* v1.09.22 — надёжные push-уведомления: стопка по переписке (воркер и сервер), срочность и срок жизни, захват очереди,
   отправка от базы (pg_net), самовосстановление подписки, ссылки в документ, «Документ изменён», экран «Доставка
   уведомлений» с проверкой и памяткой по марке телефона. Статические проверки + логика в браузере (демо).
   Запуск: node tests/v1_09_22.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), vm = require('vm');
const PORT = process.argv[2] || 8922;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 360) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  /* ---- Edge Function ---- */
  for (const d of ['functions-dashboard', 'functions']){
    const f = fs.readFileSync(path.join(ROOT, 'supabase', d, 'push/index.ts'), 'utf8');
    t(`push (${d}): сообщения одной переписки — одним уведомлением (ключ — получатель + url переписки); срочность high, срок жизни сутки, topic; захват очереди с запасным путём; операции check и test`,
      f.includes('(chats[r.user_id + "|" + r.url] = chats[r.user_id + "|" + r.url] ?? []).push(r)') && f.includes('urgency: "high"') && f.includes('24 * 3600') && f.includes('...(topic ? { topic } : {})')
      && f.includes('await s.rpc("push_claim", { p_limit: 200 })') && f.includes('if (!cl.error) q = cl.data') && f.includes('b.op === "check"') && f.includes('b.op === "test"') && /PUSH_VER = "1\.09\.(2[2-9]|[3-9]\d)"/.test(f));   // версия функции двинулась дальше
    const chk = f.slice(f.indexOf('b.op === "check"'), f.indexOf('b.op === "test"'));
    t(`push (${d}): проверочный пуш можно послать только себе; операция check не отдаёт наружу ни ключей, ни чужих подписок`, f.includes('insert({ user_id: uid, kind: "test"') && chk.length > 200 && !/priv|push_cron_key|p256dh|auth"/.test(chk) && (chk.match(/\.eq\("user_id", uid\)/g) || []).length === 2);
  }
  /* ---- SQL ---- */
  for (const n of ['update-to-1_09_22.sql', 'full-install-1_09_22.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', n), 'utf8');
    const kick = q.slice(q.lastIndexOf('create or replace function public.push_kick()')), job = q.slice(q.lastIndexOf('create or replace function public.jobs_push_tg_fn()'));
    t(`${n}: толчок от базы — один на транзакцию, после commit, и НИКОГДА не роняет запись в очередь; захват очереди — skip locked и только для service_role`,
      kick.includes("if current_setting('techlog.push_kicked', true) = '1' then return null; end if;") && kick.includes('exception when others then null;') && kick.includes("'apikey', v_key") && kick.includes("when v_key like 'eyJ%'") && q.includes('after insert on public.push_queue for each statement execute function public.push_kick();')
      && q.includes('for update skip locked') && q.includes('grant execute on function public.push_claim(int) to service_role;') && q.includes('revoke all on function public.push_claim(int) from public, anon, authenticated;'));
    t(`${n}: уведомления о документах ведут в документ; «Документ изменён» — только значимые поля, не автору правки, не чаще раза в 10 минут`,
      job.includes("v_url  := './?doc=job:' || new.id::text;") && job.includes('new.form_data is distinct from old.form_data') && job.includes("x.uid <> auth.uid()") && job.includes("interval '10 minutes'")
      && q.includes("'./?day=' || to_char(new.due_date, 'YYYY-MM-DD')") && q.includes("v_url := './?doc=rep:' || new.id::text;"));
  }
  const setup = fs.readFileSync(path.join(ROOT, 'supabase/push-setup.sql'), 'utf8');
  t('push-setup.sql: pg_net и pg_cron, адрес функции и ключ проекта уже подставлены; ключ нового формата идёт как apikey (не Bearer), есть указание выключить Verify JWT и запрос-диагностика ответов; утренняя сводка и разбор очереди каждые 5 минут; старого cron-файла в сборке нет',
    setup.includes('create extension if not exists pg_net;') && /'push_fn_url', 'https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/push'/.test(setup) && /'push_fn_key', '(eyJ[\w.-]{60,}|sb_publishable_[\w-]{20,})'/.test(setup)
    && setup.includes("'apikey', (select value from public.app_secrets where key = 'push_fn_key')") && setup.includes("like 'eyJ%'") && /ВЫКЛЮЧИТЕ «Verify JWT»/.test(setup) && setup.includes('from net._http_response')
    && setup.includes("'30 11 * * *'") && setup.includes("'*/5 * * * *'") && !setup.includes('ВАШ_ANON_KEY') && !fs.existsSync(path.join(ROOT, 'supabase/cron-push-morning.sql')));
  /* ---- сервис-воркер: стопка ---- */
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  t('воркер: стопка по tag с повторным сигналом, кнопки, журнал последнего пуша, значок, смена подписки; уведомление показывается всегда',
    sw.includes('self.registration.getNotifications({ tag })') && sw.includes('renotify: true') && sw.includes("actions: [{ action: 'open'") && sw.includes("await tlKvSet('last'")
    && sw.includes('self.navigator.setAppBadge') && sw.includes("addEventListener('pushsubscriptionchange'") && sw.includes("if (e.action === 'close') return;"));
  const fn = /function tlStack\(prevData, d\)\{[\s\S]*?\n\}/.exec(sw)[0]; const ctx = {}; vm.runInNewContext(fn + '; this.tlStack = tlStack;', ctx);
  const s1 = ctx.tlStack(null, { title: 'Иван', lines: ['привет'], n: 1 }), s2 = ctx.tlStack({ lines: s1.lines, count: s1.count }, { title: 'Иван', lines: ['как дела?', 'ты где?'], n: 2 });
  let acc = { lines: [], count: 0 }; for (let i = 1; i <= 9; i++){ const r = ctx.tlStack(acc, { title: 'Бригада · Олег (3)', lines: ['сообщение ' + i], n: 1 }); acc = { lines: r.lines, count: r.count, title: r.title, body: r.body }; }
  t('стопка: первое — «Иван», затем «Иван (3)» с тремя строками; счётчик в заголовке не удваивается; в памяти не больше 6 строк, в тексте — 5', s1.title === 'Иван' && s2.title === 'Иван (3)' && s2.body === 'привет\nкак дела?\nты где?'
    && acc.title === 'Бригада · Олег (9)' && acc.lines.length === 6 && acc.body.split('\n').length === 5 && acc.body.endsWith('сообщение 9'), { s2, acc });

  /* ---- приложение ---- */
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const UA = { xiaomi: 'Mozilla/5.0 (Linux; Android 13; 22101316G Build/TKQ1; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' };
  for (const [brand, ua] of Object.entries(UA)){
    const c = await br.newContext({ viewport: { width: 412, height: 915 }, userAgent: ua, hasTouch: true, isMobile: true, serviceWorkers: 'block' }); const p = await c.newPage();
    p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); });
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'mobile'); });
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1300);
    await p.evaluate(() => { App.go('settings'); foldSet('push', true); render(); }); await p.waitForTimeout(600);
    const r = await p.evaluate(() => { const c = document.getElementById('pd-card'); if (!c) return null; const b = c.getBoundingClientRect(); return { brand: pdBrand(), memo: document.getElementById('pd-memo').textContent, rows: [...c.querySelectorAll('.pd-row')].map(x => x.dataset.k + ':' + x.className.replace('pd-row pd-', '')),
      fit: b.right <= innerWidth + 1, test: !!document.getElementById('pd-test') }; });
    const want = { xiaomi: /Автозапуск/, samsung: /спящем режиме/i, ios: /ярлыка на экране «Домой»/ }[brand];
    t(`${brand}: марка определена, в памятке — шаги именно для неё; карточка в границах экрана, кнопка проверки на месте`, r && r.brand === brand && want.test(r.memo) && r.fit && r.test, r && { brand: r.brand, rows: r.rows });
    if (brand === 'ios') t('iPhone во вкладке Safari: звено «установка» красное — пуши только с ярлыка', r.rows.includes('install:bad'), r.rows);
    if (brand === 'xiaomi'){
      const lg = await p.evaluate(() => { const mk = (info, sub, last) => { PB.sub = sub; PD.info = info; PD.last = last; return pdChecks().map(x => x.key + ':' + x.st).join(' '); };
        const hs = typeof HAS_SB; return { demo: mk(null, null, null), hs }; });
      t('демо: сервера нет — цепочка честно обрывается на «проверяется только устройство»', /server:wait/.test(lg.demo), lg);
      /* логика вердиктов на «живых» данных: подменяем только признак сервера через eval в области приложения нельзя — проверяем функцию напрямую */
      const v = await p.evaluate(() => { const fnSrc = pdChecks.toString().replace('if (!HAS_SB){', 'if (false){'); const f = new Function('pbSupported', 'pdBrand', 'pdStandalone', 'PD', 'PB', 't', 'HAS_SB', 'pdAgo', 'Notification', 'return (' + fnSrc + ')')
          (() => true, () => 'xiaomi', () => true, PD, PB, t, true, pdAgo, { permission: 'granted' });
        const run = (info, last) => { PB.sub = { endpoint: 'x' }; PD.info = info; PD.last = last; return f().map(x => x.key + ':' + x.st).join(' '); };
        const now = new Date().toISOString();
        return { good: run({ known: true, devices: 2, ver: '1.09.22', last_kick: now, last_cron: now, unsent: 0, last_sent: now }, { last: { at: Date.now(), title: 'Иван' } }),
                 broken: run({ known: false, devices: 0, ver: '1.09.13', last_kick: null, last_cron: null, unsent: 7, last_err: 'HTTP 403' }, { last: null }) }; });
      t('всё настроено — все звенья зелёные', !/:(bad|warn|wait)/.test(v.good), v.good);
      t('сломано — красным именно звенья: сервер не знает устройство, функция устарела, расписания нет; очередь и «пушей не было» — предупреждением', /server:bad/.test(v.broken) && /fn:bad/.test(v.broken) && /cron:bad/.test(v.broken) && /kick:warn/.test(v.broken) && /queue:warn/.test(v.broken) && /got:warn/.test(v.broken), v.broken);
      const tp = await p.evaluate(async () => { PD.test = { st: 'run', text: '…', nonce: 'abc123', t0: Date.now() - 2300 }; const own = pdOnPush({ url: './?pushtest=abc123', title: 'x' }); const other = pdOnPush({ url: './?chat=all' });
        return { own, other, st: PD.test.st, text: PD.test.text, log: (state.data.audit_log || []).some(a => a.action === 'push_test') }; });
      t('проверочный пуш опознаётся по метке: «дошло за N с», в обычную подсказку он не попадает; чужие пуши идут своим путём', tp.own === true && tp.other === false && tp.st === 'ok' && /2\.[0-9] с/.test(tp.text) && tp.log, tp);
      await p.evaluate(() => { App.go('home'); deepLinkApply('./?pushtest=zzz'); }); await p.waitForTimeout(400);
      t('нажатие на проверочное уведомление открывает экран доставки, а не главную', await p.evaluate(() => state.screen === 'settings' && !!document.getElementById('pd-card')));
      await p.evaluate(() => App.pdTest()); await p.waitForTimeout(500);
      t('без подписки проверка честно говорит «сначала включите уведомления»', await p.evaluate(() => PD.test && PD.test.st === 'bad' && /включите уведомления/i.test(PD.test.text)));
      t('в списке уведомлений появилась галочка «Мой документ изменил кто-то другой»', await p.evaluate(() => /Мой документ изменил/.test(pbCardHtml())));
    }
    await c.close();
  }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
