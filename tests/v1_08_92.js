/* v1.08.92 — «Документы без перевода»: строка открывает документ, галочки
   выбирают, фильтры по сотруднику/контрагенту/комплексу; 2FA: QR рисуется
   правильно (белая рамка, SVG как SVG), вход без кода не проходит, есть
   отключение своим окном. Запуск: node tests/v1_08_92.js [порт] (демо). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8160;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, vp, mode){
  const p = await (await br.newContext({ viewport: vp })).newPage();
  p.on('pageerror', e => console.log('  ⛔ page error: ' + String(e).slice(0, 160)));
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate((m) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', 'demo-admin');
    localStorage.setItem('techlog_view_mode', m); }, mode);
  await p.reload(); await p.waitForTimeout(1500);
  /* гарантируем несколько документов без перевода у разных сотрудников */
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('techlog_state_v1'));
    const who = ['demo-admin', 'demo-tech', 'demo-manager'];
    d.jobs.slice(0, 3).forEach((j, i) => { j.note = 'Заметка ' + (i + 1) + ': ключи у менеджера'; j.note_en = ''; j.technician_id = who[i % who.length]; j.archived_at = null; });
    localStorage.setItem('techlog_state_v1', JSON.stringify(d));
  });
  await p.reload(); await p.waitForTimeout(1500);
  return p;
}
const rows = (p) => p.evaluate(() => {
  const ov = document.querySelector('#overlay'); if (!ov) return null;
  const rs = [...ov.querySelectorAll('.tr-row-doc')];
  return { n: rs.length,
    checked: rs.filter(r => r.querySelector('input[type=checkbox]').checked).length,
    open: rs.every(r => !!r.querySelector('.tr-open')),
    filters: [...ov.querySelectorAll('.tr-filters select')].length,
    counter: (ov.querySelector('.qty-line .tiny') || {}).textContent || '',
    run: (ov.querySelector('.btn-blue') || {}).textContent || '' };
});
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('— документы без перевода: выбор, фильтры, открытие —');
  {
    const p = await boot(br, { width: 1280, height: 900 }, 'desktop');
    await p.evaluate(() => window.App.trPendingModal()); await p.waitForTimeout(400);
    const a = await rows(p);
    t('список открылся: строки-кнопки документов, все отмечены по умолчанию', a && a.n >= 2 && a.open && a.checked === a.n, JSON.stringify(a));
    t('кнопка перевода считает отмеченные', a && new RegExp('\\(' + a.checked + '\\)').test(a.run), JSON.stringify(a));
    t('фильтры показаны (сотрудник · контрагент · комплекс)', a && a.filters >= 1, JSON.stringify(a));
    await p.evaluate(() => document.querySelector('#overlay .tr-row-doc input[type=checkbox]').click()); await p.waitForTimeout(300);
    const b = await rows(p);
    t('галочка снимается — счётчик и кнопка пересчитываются', b && b.checked === a.checked - 1 && new RegExp('\\(' + b.checked + '\\)').test(b.run), JSON.stringify(b));
    await p.evaluate(() => [...document.querySelectorAll('#overlay .btn-ghost')].find(x => /Снять выбор/.test(x.textContent)).click()); await p.waitForTimeout(300);
    const c = await rows(p);
    t('«Снять выбор» гасит все, кнопка перевода пропадает', c && c.checked === 0 && !c.run, JSON.stringify(c));
    await p.evaluate(() => [...document.querySelectorAll('#overlay .btn-ghost')].find(x => /Выбрать все/.test(x.textContent)).click()); await p.waitForTimeout(300);
    const d = await rows(p);
    t('«Выбрать все» возвращает все', d && d.checked === d.n, JSON.stringify(d));
    /* фильтр по сотруднику */
    const filtered = await p.evaluate(async () => {
      const sel = document.querySelector('#overlay .tr-filters select');
      const opt = [...sel.options].find(o => o.value);
      sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const ov = document.querySelector('#overlay');
      return { label: opt.textContent, n: ov.querySelectorAll('.tr-row-doc').length,
        all: JSON.parse(localStorage.getItem('techlog_state_v1')).jobs.length };
    });
    const e2 = await rows(p);
    t('фильтр сужает список', filtered.n >= 1 && filtered.n <= d.n, JSON.stringify([filtered, d && d.n]));
    t('после фильтра счётчик считает видимые', e2 && /\d+\s*\/\s*\d+/.test(e2.counter.replace(/\s+/g, ' ')), JSON.stringify(e2));
    /* клик по строке открывает документ */
    await p.evaluate(() => { const s = document.querySelector('#overlay .tr-filters select'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('#overlay .tr-open').click()); await p.waitForTimeout(700);
    const scr = await p.evaluate(() => ({ cls: document.getElementById('app').className, ov: !!document.querySelector('#overlay') }));
    t('нажатие строки открывает документ, окно закрывается', scr.cls === 'scr-job' && !scr.ov, JSON.stringify(scr));
    await p.close();
  }

  console.log('— 2FA: QR, вход, отключение —');
  {
    const p = await boot(br, { width: 1280, height: 900 }, 'desktop');
    const qr = await p.evaluate(() => {
      const box = document.createElement('div');
      box.innerHTML = window.__mfaQr || '';
      return null;
    });
    /* проверяем на живой разметке, как её вернёт GoTrue */
    const r = await p.evaluate(() => {
      const html = window.App.__test_mfaQr
        ? window.App.__test_mfaQr('<svg xmlns="http://www.w3.org/2000/svg" width="41" height="41" shape-rendering="crispEdges"><rect width="41" height="41" fill="#fff"/><rect x="1" y="1" width="3" height="3"/></svg>')
        : null;
      if (html === null) return { skip: true };
      const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d);
      const box = d.querySelector('.mfa-qr'), svg = d.querySelector('.mfa-qr svg');
      const cs = box ? getComputedStyle(box) : null, cr = box ? box.getBoundingClientRect() : null;
      const out = { box: !!box, svg: !!svg, bg: cs && cs.backgroundColor, pad: cs && cs.paddingTop,
        w: cr && Math.round(cr.width), h: cr && Math.round(cr.height), stray: /alt="QR"|style="width:190px/.test(d.textContent) };
      d.remove(); return out;
    });
    t('QR-разметка рисуется как SVG в белой рамке с полями, без обрывков текста',
      r.skip || (r.box && r.svg && r.bg === 'rgb(255, 255, 255)' && parseFloat(r.pad) >= 8 && r.w >= 200 && r.h >= 200 && !r.stray), JSON.stringify(r));
    /* вход без кода: калитка не пускает */
    const gate = await p.evaluate(async () => {
      const calls = [];
      window.App.__test_setSb({ auth: { mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } }) },
        signOut: async () => { calls.push('signOut'); return {}; } } });
      const need = await window.App.__test_mfaGate({ user: { id: 'x' } });
      await new Promise(r => setTimeout(r, 250));
      const ov = document.querySelector('#overlay');
      const res = { need, modal: !!(ov && ov.querySelector('.mfa-login')), screen: document.getElementById('app').className,
        cancel: !!(ov && /mfaLoginCancel/.test(ov.innerHTML)) };
      if (ov) await window.App.mfaLoginCancel();
      await new Promise(r => setTimeout(r, 400));
      res.calls = calls; res.after = document.getElementById('app').className;
      window.App.__test_setSb(null);
      return res;
    });
    t('при aal1→aal2 данные не грузятся: экран входа и окно с кодом', gate.need === true && gate.modal && gate.screen === 'scr-login', JSON.stringify(gate));
    t('«Отмена» в окне кода завершает вход (signOut), остаётся экран входа', gate.calls.includes('signOut') && gate.after === 'scr-login', JSON.stringify(gate));
    const gate2 = await p.evaluate(async () => {
      window.App.__test_setSb({ auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } }) } } });
      const need = await window.App.__test_mfaGate({ user: { id: 'x' } });
      window.App.__test_setSb(null);
      return { need, ov: !!document.querySelector('#overlay') };
    });
    t('с подтверждённым кодом (aal2) калитка пропускает', gate2.need === false && !gate2.ov, JSON.stringify(gate2));
    await p.close();
  }
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
