/* v1.09.14 — режим чтения вслух в учебниках. Синтез речи подменён заглушкой (в песочнице голосов нет):
   проверяется кнопка и панель, сбор текста страницы, порядок чтения, переход на следующую страницу,
   пауза, скорость, выбор голоса, сообщение «нет голоса». Запуск: node tests/book-audio.js [порт] [--dump]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8914, DUMP = process.argv.includes('--dump');
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 300) : '')); } }
const STUB = (withVoices) => {
  const spoken = []; window.__spoken = spoken;
  const ss = { _l: [], getVoices: () => withVoices ? [{ name: 'Тест RU', lang: 'ru-RU', voiceURI: 'ru1', localService: true }, { name: 'Test EN', lang: 'en-US', voiceURI: 'en1', localService: true }, { name: 'Cloud RU', lang: 'ru-RU', voiceURI: 'ru2', localService: false }] : [],
    speak(u){ spoken.push(u.text); setTimeout(() => { if (!ss._c) u.onend && u.onend({}); ss._c = false; }, 15); }, cancel(){ }, addEventListener(){ }, pause(){ }, resume(){ } };
  Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true });
  window.SpeechSynthesisUtterance = function(text){ this.text = text; };
};
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  for (const book of ['section-5-ru.html', 'section-1-en.html']){
    console.log('— ' + book + ' —');
    const ctx = await br.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
    const p = await ctx.newPage(); p.on('pageerror', e => { bad++; console.log('  ⛔ ' + String(e).slice(0, 200)); });
    await p.addInitScript(STUB, true);
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/dictionary/books/${book}`, { waitUntil: 'load' }); await p.waitForTimeout(900);
    t('в шапке книги есть кнопка «Читать вслух», панель скрыта', await p.evaluate(() => !!document.getElementById('baud') && getComputedStyle(document.getElementById('aud')).display === 'none'));
    const info = await p.evaluate(() => { const A = window.__tlAudio, D = JSON.parse(document.getElementById('bk').textContent); const n = D.p.length; let withText = 0, total = 0, longest = 0, sample = null;
      for (let i = 0; i < n; i++){ const s = A.pageText(i); if (s.length) withText++; total += s.length; s.forEach(x => { longest = Math.max(longest, x.length); }); if (!sample && s.length > 8) sample = { i, s: s.slice(0, 5) }; }
      return { n, withText, total, longest, sample }; });
    if (DUMP) console.log(JSON.stringify(info.sample, null, 1));
    t('текст собран почти со всех страниц, предложения не длиннее 240 знаков', info.withText >= info.n * 0.85 && info.total > info.n * 5 && info.longest <= 240, info);
    await p.click('#baud'); await p.waitForTimeout(200);
    t('панель чтения открыта: кнопка чтения, скорость, выбор голоса (сначала голос устройства)', await p.evaluate(() => { const a = document.getElementById('aud'); const sel = document.getElementById('aud-voice');
      return a.classList.contains('on') && /×1\.0/.test(document.getElementById('aud-rate').textContent) && (sel.options.length === 0 || !/☁/.test(sel.options[0].textContent)); }));
    await p.evaluate(() => { const i = document.getElementById('pgin'); i.value = '3'; i.onchange.call(i); }); await p.waitForTimeout(300);
    const start = await p.evaluate(() => document.getElementById('pgin').value);
    await p.click('#aud-play'); await p.waitForTimeout(2500);
    const run = await p.evaluate(() => ({ spoken: window.__spoken.length, first: window.__spoken[0], page: document.getElementById('pgin').value, playing: window.__tlAudio.state.playing, say: document.getElementById('aud-say').textContent.length }));
    t('чтение идёт по предложениям и само перелистывает страницу', run.spoken > 10 && run.page !== start && run.say > 0, { start, ...run, first: String(run.first).slice(0, 60) });
    await p.click('#aud-play'); await p.waitForTimeout(200); const n1 = await p.evaluate(() => window.__spoken.length); await p.waitForTimeout(500);
    t('«Пауза» останавливает чтение', await p.evaluate(n => window.__spoken.length <= n + 1 && !window.__tlAudio.state.playing, n1));
    await p.click('#aud [data-a="fast"]'); await p.click('#aud [data-a="fast"]');
    t('скорость меняется и запоминается', await p.evaluate(() => /×1\.2/.test(document.getElementById('aud-rate').textContent) && localStorage.getItem('tl_book_rate') === '1.2'));
    await p.click('#aud [data-a="close"]');
    t('крестик закрывает панель', await p.evaluate(() => !document.getElementById('aud').classList.contains('on')));
    await ctx.close();
  }
  { console.log('— нет голоса на устройстве —');
    const ctx = await br.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
    const p = await ctx.newPage(); await p.addInitScript(STUB, false);
    await p.goto(`http://127.0.0.1:${PORT}/dictionary/books/section-5-ru.html`, { waitUntil: 'load' }); await p.waitForTimeout(800);
    await p.click('#baud'); await p.click('#aud-play'); await p.waitForTimeout(300);
    t('понятное сообщение, как установить голос', await p.evaluate(() => /Синтез речи|Text-to-speech/.test(document.getElementById('aud-say').textContent + document.getElementById('aud-hint').textContent)));
    await ctx.close(); }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
