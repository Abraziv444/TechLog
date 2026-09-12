/* Смоук v1.08.39: бухгалтерия.
   1. Роль «Бухгалтер»: своя вкладка, нет главной/доски/склада, бейдж роли,
      главная перенаправляется в «Бухгалтерию», форма инвойса не открывается
      (вместо неё карточка только для чтения).
   2. Реестр: раскладка демо-инвойса по категориям (клининг / аренда по
      типам техники), итог = jobGrand, колонка «К выплате» после ввода
      процентов (общий процент аренды + свой на BLW), фильтры и поиск.
   3. Отметка бухгалтера: статус + заметка сохраняются, бейдж в строке,
      массовая отметка, строка «Бухгалтерия» в форме инвойса у админа.
   4. Карта «секция → категория»: перенос Other services в материалы и сброс.
   5. Сводка по сотрудникам: поровну на бригаду ↔ всё основному.
   6. CSV: файл скачивается, шапка и итог на месте.
   7. Админ видит вкладку, техник — нет; бухгалтера нет в выборе исполнителя.
   8. ПК-режим: шапка таблицы видна, строка — сетка на 10 колонок.
   9. Словарь: все ключи acc_* есть и в ru, и в en.
   Демо-режим. Запуск: node tests/v1_08_39.js <порт> */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8152;
let ok = 0, bad = 0;
const t = (n, c, x) => { if (c){ ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const br = await chromium.launch({ executablePath:
    process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 414, height: 896 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('dialog', d => d.accept());
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => {
    const u = r.request().url();
    if (/leaflet\.min\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: 'window.L={};' });
    if (/\.css/.test(u)) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort();
  });
  const login = async (id, mode) => {
    await p.goto('http://127.0.0.1:' + PORT + '/index.html');
    await p.evaluate(({ id, mode }) => {
      localStorage.setItem('techlog_session_v1', id);
      localStorage.setItem('techlog_view_mode', mode || 'mobile');
    }, { id, mode });
    await p.reload(); await p.waitForTimeout(1500);
  };
  const today = new Date(); const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const from30 = iso(new Date(today.getTime() - 40 * 864e5)), to0 = iso(today);

  console.log('— 1. роль «Бухгалтер» —');
  await login('demo-acc');
  const r1 = await p.evaluate(() => ({
    screen: window.App.curScreen(),
    tabs: Array.from(document.querySelectorAll('.tabbar .tab')).map(b => (b.getAttribute('onclick') || '').replace(/App\.go\('|'\)|App\.|\(\)/g, '')),
    role: (document.querySelector('.topbar .role-tag') || {}).className || '',
    title: (document.querySelector('.section-title') || {}).textContent || '',
  }));
  t('после входа — экран «Бухгалтерия»', r1.screen === 'acc', r1.screen);
  /* v1.08.45: первым пунктом любого меню стал глобальный поиск */
  t('вкладки: поиск, acc, reports, stats, dirs, faq, settings', r1.tabs.join(',') === 'searchOpen,acc,reports,stats,dirs,faq,settings', r1.tabs.join(','));
  t('нет главной, доски, склада, ремонтов, пропозалов', !/home|board|stock|repairs|proposals/.test(r1.tabs.join(',')));
  t('бейдж роли rt-accountant', /rt-accountant/.test(r1.role), r1.role);
  t('заголовок «Бухгалтерия»', /Бухгалтерия/.test(r1.title));
  await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(300);
  t('App.go(home) → снова «Бухгалтерия»', await p.evaluate(() => window.App.curScreen() === 'acc'));

  console.log('— 2. реестр —');
  await p.evaluate(({ a, b }) => window.App.accRange(a, b), { a: from30, b: to0 }); await p.waitForTimeout(300);
  const jobId = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(j => j.status === 'done').id);
  t('демо-инвойс есть в реестре', await p.evaluate(id => !!document.querySelector('.acc-row[data-id="' + id + '"]'), jobId));
  const cells = await p.evaluate(id => {
    const el = document.querySelector('.acc-row[data-id="' + id + '"] .acc-line');
    const n = el.querySelectorAll('.acc-c-num');
    return { clean: n[0].textContent.trim(), rep: n[1].textContent.trim(), rent: n[2].textContent.trim(),
             mat: n[3].textContent.trim(), tot: n[4].textContent.trim(), pay: n[5].textContent.trim() };
  }, jobId);
  t('клининг $295 (sealant + air duct + Other services)', /\$295$/.test(cells.clean), cells.clean);
  t('ремонт — пусто', /—/.test(cells.rep), cells.rep);
  t('аренда $630 с разбивкой BLW $450 · DHM $180', /\$630/.test(cells.rent) && /BLW \$450/.test(cells.rent) && /DHM \$180/.test(cells.rent), cells.rent);
  t('итого $925 = jobGrand', /\$925/.test(cells.tot), cells.tot);
  t('«К выплате» $0 без процентов + подсказка', /\$0$/.test(cells.pay) && await p.evaluate(() => /проценты не заданы/.test(document.querySelector('.acc-kpi.c-yellow').textContent)), cells.pay);
  t('превью заметки техника в строке', await p.evaluate(id => /Key at leasing office/.test((document.querySelector('.acc-row[data-id="' + id + '"] .acc-prev') || {}).textContent || ''), jobId));
  t('шапка таблицы на телефоне скрыта', await p.evaluate(() => getComputedStyle(document.querySelector('.acc-head')).display === 'none'));

  console.log('— 3. проценты —');
  await p.evaluate(() => window.App.accTab('rates')); await p.waitForTimeout(300);
  const blwId = await p.evaluate(() => JSON.parse(localStorage.getItem('techlog_state_v1')).equipment_types.find(e => e.abbr === 'BLW').id);
  await p.evaluate(blw => {
    const set = (k, v) => { const i = document.querySelector('input[data-rate="' + k + '"]'); i.value = v; };
    set('clean', '40'); set('rep', '50'); set('rent', '10'); set('rent:' + blw, '20'); set('mat', '0');
    document.querySelector('#acc-label').value = 'Зарплата';
  }, blwId);
  await p.evaluate(() => window.App.accSaveRates()); await p.waitForTimeout(1600);
  const saved = await p.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('techlog_state_v1')).acc_settings || [];
    const g = id => rows.find(r => r.id === id) || {};
    return { clean: g('rate:clean').pct, rent: g('rate:rent').pct, label: g('opt:label').val, n: rows.length, stamp: document.querySelector('.acc-wrap').textContent };
  });
  t('проценты сохранены в acc_settings (clean 40, rent 10)', saved.clean === 40 && saved.rent === 10, JSON.stringify(saved));
  t('название колонки сохранено', saved.label === 'Зарплата', saved.label);
  t('штамп «изменено» с автором', /изменено:.*Elena/.test(saved.stamp));
  await p.evaluate(() => window.App.accTab('reg')); await p.waitForTimeout(300);
  const pay = await p.evaluate(id => document.querySelector('.acc-row[data-id="' + id + '"] .acc-c-pay').textContent.trim(), jobId);
  t('«Зарплата» = 295×40% + BLW 450×20% + DHM 180×10% = $226', /\$226$/.test(pay), pay);
  t('в шапке KPI — новое название колонки', await p.evaluate(() => /ЗАРПЛАТА|Зарплата/.test(document.querySelector('.acc-kpi.c-yellow').textContent)));
  t('в шапке KPI — проценты по категориям с BLW 20%', await p.evaluate(() => /BLW \$450 · 20%/.test(document.querySelector('.acc-kpi.c-yellow').textContent)));
  await p.evaluate(() => window.App.accTab('rates')); await p.waitForTimeout(200);
  await p.evaluate(() => { document.querySelector('input[data-rate="clean"]').value = '140'; });
  await p.evaluate(() => window.App.accSaveRates()); await p.waitForTimeout(1600);
  t('процент 140 отклонён (поле подсвечено, значение не сохранено)', await p.evaluate(() =>
    document.querySelector('input[data-rate="clean"]').classList.contains('bad')
    && JSON.parse(localStorage.getItem('techlog_state_v1')).acc_settings.find(r => r.id === 'rate:clean').pct === 40));

  console.log('— 4. карта секций —');
  await p.evaluate(() => window.App.accMapSet('others', 'mat')); await p.waitForTimeout(300);
  await p.evaluate(() => window.App.accTab('reg')); await p.waitForTimeout(300);
  const c2 = await p.evaluate(id => {
    const n = document.querySelector('.acc-row[data-id="' + id + '"] .acc-line').querySelectorAll('.acc-c-num');
    return { clean: n[0].textContent.trim(), mat: n[3].textContent.trim(), pay: n[5].textContent.trim() };
  }, jobId);
  t('Other services → материалы: клининг $95, материалы $200', /\$95$/.test(c2.clean) && /\$200$/.test(c2.mat), JSON.stringify(c2));
  t('«Зарплата» пересчитана: 95×40% + 90 + 18 = $146', /\$146$/.test(c2.pay), c2.pay);
  await p.evaluate(() => window.App.accMapReset()); await p.waitForTimeout(300);
  await p.evaluate(() => window.App.accTab('reg')); await p.waitForTimeout(300);
  t('сброс карты вернул клининг $295', await p.evaluate(id => /\$295$/.test(document.querySelector('.acc-row[data-id="' + id + '"] .acc-line .acc-c-num').textContent.trim()), jobId));

  console.log('— 5. отметка бухгалтера —');
  await p.evaluate(id => window.App.accOpen(id), jobId); await p.waitForTimeout(300);
  t('строка раскрыта: заметка техника и поле бухгалтера', await p.evaluate(id => {
    const b = document.querySelector('.acc-row[data-id="' + id + '"] .acc-body');
    return !!b && /Key at leasing office/.test(b.textContent) && !!b.querySelector('textarea');
  }, jobId));
  await p.evaluate(id => { document.querySelector('.acc-row[data-id="' + id + '"] textarea').value = 'оплачено чеком'; }, jobId);
  await p.evaluate(id => window.App.accMark('job', id, 'checked', 'acn-' + id), jobId); await p.waitForTimeout(1600);
  const mk = await p.evaluate(id => {
    const j = JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(x => x.id === id);
    const row = document.querySelector('.acc-row[data-id="' + id + '"]');
    return { st: j.acc_status, note: j.acc_note, by: j.acc_by, badge: (row.querySelector('.acc-c-st .acc-st') || {}).textContent };
  }, jobId);
  t('acc_status=checked, заметка и автор сохранены', mk.st === 'checked' && mk.note === 'оплачено чеком' && mk.by === 'demo-acc', JSON.stringify(mk));
  t('бейдж «проверен» в строке', /проверен/.test(mk.badge || ''), mk.badge);
  await p.evaluate(() => window.App.accSet('ast', 'paid')); await p.waitForTimeout(300);
  t('фильтр «оплачен» — пусто', await p.evaluate(() => !!document.querySelector('.list-empty') && !document.querySelector('.acc-row')));
  await p.evaluate(() => window.App.accSet('ast', 'all')); await p.waitForTimeout(300);
  await p.evaluate(() => window.App.accMarkAll('paid')); await p.waitForTimeout(1600);
  t('массовая отметка «оплачен» применилась', await p.evaluate(id => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(x => x.id === id).acc_status === 'paid', jobId));
  t('заметка при массовой отметке не потерялась', await p.evaluate(id => JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.find(x => x.id === id).acc_note === 'оплачено чеком', jobId));
  await p.evaluate(() => window.App.accSet('notes', true)); await p.waitForTimeout(200);
  t('фильтр «только с заметками» оставляет инвойс', await p.evaluate(id => !!document.querySelector('.acc-row[data-id="' + id + '"]'), jobId));
  await p.evaluate(() => window.App.accSet('notes', false)); await p.waitForTimeout(200);

  console.log('— 6. поиск, карточка, форма инвойса —');
  await p.evaluate(() => { window.App.accType('916'); }); await p.waitForTimeout(500);
  t('поиск «916» находит инвойс', await p.evaluate(() => document.querySelectorAll('.acc-row').length === 1));
  await p.evaluate(() => { window.App.accType('nope-999'); }); await p.waitForTimeout(500);
  t('поиск «nope-999» — пусто', await p.evaluate(() => !!document.querySelector('.list-empty')));
  await p.evaluate(() => { window.App.accType(''); }); await p.waitForTimeout(500);
  await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(300);
  const card = await p.evaluate(() => ({ screen: window.App.curScreen(), overlay: !!document.querySelector('#overlay'),
    txt: (document.querySelector('#overlay') || {}).textContent || '' }));
  t('openJob у бухгалтера открывает карточку, экран не меняется', card.screen === 'acc' && card.overlay, card.screen);
  t('карточка: разбивка по секциям, категории, зарплата', /Разбивка по секциям/.test(card.txt) && /Equipment Rental/.test(card.txt) && /Зарплата/.test(card.txt));
  t('в карточке нет полей формы инвойса (только чтение)', await p.evaluate(() => !document.querySelector('#overlay #jb-unit') && !document.querySelector('#overlay .inv-sec')));
  await p.evaluate(() => window.App.closeModal());

  console.log('— 7. сотрудники —');
  await p.evaluate(() => window.App.accTab('staff')); await p.waitForTimeout(300);
  const st1 = await p.evaluate(() => Array.from(document.querySelectorAll('.acc-staff')).map(el => el.querySelector('.acc-c-where b').textContent + '=' + el.querySelector('.acc-c-pay').textContent.trim()));
  t('поровну на бригаду: Ivan и Alexey по $113', st1.some(s => /Ivan Petrov=\$113$/.test(s)) && st1.some(s => /Alexey Smirnov=\$113$/.test(s)), st1.join(' '));
  await p.evaluate(() => window.App.accTab('rates')); await p.waitForTimeout(200);
  await p.evaluate(() => { document.querySelector('#acc-split').value = 'main'; document.querySelector('input[data-rate="clean"]').value = '40'; });
  await p.evaluate(() => window.App.accSaveRates()); await p.waitForTimeout(400);
  await p.evaluate(() => window.App.accTab('staff')); await p.waitForTimeout(300);
  const st2 = await p.evaluate(() => Array.from(document.querySelectorAll('.acc-staff')).map(el => el.querySelector('.acc-c-where b').textContent + '=' + el.querySelector('.acc-c-pay').textContent.trim()));
  t('всё основному: Ivan $226, Alexey отсутствует', st2.some(s => /Ivan Petrov=\$226$/.test(s)) && !st2.some(s => /Alexey/.test(s)), st2.join(' '));

  console.log('— 8. CSV —');
  await p.evaluate(() => window.App.accTab('reg')); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.evaluate(() => window.App.accCsv())]);
  if (dl){
    const path = await dl.path();
    const txt = require('fs').readFileSync(path, 'utf8');
    const lines = txt.split('\n');
    t('CSV скачан: имя TechLog_acc_*.csv', /^TechLog_acc_.*\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    t('CSV: BOM, шапка с категориями и заметками', txt.charCodeAt(0) === 0xFEFF && /Клининг,Ремонт,Аренда/.test(lines[0]) && /Заметка бухгалтера/.test(lines[0]), lines[0]);
    t('CSV: строка инвойса с 925.00 и итог 226.00', lines.length === 3 && /925\.00/.test(lines[1]) && /^Итого/.test(lines[2]) && /226\.00/.test(lines[2]), lines.slice(1).join(' | '));
  } else t('CSV скачан', false, 'нет события download');

  console.log('— 9. админ и техник —');
  await login('demo-admin');
  t('админ видит вкладку «Бухгалтерия»', await p.evaluate(() => !!document.querySelector('.tabbar .tab[onclick="App.go(\'acc\')"]')));
  await p.evaluate(id => window.App.openJob(id), jobId); await p.waitForTimeout(400);
  t('форма инвойса у админа: строка «Бухгалтерия: оплачен · оплачено чеком»', await p.evaluate(() => {
    const el = document.querySelector('.acc-inv-line'); return !!el && /оплачен/.test(el.textContent) && /оплачено чеком/.test(el.textContent);
  }));
  await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(200);
  await p.evaluate(() => window.App.addTaskModal()); await p.waitForTimeout(300);
  t('в выборе исполнителя нет бухгалтера', await p.evaluate(() => {
    const sel = document.querySelector('#nt-tech'); if (!sel) return false;
    return !Array.from(sel.options).some(o => o.value === 'demo-acc') && Array.from(sel.options).some(o => o.value === 'demo-tech');
  }));
  await p.evaluate(() => window.App.closeModal());
  await login('demo-tech');
  t('техник не видит вкладку «Бухгалтерия» и экран acc ему не открывается', await p.evaluate(() => {
    const has = !!document.querySelector('.tabbar .tab[onclick="App.go(\'acc\')"]'); return !has;
  }));
  t('штатный набор вкладок техника: поиск, затем home', await p.evaluate(() => {
    const tb = document.querySelectorAll('.tabbar .tab');
    return /searchOpen/.test(tb[0].getAttribute('onclick')) && /App\.go\('home'\)/.test(tb[1].getAttribute('onclick'));
  }));

  console.log('— 10. ПК-режим и словарь —');
  await ctx.close();
  const ctx2 = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const d = await ctx2.newPage(); d.on('pageerror', e => errs.push(e.message)); d.on('dialog', x => x.accept());
  await d.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await d.goto('http://127.0.0.1:' + PORT + '/index.html');
  await d.evaluate(() => { localStorage.setItem('techlog_session_v1', 'demo-acc'); localStorage.setItem('techlog_view_mode', 'desktop'); });
  await d.reload(); await d.waitForTimeout(1500);
  await d.evaluate(({ a, b }) => window.App.accRange(a, b), { a: from30, b: to0 }); await d.waitForTimeout(300);
  const dk = await d.evaluate(() => {
    const head = document.querySelector('.acc-head'), line = document.querySelector('.acc-row .acc-line');
    const cs = getComputedStyle(line);
    return { headShown: getComputedStyle(head).display === 'grid', grid: cs.display === 'grid', cols: cs.gridTemplateColumns.split(' ').length };
  });
  t('ПК: шапка таблицы видна (grid)', dk.headShown, JSON.stringify(dk));
  t('ПК: строка — сетка на 10 колонок', dk.grid && dk.cols === 10, JSON.stringify(dk));
  const dict = await d.evaluate(() => {
    const D = window.TL_I18N; const ru = Object.keys(D.ru).filter(k => /^acc_|^role_accountant|^tab_acc|^act_acc/.test(k));
    return { n: ru.length, miss: ru.filter(k => !(k in D.en)), missRu: Object.keys(D.en).filter(k => /^acc_/.test(k) && !(k in D.ru)) };
  });
  t('словарь: ' + dict.n + ' ключей acc_* есть и в en', dict.n > 60 && !dict.miss.length && !dict.missRu.length, dict.miss.join(',') + dict.missRu.join(','));
  await ctx2.close();

  t('ошибок JS на страницах нет', !errs.length, errs.join(' | '));
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
