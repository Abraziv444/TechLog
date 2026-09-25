/* v1.09.14 — режим чтения вслух в учебниках. Синтез речи подменён заглушкой (в песочнице голосов нет):
   проверяется кнопка и панель, сбор текста страницы, порядок чтения, переход на следующую страницу,
   пауза, скорость, выбор голоса.
   v1.09.55 — «не работает надиктовка»: модуль подключается ссылкой tools/audio-mode.js; без списка голосов чтение
   идёт системным голосом; движок молчит — повтор и понятная инструкция; «нет голоса» — только по ошибке движка;
   выбранный голос не завёлся — система выбирает сама; cancel() и speak() не подряд; внутри приложения панель чтения
   целиком над нижним меню (меню в два ряда, телефон).
   Запуск: node tests/book-audio.js [порт] [--dump]. */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8914, DUMP = process.argv.includes('--dump');
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 300) : '')); } }
/* заглушка речи: mode — 'ok' (говорит: onstart → onend), 'silent' (молчит), 'nolang' (ошибка language-unavailable),
   'badvoice' (с выбранным голосом — synthesis-failed, без голоса — говорит), 'busy' (сначала «занят») */
const STUB = (o) => {
  const log = []; window.__spoken = []; window.__slog = log;
  const V = o.voices ? [{ name: 'Тест RU', lang: 'ru-RU', voiceURI: 'ru1', localService: true }, { name: 'Test EN', lang: 'en-US', voiceURI: 'en1', localService: true }, { name: 'Cloud RU', lang: 'ru-RU', voiceURI: 'ru2', localService: false }] : [];
  const ss = { speaking: !!o.busy, pending: false, paused: false, getVoices: () => V,
    speak(u){ log.push({ op: 'speak', at: performance.now(), voice: u.voice ? u.voice.voiceURI : null, lang: u.lang }); window.__spoken.push(u.text);
      if (o.mode === 'silent') return;
      if (o.mode === 'nolang'){ setTimeout(() => u.onerror && u.onerror({ error: 'language-unavailable' }), 10); return; }
      if (o.mode === 'badvoice' && u.voice){ setTimeout(() => u.onerror && u.onerror({ error: 'synthesis-failed' }), 10); return; }
      ss.speaking = true;
      setTimeout(() => { u.onstart && u.onstart({}); setTimeout(() => { ss.speaking = false; if (!ss._c) u.onend && u.onend({}); ss._c = false; }, 10); }, 5); },
    cancel(){ log.push({ op: 'cancel', at: performance.now() }); ss.speaking = false; }, addEventListener(){ }, pause(){ }, resume(){ } };
  Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true });
  window.SpeechSynthesisUtterance = function(text){ this.text = text; };
};
async function openBook(br, book, stubOpt){
  const ctx = await br.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => { bad++; console.log('  ⛔ ' + String(e).slice(0, 200)); });
  await p.addInitScript(STUB, stubOpt);
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/dictionary/books/${book}`, { waitUntil: 'load' }); await p.waitForTimeout(900);
  return { ctx, p };
}
const txt = (p) => p.evaluate(() => document.getElementById('aud-say').textContent + ' || ' + document.getElementById('aud-hint').textContent);
(async () => {
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  for (const book of ['section-5-ru.html', 'section-1-en.html']){
    console.log('— ' + book + ' —');
    const { ctx, p } = await openBook(br, book, { voices: true, mode: 'ok' });
    t('модуль подключён ссылкой tools/audio-mode.js (не копией в книге), в шапке кнопка «Читать вслух», панель скрыта', await p.evaluate(() =>
      !!document.querySelector('script[src="tools/audio-mode.js"]') && !!document.getElementById('baud') && getComputedStyle(document.getElementById('aud')).display === 'none' && window.__tlAudioOn === true));
    const info = await p.evaluate(() => { const A = window.__tlAudio, D = JSON.parse(document.getElementById('bk').textContent); const n = D.p.length; let withText = 0, total = 0, longest = 0, sample = null;
      for (let i = 0; i < n; i++){ const s = A.pageText(i); if (s.length) withText++; total += s.length; s.forEach(x => { longest = Math.max(longest, x.length); }); if (!sample && s.length > 8) sample = { i, s: s.slice(0, 5) }; }
      return { n, withText, total, longest, sample }; });
    if (DUMP) console.log(JSON.stringify(info.sample, null, 1));
    t('текст собран почти со всех страниц, фразы не длиннее 200 знаков (Chrome не обрывает)', info.withText >= info.n * 0.85 && info.total > info.n * 5 && info.longest <= 200, info);
    await p.click('#baud'); await p.waitForTimeout(200);
    t('панель чтения открыта: кнопка чтения, скорость, выбор голоса (сначала голос устройства), строка состояния', await p.evaluate(() => { const a = document.getElementById('aud'); const sel = document.getElementById('aud-voice');
      return a.classList.contains('on') && /×1\.0/.test(document.getElementById('aud-rate').textContent) && (sel.options.length === 0 || !/☁/.test(sel.options[0].textContent))
        && /(голосов в системе|voices on the system): 3/.test(document.getElementById('aud-hint').textContent); }));
    t('панель — два ряда: «назад · Читать · вперёд · ✕» и «− скорость + · голос»', await p.evaluate(() => {
      const r1 = document.querySelector('#aud .row.r1'), r2 = document.querySelector('#aud .row.r2');
      return !!r1 && !!r2 && r1.querySelectorAll('[data-a]').length === 4 && !!r2.querySelector('#aud-voice') && document.getElementById('aud').getBoundingClientRect().height < 190; }));
    await p.evaluate(() => { const i = document.getElementById('pgin'); i.value = '3'; i.onchange.call(i); }); await p.waitForTimeout(300);
    const start = await p.evaluate(() => document.getElementById('pgin').value);
    await p.click('#aud-play'); await p.waitForTimeout(2500);
    const run = await p.evaluate(() => ({ spoken: window.__spoken.length, first: window.__spoken[0], page: document.getElementById('pgin').value, playing: window.__tlAudio.state.playing, say: document.getElementById('aud-say').textContent.length }));
    t('чтение идёт по фразам и само перелистывает страницу', run.spoken > 10 && run.page !== start && run.say > 0, { start, ...run, first: String(run.first).slice(0, 60) });
    await p.click('#aud-play'); await p.waitForTimeout(200); const n1 = await p.evaluate(() => window.__spoken.length); await p.waitForTimeout(500);
    t('«Пауза» останавливает чтение', await p.evaluate(n => window.__spoken.length <= n + 1 && !window.__tlAudio.state.playing, n1));
    await p.click('#aud [data-a="fast"]'); await p.click('#aud [data-a="fast"]');
    t('скорость меняется и запоминается', await p.evaluate(() => /×1\.2/.test(document.getElementById('aud-rate').textContent) && localStorage.getItem('tl_book_rate') === '1.2'));
    await p.click('#aud [data-a="close"]');
    t('крестик закрывает панель', await p.evaluate(() => !document.getElementById('aud').classList.contains('on')));
    await ctx.close();
  }
  { console.log('— список голосов пуст (Android присылает его с опозданием) —');
    const { ctx, p } = await openBook(br, 'section-5-ru.html', { voices: false, mode: 'ok' });
    await p.click('#baud'); await p.click('#aud-play'); await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({ n: window.__spoken.length, lang: (window.__slog.find(x => x.op === 'speak') || {}).lang, voice: (window.__slog.find(x => x.op === 'speak') || {}).voice }));
    t('чтение всё равно идёт: голос выбирает система (lang ru-RU), «нет голоса» не пишется', r.n > 3 && r.lang === 'ru-RU' && r.voice === null
      && !/нет голоса/i.test(await txt(p)) && /системный голос \(ru-RU\)/.test(await txt(p)), { ...r, t: await txt(p) });
    await ctx.close(); }
  { console.log('— движок речи молчит —');
    const { ctx, p } = await openBook(br, 'section-5-ru.html', { voices: true, mode: 'silent' });
    await p.click('#baud'); await p.click('#aud-play'); await p.waitForTimeout(6500);
    const r = await p.evaluate(() => ({ n: window.__spoken.length, playing: window.__tlAudio.state.playing }));
    t('одна повторная попытка, потом понятная инструкция (Синтез речи, «Прослушать пример»), чтение остановлено', r.n === 2 && !r.playing && /Синтез речи не отвечает[\s\S]*Прослушать пример/.test(await txt(p)), { ...r, t: await txt(p) });
    await ctx.close(); }
  { console.log('— нет голоса для языка (ошибка движка) —');
    const { ctx, p } = await openBook(br, 'section-5-ru.html', { voices: true, mode: 'nolang' });
    await p.click('#baud'); await p.click('#aud-play'); await p.waitForTimeout(400);
    t('понятное сообщение, как установить голос', /Синтез речи \(Text-to-speech\)/.test(await txt(p)) && await p.evaluate(() => !window.__tlAudio.state.playing), await txt(p));
    await ctx.close(); }
  { console.log('— выбранный голос не заводится —');
    const { ctx, p } = await openBook(br, 'section-5-ru.html', { voices: true, mode: 'badvoice' });
    await p.click('#baud'); await p.click('#aud-play'); await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({ log: window.__slog.filter(x => x.op === 'speak').slice(0, 3).map(x => x.voice), n: window.__spoken.length, playing: window.__tlAudio.state.playing }));
    t('первая фраза с выбранным голосом падает — повтор без голоса (выбирает система), чтение продолжается', r.log[0] === 'ru1' && r.log[1] === null && r.n > 3 && r.playing, r);
    await ctx.close(); }
  { console.log('— движок занят: cancel() и speak() не подряд —');
    const { ctx, p } = await openBook(br, 'section-5-ru.html', { voices: true, mode: 'ok', busy: true });
    await p.click('#baud'); await p.click('#aud-play'); await p.waitForTimeout(600);
    const r = await p.evaluate(() => { const L = window.__slog; const c = L.findIndex(x => x.op === 'cancel'), s = L.findIndex(x => x.op === 'speak'); return { c, s, gap: c >= 0 && s > c ? Math.round(L[s].at - L[c].at) : -1 }; });
    t('сначала cancel, speak — только после паузы (Chrome на Android глотает speak сразу после cancel)', r.c >= 0 && r.s > r.c && r.gap >= 100, r);
    await ctx.close(); }
  { console.log('— внутри приложения: телефон 393×780, меню в два ряда —');
    const ctx = await br.newContext({ viewport: { width: 393, height: 780 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
    const p = await ctx.newPage(); p.on('pageerror', e => { bad++; console.log('  ⛔ ' + String(e).slice(0, 200)); });
    await p.addInitScript(STUB, { voices: true, mode: 'ok' });
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(600);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'mobile'); localStorage.setItem('techlog_menu_rows', '2'); });
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('.tabbar'), null, { timeout: 20000 }); await p.waitForTimeout(600);
    await p.evaluate(() => window.App.go('study')); await p.waitForTimeout(500);
    await p.evaluate(() => window.App.studyRead('5')); await p.waitForTimeout(2500);
    const fr = p.frames().find(f => /section-5/.test(f.url()));
    t('учебник открыт в рамке, строка книги — одним рядом, большого заголовка «Учёба» нет', !!fr && await p.evaluate(() => { const h = document.querySelector('.st-read-h'), kids = [...h.children].filter(x => getComputedStyle(x).display !== 'none');
      const tops = kids.map(x => Math.round(x.getBoundingClientRect().top)); return Math.max(...tops) - Math.min(...tops) < 12 && !document.querySelector('#app > .section-title'); }));
    if (fr){
      await fr.click('#baud'); await p.waitForTimeout(300);
      const g = await p.evaluate(() => { const f = document.querySelector('.st-frame'), tb = document.querySelector('.tabbar'); const rf = f.getBoundingClientRect(), rt = tb.getBoundingClientRect();
        const a = f.contentDocument.getElementById('aud').getBoundingClientRect(); return { frameBottom: Math.round(rf.bottom), tabTop: Math.round(rt.top), audTop: Math.round(rf.top + a.top), audBottom: Math.round(rf.top + a.bottom) }; });
      t('рамка книги кончается над нижним меню — панель «Читать вслух» видна целиком', g.frameBottom <= g.tabTop && g.audBottom <= g.tabTop && g.audTop > 150, g);
      await fr.click('#aud-play'); await p.waitForTimeout(800);
      t('внутри приложения чтение идёт', await fr.evaluate(() => window.__spoken.length > 2 && window.__tlAudio.state.playing));
    }
    await ctx.close(); }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
