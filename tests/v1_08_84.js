/* v1.08.84: одиночный PDF-инвойс — альбомный лист, лист-продолжение справа.
   Настоящий jsPDF в браузере: CDN-запрос подменяется локальным UMD-файлом
   (JSPDF_UMD=/path/jspdf.umd.min.js; по умолчанию /tmp/vmtest/node_modules/jspdf/dist/jspdf.umd.min.js —
   npm i jspdf@2.5.1 в /tmp/vmtest). Демо-режим, вход Ivan (админ), документ Unit 916:
   три строки Other services и длинная английская заметка через поля формы →
   App.pdfPreviewBlob() → проверяем MediaBox 792×612 (альбомный Letter) и наличие
   текста листа-продолжения; PDF пишется в /tmp/tl-v1_08_84.pdf для просмотра.
   Запуск: node tests/v1_08_84.js 8099 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const PORT = process.argv[2] || 8099;
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UMD = process.env.JSPDF_UMD || '/tmp/vmtest/node_modules/jspdf/dist/jspdf.umd.min.js';
const jspdfUmd = fs.existsSync(UMD) ? fs.readFileSync(UMD, 'utf8') : null;
let ok = 0, bad = 0;
const check = (name, cond, extra) => { if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  await p.route(/cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net|tile\.openstreetmap|nominatim/, r => {
    if (/jspdf/.test(r.request().url())){
      if (jspdfUmd) return r.fulfill({ status: 200, contentType: 'application/javascript', body: jspdfUmd });
      return r.continue();                       // нет локальной копии — пробуем сеть
    }
    return r.abort();
  });
  p.on('dialog', d => d.accept());
  p.on('pageerror', e => console.log('  ⛔ pageerror', e.message));
  await p.goto(`http://localhost:${PORT}/?nosw=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  if (await p.locator('.demo-user').count()){ await p.locator('.demo-user').first().click(); await p.waitForTimeout(1200); }   // Ivan, админ
  const hasPdf = await p.evaluate(() => !!window.jspdf);
  check('jsPDF загружен (локальный UMD или CDN)', hasPdf);
  if (!hasPdf){ await b.close(); console.log('\nИтого: ' + ok + ' / ' + bad); process.exit(1); }

  console.log('\n== короткий хвост: правая половина пустая ==');
  const id = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('techlog_state_v1') || '{}'); const js = (st.data || st).jobs || []; return (js.find(j => j.unit_number === '916') || {}).id; });
  check('демо-документ Unit 916 найден', !!id);
  await p.evaluate(id => App.openJob(id), id);
  await p.waitForTimeout(800);
  const pdfInfo = async () => p.evaluate(async () => {
    const blob = App.pdfPreviewBlob(); if (!blob) return null;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    const pages = (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
    return { size: buf.length, pages, landscape: /MediaBox\s*\[\s*0\s+0\s+792\.?\d*\s+612/.test(s), b64: btoa(s) };
  });
  const a = await pdfInfo();
  check('PDF собран', !!a, 'pdfPreviewBlob вернул null');
  check('лист альбомный Letter (MediaBox 792×612)', a && a.landscape);
  check('одна страница', a && a.pages === 1, a && ('страниц ' + a.pages));

  console.log('\n== длинный хвост: лист-продолжение ==');
  for (let i = 0; i < 3; i++){
    await p.fill(`[data-oth-d="${i}"]`, 'Other service line ' + (i + 1) + ' with a fairly long English description of the work done');
    await p.fill(`[data-oth-a="${i}"]`, String(10 * (i + 1)));
  }
  await p.fill('#jb-note', Array.from({ length: 45 }, (_, i) => 'note word ' + i).join(' '));
  await p.waitForTimeout(500);
  const c = await pdfInfo();
  check('PDF с хвостом собран', !!c);
  check('по-прежнему альбомный и одна страница', c && c.landscape && c.pages === 1, c && ('страниц ' + c.pages));
  check('PDF с листом заметно больше (текст продолжения есть)', a && c && c.size > a.size + 800, a && c && (a.size + ' → ' + c.size));
  if (c){ fs.writeFileSync('/tmp/tl-v1_08_84.pdf', Buffer.from(c.b64, 'base64')); console.log('  PDF: /tmp/tl-v1_08_84.pdf'); }
  /* строки листа: jsPDF пишет текст в потоках без сжатия по умолчанию — ищем подписи */
  const raw = c ? Buffer.from(c.b64, 'base64').toString('latin1') : '';
  check('в PDF есть «INVOICE ATTACHMENT» и «see attached sheet»', /INVOICE ATTACHMENT/.test(raw) && /see attached sheet/.test(raw));
  check('в PDF есть полные имена сотрудников', /Ivan Petrov/.test(raw));

  await b.close();
  console.log('\nИтого: пройдено ' + ok + ', провалено ' + bad);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔', e); process.exit(1); });
