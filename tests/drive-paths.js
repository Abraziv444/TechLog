/* TechLog · tests/drive-paths.js — корень и конечная папка на Диске (v1.08.25)
   Карточка «Куда сохраняются файлы» рисуется по ответу media-health, поэтому
   в тесте ответ подкладывается руками: сначала новый формат (корень + схема
   токенами), потом старый (одна строка). Проверяем, что месяц не выдаётся за
   корень, что у съёмки своя раскладка и что подписи переводятся.
   Запуск: node tests/drive-paths.js [порт]   (сервер поднят отдельно) */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || '8811';
const ok = [], bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name);
  console.log((cond ? '  [ok] ' : '  [ ! ] ') + name + (extra ? ' → ' + extra : ''));
}
const NEW = {
  root: { id: 'ROOT1', name: 'TechLog Archive', path: 'TechLog Archive' },
  photo: { id: 'P1', name: 'Photos', ym: '2026_09', scheme: ['cp', 'cx', 'unit'],
           root: { id: 'P1', name: 'Photos', own: false, in: 'TechLog Archive' },
           path: 'TechLog Archive / Photos / <контрагент> / <комплекс> / <юнит>' },
  file:  { id: 'F1', name: 'Files', ym: '2026_09', scheme: ['tech', 'ym', 'doc'],
           root: { id: 'F1', name: 'Files', own: false, in: 'TechLog Archive' },
           path: 'TechLog Archive / Files / <сотрудник> / 2026_09 / <документ>' },
  invoice: { id: 'I1', name: 'Bookkeeping 2026', ym: '2026_09', scheme: ['ym'],
           root: { id: 'I1', name: 'Bookkeeping 2026', own: true, in: '' },
           path: 'Bookkeeping 2026 / 2026_09' },
};
const OLD = {
  root: { id: 'ROOT1', name: 'TechLog Archive', path: 'TechLog Archive' },
  photo: { id: 'P9', name: '2026-09', path: 'TechLog Archive / Photos / 2026-09' },
  file:  { id: 'F9', name: '2026-09', path: 'TechLog Archive / Files / 2026-09' },
  invoice: { id: 'I9', name: '2026-09', path: 'TechLog Archive / Invoices / 2026-09' },
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.PW_CHROME
    || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 850 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  for (const u of ['**://cdn.jsdelivr.net/**', '**://cdnjs.cloudflare.com/**',
                   '**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**'])
    await p.route(u, r => r.abort());
  await p.goto('http://127.0.0.1:' + PORT + '/index.html');
  await p.waitForTimeout(700);
  await p.evaluate(() => localStorage.setItem('techlog_session_v1', 'demo-admin'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1100);

  const draw = (folders, lang) => p.evaluate(([f, l]) => {
    gdFolders = f; if (l) state.lang = l;
    const box = document.createElement('div');
    box.id = 'gd-test'; box.innerHTML = gdFoldersHtml();
    const old = document.getElementById('gd-test'); if (old) old.remove();
    document.getElementById('app').appendChild(box);
    return box.innerHTML;
  }, [folders, lang]);

  // ------------------------------------------------ новый ответ функции
  console.log('\n== новый media-health ==');
  await draw(NEW, 'ru');
  const rows = await p.locator('#gd-test .gd-fold').allTextContents();
  check('три строки: фото, вложения, инвойсы', rows.length === 3, String(rows.length));
  const photo = rows[0].replace(/\s+/g, ' ');
  check('корень съёмки — архив и Photos, а не месяц',
        /Корень: TechLog Archive \/ Photos/.test(photo), photo.slice(0, 80));
  check('в пути съёмки нет месяца', !/20\d\d[-_]\d\d/.test(photo), photo.slice(0, 110));
  check('съёмка раскладывается по контрагенту, комплексу и юниту',
        /контрагент/.test(photo) && /комплекс/.test(photo) && /юнит/.test(photo));
  check('подсказка про отсутствие месяца показана', /месяца в этом пути нет/.test(photo));
  const file = rows[1].replace(/\s+/g, ' ');
  check('вложения: сотрудник, месяц, документ',
        /сотрудник/.test(file) && /2026_09/.test(file) && /документ/.test(file), file.slice(0, 110));
  const inv = rows[2].replace(/\s+/g, ' ');
  check('своя папка админа показана без архива',
        /Корень: Bookkeeping 2026/.test(inv) && !/TechLog Archive/.test(inv), inv.slice(0, 80));
  check('у инвойсов без галочки только месяц', /Пишется в: 2026_09/.test(inv), inv.slice(0, 90));
  const hrefs = await p.locator('#gd-test .gd-fold a').evaluateAll(a => a.map(x => x.getAttribute('href')));
  check('ссылка ведёт на корень, а не на месяц',
        hrefs[0].endsWith('/P1') && hrefs[2].endsWith('/I1'), hrefs.join(' '));
  const htmlNew = await p.locator('#gd-test').innerHTML();
  check('предупреждения про старую функцию нет', !/Передеплойте функцию/.test(htmlNew));

  // ------------------------------------------------ английский интерфейс
  console.log('\n== английский интерфейс ==');
  await draw(NEW, 'en');
  const en = (await p.locator('#gd-test .gd-fold').first().textContent()).replace(/\s+/g, ' ');
  check('подписи переведены', /Root:/.test(en) && /Writes into:/.test(en), en.slice(0, 70));
  check('токены схемы переведены', /counterparty/.test(en) && /complex/.test(en) && /unit/.test(en));

  // ------------------------------------------------ старый ответ функции
  console.log('\n== старая media-health ==');
  await draw(OLD, 'ru');
  const oldPhoto = (await p.locator('#gd-test .gd-fold').first().textContent()).replace(/\s+/g, ' ');
  check('старый путь тоже разбирается на корень и конец',
        /Корень: TechLog Archive \/ Photos/.test(oldPhoto) && /Пишется в: 2026-09/.test(oldPhoto),
        oldPhoto.slice(0, 90));
  check('предложено передеплоить функцию',
        /Передеплойте функцию/.test(await p.locator('#gd-test').innerHTML()));

  console.log('\n== ошибки страницы ==');
  console.log(errs.length ? errs.slice(0, 5).join('\n') : '  нет');
  console.log('\nИТОГО: ok=' + ok.length + ' проблем=' + bad.length);
  if (bad.length) console.log('ПРОБЛЕМЫ:\n - ' + bad.join('\n - '));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
