/* TechLog · учебник: РЕЖИМ ЧТЕНИЯ ВСЛУХ (v1.09.14; v1.09.55 — надёжный запуск и понятные сообщения).
   Автономный модуль: учебник подключает его ссылкой <script src="tools/audio-mode.js"> (tools/inject-audio.py),
   с просмотрщиком связан только через разметку (#bk, #tb, #pgin). Голос — системный синтез речи браузера
   (speechSynthesis): работает без сети, если на устройстве установлен голос нужного языка. Текст берётся из
   векторных страниц книги: строки собираются по координатам, колонки читаются по порядку, колонтитулы
   пропускаются. При любой ошибке модуль молча выключается — книга остаётся книгой.

   v1.09.55 — «не работает надиктовка»:
   · внутри приложения панель чтения стояла под нижним меню (исправлено в app.js — рамка книги кончается над меню),
     а сама панель занимала три ряда; теперь два плотных ряда и строка состояния;
   · Chrome на Android молча глотает speak(), вызванный сразу после cancel(), — теперь cancel только если движок
     занят, и пауза перед speak; ссылка на текущую фразу держится (иначе сборщик мусора съедает onend и чтение
     замирает после первой фразы);
   · список голосов на Android приходит с опозданием — чтение не ждёт его и не пишет «нет голоса», система
     выбирает голос сама; «нет голоса» — только по настоящей ошибке движка;
   · сторож: движок не начал говорить за ~2.5 с — одна повторная попытка, дальше понятная инструкция
     (Настройки телефона → Синтез речи); onend не пришёл, а речь кончилась — идём дальше сами;
   · вернулись в приложение после блокировки экрана — чтение продолжается с той же фразы;
   · строка состояния: сколько голосов в системе, какой выбран, говорит ли движок — видно, что происходит. */
(function(){
  'use strict';
  try{
    if (window.__tlAudioOn) return;                                   /* второй экземпляр (старый встроенный блок) не нужен */
    var bk = document.getElementById('bk'), tb = document.getElementById('tb'), pgin = document.getElementById('pgin');
    if (!bk || !tb || !pgin) return;
    window.__tlAudioOn = true;
    var D = JSON.parse(bk.textContent), P = D.p || [], M = D.meta || {}, N = P.length; if (!N) return;
    var RU = M.lang !== 'en', LANG = RU ? 'ru' : 'en', LTAG = RU ? 'ru-RU' : 'en-US';
    var HAS = ('speechSynthesis' in window) && !!window.SpeechSynthesisUtterance, SS = HAS ? window.speechSynthesis : null;
    var ANDROID = /android/i.test(navigator.userAgent || '');
    var T = RU ? { btn:'Читать вслух', play:'Читать', pause:'Пауза', prev:'Предыдущая страница', next:'Следующая страница', slower:'Медленнее', faster:'Быстрее',
                   close:'Закрыть режим чтения', voice:'Голос', empty:'На этой странице нет текста — перехожу дальше', end:'Книга дочитана',
                   novoice:'На устройстве нет голоса для русского языка. Установите: Настройки телефона → Специальные возможности → Синтез речи (Text-to-speech) → «Синтезатор речи Google» → язык: русский → скачать голос. После этого чтение работает и без сети.',
                   silent:'Синтез речи не отвечает. Проверьте: Настройки телефона → Специальные возможности → Синтез речи (Text-to-speech): движок — «Синтезатор речи Google», язык — русский, кнопка «Прослушать пример» должна звучать; громкость мультимедиа не на нуле. Потом нажмите «Читать» ещё раз.',
                   notallowed:'Браузер не дал начать речь без нажатия — нажмите «Читать» ещё раз.',
                   noapi:'Этот браузер не умеет читать вслух (нет синтеза речи). Откройте учебник в Chrome.',
                   engine:'Ошибка синтеза речи', auto:'системный голос', offline:'на устройстве — работает без сети', online:'сетевой — нужен интернет',
                   st_n:'голосов в системе', st_lang:'для языка', st_sel:'выбран', st_talk:'говорит', st_idle:'молчит', st_wait:'ждёт', page:'стр.' }
                 : { btn:'Read aloud', play:'Read', pause:'Pause', prev:'Previous page', next:'Next page', slower:'Slower', faster:'Faster',
                   close:'Close reading mode', voice:'Voice', empty:'No text on this page — moving on', end:'End of the book',
                   novoice:'No voice for English on the device. Install one: phone Settings → Accessibility → Text-to-speech → Google speech engine → language: English → download voice data. After that reading works offline too.',
                   silent:'Speech synthesis does not respond. Check: phone Settings → Accessibility → Text-to-speech: engine — Google, language — English, "Listen to an example" must play; media volume is not zero. Then press "Read" again.',
                   notallowed:'The browser did not allow speech without a tap — press "Read" again.',
                   noapi:'This browser cannot read aloud (no speech synthesis). Open the book in Chrome.',
                   engine:'Speech synthesis error', auto:'system voice', offline:'on-device — works offline', online:'network — needs internet',
                   st_n:'voices on the system', st_lang:'for the language', st_sel:'selected', st_talk:'speaking', st_idle:'silent', st_wait:'waiting', page:'p.' };
    var LS = { get:function(k,d){ try{ var v = localStorage.getItem(k); return v == null ? d : v; }catch(e){ return d; } }, set:function(k,v){ try{ localStorage.setItem(k, v); }catch(e){} } };
    function dec(s){ return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,function(_,n){ return String.fromCharCode(+n); }).replace(/&amp;/g,'&'); }

    /* ---- текст страницы: фрагменты <text x y font-size> → строки → колонки → предложения ---- */
    var MAXLEN = 200;                                                   /* короче — Chrome не обрывает длинную фразу через ~15 с */
    var cache = {};
    function pageText(i){
      if (cache[i]) return cache[i];
      var svg = String((P[i] && P[i].s) || ''), re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g, m, fr = [];
      while ((m = re.exec(svg))){
        var a = m[1], x = +((/\bx="([\d.\-]+)"/.exec(a) || [])[1]), y = +((/\by="([\d.\-]+)"/.exec(a) || [])[1]), fs = +((/font-size="([\d.]+)"/.exec(a) || [])[1]) || 10;
        var tx = dec(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ');
        if (!tx.trim() || isNaN(x) || isNaN(y)) continue;
        if (y < 58 || y > 742) continue;                                  /* колонтитулы и номер страницы */
        fr.push({ x:x, y:y, fs:fs, t:tx });
      }
      if (!fr.length) return (cache[i] = []);
      /* две колонки? — заметная доля фрагментов начинается правее середины, и по высоте колонки пересекаются */
      var L = fr.filter(function(f){ return f.x < 290; }), R = fr.filter(function(f){ return f.x >= 310; });
      var two = false;
      if (L.length > 8 && R.length > 8){
        var ly = L.map(function(f){ return f.y; }), ry = R.map(function(f){ return f.y; });
        var ov = Math.min(Math.max.apply(0, ly), Math.max.apply(0, ry)) - Math.max(Math.min.apply(0, ly), Math.min.apply(0, ry));
        var mid = fr.filter(function(f){ return f.x >= 290 && f.x < 310; }).length;
        two = ov > 200 && mid < fr.length * 0.05 && !fr.some(function(f){ return f.x < 250 && f.t.length > 70; });
      }
      function lines(arr){
        arr.sort(function(a, b){ return a.y - b.y || a.x - b.x; });
        var out = [], cur = null;
        arr.forEach(function(f){
          if (cur && Math.abs(f.y - cur.y) <= Math.max(2.5, cur.fs * 0.35)){ cur.parts.push(f); }
          else { cur = { y:f.y, fs:f.fs, parts:[f] }; out.push(cur); }
        });
        return out.map(function(l){ l.parts.sort(function(a, b){ return a.x - b.x; });
          return { y:l.y, fs:l.fs, t:l.parts.map(function(p){ return p.t.trim(); }).join(' ').replace(/\s+([,.;:!?)])/g, '$1') }; });
      }
      var ls = two ? lines(L.concat(fr.filter(function(f){ return f.x >= 290 && f.x < 310; }))).concat(lines(R)) : lines(fr);
      /* строки → абзацы: большой шаг по высоте, заголовок (кегль крупнее) или конец предложения с красной строки */
      var paras = [], buf = '', prev = null;
      ls.forEach(function(l){
        var gap = prev ? l.y - prev.y : 0, brk = !prev || gap < 0 || gap > prev.fs * 1.9 || Math.abs(l.fs - prev.fs) > 1.5;
        if (brk && buf){ paras.push(buf); buf = ''; }
        if (buf && /[-‐]$/.test(buf) && /^[a-zа-яё]/.test(l.t)) buf = buf.replace(/[-‐]$/, '') + l.t;     /* перенос слова */
        else buf = buf ? buf + ' ' + l.t : l.t;
        prev = l;
      });
      if (buf) paras.push(buf);
      var sent = [];
      paras.forEach(function(p){
        p = p.replace(/\.{4,}|…{2,}|(\s\.){3,}/g, ' ').replace(/\s+/g, ' ').trim(); if (!p) return;         /* отточия оглавления */
        splitSent(p).forEach(function(s0){
          s0 = s0.trim(); if (!s0) return;
          while (s0.length > MAXLEN){ var k = s0.lastIndexOf(' ', MAXLEN - 20); if (k < 80) k = MAXLEN - 20; sent.push(s0.slice(0, k)); s0 = s0.slice(k).trim(); }
          if (/[A-Za-zА-Яа-яЁё0-9]/.test(s0)) sent.push(s0);
        });
      });
      return (cache[i] = sent);
    }

    /* предложение кончается на . ! ? ; только если дальше пробел и заглавная буква, цифра или кавычка —
       адреса сайтов (www.site.com), сокращения внутри строки и десятичные дроби не рвутся */
    function splitSent(p){
      var out = [], from = 0, i, c, j;
      for (i = 0; i < p.length; i++){
        c = p.charAt(i);
        if (c !== '.' && c !== '!' && c !== '?' && c !== ';') continue;
        j = i + 1; while (j < p.length && /["»)\]]/.test(p.charAt(j))) j++;
        if (j >= p.length) break;
        if (p.charAt(j) !== ' ') continue;
        if (!/[A-ZА-ЯЁ0-9"«(\[•—-]/.test(p.charAt(j + 1) || '')) continue;
        if (c === '.' && /(^|\s)[A-Za-zА-Яа-яЁё]{1,2}$/.test(p.slice(from, i))) continue;      /* «т.», «г.», инициалы */
        out.push(p.slice(from, j)); from = j + 1; i = j;
      }
      if (from < p.length) out.push(p.slice(from));
      return out;
    }

    /* ---- голоса: чтение их не ждёт — пока списка нет, голос выбирает система по языку ---- */
    var voices = [], allN = 0;
    function loadVoices(){
      if (!SS) return;
      var all = []; try{ all = SS.getVoices() || []; }catch(e){ all = []; }
      allN = all.length;
      voices = all.filter(function(v){ return String(v.lang || '').toLowerCase().replace('_', '-').indexOf(LANG) === 0; })
        .sort(function(a, b){ return (b.localService ? 1 : 0) - (a.localService ? 1 : 0) || (b['default'] ? 1 : 0) - (a['default'] ? 1 : 0) || a.name.localeCompare(b.name); });   /* сначала те, что работают без сети */
      paintVoices();
    }
    function curVoice(){ if (st.sysVoice) return null; var want = LS.get('tl_book_voice_' + LANG, ''); return voices.filter(function(v){ return v.voiceURI === want; })[0] || voices[0] || null; }
    function voicesWait(ms){                                              /* Android присылает список с опозданием и не всегда шлёт voiceschanged */
      var until = Date.now() + ms;
      (function tick(){ loadVoices(); if (!voices.length && Date.now() < until) setTimeout(tick, 250); })();
    }

    /* ---- состояние и управление ---- */
    var st = { on:false, playing:false, page:0, idx:0, rate: Math.min(1.8, Math.max(0.6, parseFloat(LS.get('tl_book_rate', '1')) || 1)), token:0,
               u:null, started:false, t0:0, wd:0, ka:0, fails:0, errs:0, sysVoice:false, msg:'' };
    function curPageIdx(){ var v = String(pgin.value || '').trim(), k; for (k = 0; k < N; k++) if (P[k].l && String(P[k].l) === v) return k; var n = parseInt(v, 10); return n ? Math.max(0, Math.min(N - 1, n - 1)) : 0; }
    function goPage(i){ pgin.value = P[i].l || (i + 1); if (typeof pgin.onchange === 'function') pgin.onchange.call(pgin); else pgin.dispatchEvent(new Event('change')); }
    function timersOff(){ clearTimeout(st.wd); st.wd = 0; clearInterval(st.ka); st.ka = 0; }
    function stopSpeak(){ st.token++; timersOff(); st.u = null; st.started = false; try{ if (SS) SS.cancel(); }catch(e){} }
    function estMs(text){ return Math.max(2200, String(text).length / (13 * st.rate) * 1000); }
    function fail(kind){
      st.playing = false; timersOff(); st.u = null; try{ if (SS) SS.cancel(); }catch(e){}
      st.msg = kind === 'silent' ? T.silent : kind === 'noapi' ? T.noapi : /not-allowed/.test(kind) ? T.notallowed
             : /language-unavailable|voice-unavailable/.test(kind) ? T.novoice : T.engine + ' (' + kind + ')';
      say(st.msg); status(); paint();
    }
    function speakNext(){
      if (!st.on || !st.playing) return;
      var sents = pageText(st.page);
      if (st.idx >= sents.length){
        if (st.page >= N - 1){ st.playing = false; say(T.end); paint(); return; }
        st.page++; st.idx = 0; goPage(st.page);
        if (!pageText(st.page).length) say(T.empty);
        setTimeout(speakNext, 350); paint(); return;
      }
      var text = sents[st.idx], my = ++st.token, v = curVoice();
      var u = new SpeechSynthesisUtterance(text);
      if (v){ u.voice = v; u.lang = v.lang; } else u.lang = LTAG;
      u.rate = st.rate;
      st.u = u; st.started = false;                                   /* ссылка держит фразу: иначе Chrome теряет её onend */
      function done(){ if (my !== st.token) return; timersOff(); st.idx++; speakNext(); }
      u.onstart = function(){ if (my !== st.token) return; st.started = true; st.t0 = Date.now(); st.fails = 0; st.errs = 0; if (st.msg){ st.msg = ''; } status(); };
      u.onend = done;
      u.onerror = function(ev){
        if (my !== st.token) return;
        var er = String((ev && ev.error) || 'error');
        if (er === 'interrupted' || er === 'canceled') return;
        timersOff();
        if (er === 'synthesis-failed' && !st.sysVoice && v){ st.sysVoice = true; st.token++; setTimeout(speakNext, 150); return; }   /* выбранный голос не завёлся — пусть выберет система */
        if (/language-unavailable|voice-unavailable|synthesis-unavailable|not-allowed|audio-hardware|audio-busy/.test(er)){ fail(er); return; }
        if (++st.errs >= 3){ fail(er); return; }                          /* три фразы подряд с ошибкой — не проматываем книгу молча */
        st.idx++; setTimeout(speakNext, 150);
      };
      say(text); paint();
      function go(){
        if (my !== st.token) return;
        try{ if (SS.paused) SS.resume(); SS.speak(u); }catch(e){ fail(String((e && e.message) || e)); return; }
        /* сетевые голоса Chrome на ПК замолкают на длинной фразе — «пауза/продолжить» раз в 10 с держит их живыми */
        if (!ANDROID && v && !v.localService) st.ka = setInterval(function(){ try{ if (SS.speaking && !SS.paused){ SS.pause(); SS.resume(); } }catch(e){} }, 10000);
        st.wd = setTimeout(function wd(){
          if (my !== st.token) return;
          if (!st.started && !SS.speaking){                           /* движок молчит: одна повторная попытка, дальше — инструкция */
            if (st.fails++ < 1){ try{ SS.cancel(); }catch(e){} st.token++; setTimeout(speakNext, 300); return; }
            fail('silent'); return;
          }
          if (!st.started && SS.speaking){ st.started = true; st.t0 = Date.now(); }   /* говорит, но onstart не прислал */
          if (!SS.speaking && !SS.pending && Date.now() - st.t0 > estMs(text) * 0.5){ done(); return; }   /* кончил, а onend не пришёл */
          st.wd = setTimeout(wd, 700);
        }, 2500);
      }
      if (SS.speaking || SS.pending){ try{ SS.cancel(); }catch(e){} setTimeout(go, 160); } else go();
    }
    function play(){
      if (!HAS){ fail('noapi'); return; }
      if (!voices.length) loadVoices();
      st.msg = ''; st.page = curPageIdx(); if (st.playing) return;
      st.playing = true; st.fails = 0; st.errs = 0; speakNext();
    }
    function pause(){ st.playing = false; stopSpeak(); paint(); status(); }
    function jump(d){ var was = st.playing; stopSpeak(); st.page = Math.max(0, Math.min(N - 1, curPageIdx() + d)); st.idx = 0; goPage(st.page); say(''); if (was){ st.playing = true; setTimeout(speakNext, 300); } paint(); }
    function rate(d){ st.rate = Math.round(Math.min(1.8, Math.max(0.6, st.rate + d)) * 10) / 10; LS.set('tl_book_rate', String(st.rate)); if (st.playing){ stopSpeak(); speakNext(); } paint(); }

    /* ---- интерфейс: кнопка в шапке и панель внизу (два ряда + строка состояния) ---- */
    var css = document.createElement('style');
    css.textContent = '#aud{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--panel,#17232A);border-top:2px solid var(--line,#31434C);padding:7px 8px calc(7px + env(safe-area-inset-bottom,0px));display:none;color:var(--text,#e8eef1);font:14px/1.35 system-ui,sans-serif;box-shadow:0 -6px 16px rgba(0,0,0,.35)}'
      + '#aud.on{display:block}#aud .rows{display:flex;flex-direction:column;gap:6px}#aud .row{display:flex;align-items:center;gap:6px;min-width:0}'
      + '#aud .ab{min-width:40px;height:40px;border-radius:12px;border:2px solid var(--line,#31434C);background:transparent;color:inherit;font:inherit;font-weight:800;cursor:pointer;display:grid;place-items:center;padding:0 8px;flex:0 0 auto}'
      + '#aud .ab.go{background:var(--blue,#1CB0F6);border-color:var(--blue,#1CB0F6);color:#04222f;flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#aud .ab svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}'
      + '#aud .rt{min-width:40px;text-align:center;font-weight:800;flex:0 0 auto}#aud select{flex:1 1 120px;min-width:0;height:40px;border-radius:12px;border:2px solid var(--line,#31434C);background:var(--panel2,#1C2B33);color:inherit;font:inherit;padding:0 8px}'
      + '#aud .say{margin-top:6px;max-height:2.7em;overflow:hidden;opacity:.92;font-size:13px}#aud .say.warn{color:#FFC800;max-height:none}#aud .hint{font-size:11.5px;opacity:.72;margin-top:3px}'
      + '@media (min-width:640px){#aud .rows{flex-direction:row;align-items:center}#aud .row.r1{flex:1 1 auto}#aud .row.r2{flex:1 1 300px}}'
      + 'body.aud-on #doc,body.aud-on .doc{padding-bottom:170px}';
    document.head.appendChild(css);
    var btn = document.createElement('button'); btn.className = 'ib'; btn.id = 'baud'; btn.title = T.btn; btn.setAttribute('aria-label', T.btn);
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.6"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6"/></svg>';
    var anchor = document.getElementById('bfind'); if (anchor && anchor.parentNode === tb) tb.insertBefore(btn, anchor); else tb.appendChild(btn);
    var bar = document.createElement('div'); bar.id = 'aud'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', T.btn);
    bar.innerHTML = '<div class="rows"><div class="row r1"><button class="ab" data-a="prev" title="' + T.prev + '" aria-label="' + T.prev + '"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>'
      + '<button class="ab go" data-a="play" id="aud-play"></button>'
      + '<button class="ab" data-a="next" title="' + T.next + '" aria-label="' + T.next + '"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>'
      + '<button class="ab" data-a="close" title="' + T.close + '" aria-label="' + T.close + '"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
      + '<div class="row r2"><button class="ab" data-a="slow" title="' + T.slower + '" aria-label="' + T.slower + '">−</button><span class="rt" id="aud-rate"></span><button class="ab" data-a="fast" title="' + T.faster + '" aria-label="' + T.faster + '">+</button>'
      + '<select id="aud-voice" aria-label="' + T.voice + '"></select></div></div>'
      + '<div class="say" id="aud-say" aria-live="off"></div><div class="hint" id="aud-hint"></div>';
    document.body.appendChild(bar);
    function say(t){ var e = document.getElementById('aud-say'); if (!e) return; e.textContent = t || ''; e.classList.toggle('warn', !!t && t === st.msg); }
    /* строка состояния: что знает система о голосах и что сейчас делает движок */
    function status(){
      var h = document.getElementById('aud-hint'); if (!h) return;
      if (!HAS){ h.textContent = T.noapi; return; }
      var cv = curVoice(), talk = false; try{ talk = !!(SS.speaking || SS.pending); }catch(e){}
      h.textContent = T.voice + ': ' + (cv ? cv.name + ' — ' + (cv.localService ? T.offline : T.online) : T.auto + ' (' + LTAG + ')')
        + ' · ' + T.st_n + ': ' + allN + ', ' + T.st_lang + ': ' + voices.length
        + (st.playing ? ' · ' + (st.started || talk ? T.st_talk : T.st_wait) : '');
    }
    function paintVoices(){
      var sel = document.getElementById('aud-voice'); if (!sel) return;
      var cv = curVoice();
      sel.innerHTML = voices.map(function(v){ return '<option value="' + String(v.voiceURI).replace(/"/g, '&quot;') + '"' + (cv && cv.voiceURI === v.voiceURI ? ' selected' : '') + '>' + String(v.name).replace(/</g, '&lt;') + (v.localService ? '' : ' ☁') + '</option>'; }).join('');
      sel.style.display = voices.length > 1 ? '' : 'none';
      status();
    }
    function paint(){
      var pb = document.getElementById('aud-play'), r = document.getElementById('aud-rate');
      if (pb) pb.textContent = (st.playing ? T.pause : T.play) + ' · ' + T.page + ' ' + (P[st.playing ? st.page : curPageIdx()].l || (curPageIdx() + 1));
      if (r) r.textContent = '×' + st.rate.toFixed(1);
      btn.classList.toggle('on', st.on);
    }
    function open(on){ st.on = on; bar.classList.toggle('on', on); document.body.classList.toggle('aud-on', on); if (!on) pause(); else { voicesWait(3000); st.page = curPageIdx(); st.idx = 0; if (!HAS) fail('noapi'); } paint(); status(); }
    btn.addEventListener('click', function(){ open(!st.on); });
    bar.addEventListener('click', function(e){ var b = e.target.closest ? e.target.closest('[data-a]') : null; if (!b) return; var a = b.getAttribute('data-a');
      if (a === 'play'){ if (st.playing) pause(); else { st.idx = (st.page === curPageIdx()) ? st.idx : 0; play(); } }
      else if (a === 'prev') jump(-1); else if (a === 'next') jump(1); else if (a === 'slow') rate(-0.1); else if (a === 'fast') rate(0.1); else if (a === 'close') open(false); });
    bar.addEventListener('change', function(e){ if (e.target && e.target.id === 'aud-voice'){ LS.set('tl_book_voice_' + LANG, e.target.value); st.sysVoice = false; paintVoices(); if (st.playing){ stopSpeak(); speakNext(); } } });
    if (SS){ try{ SS.addEventListener('voiceschanged', loadVoices); }catch(e){ SS.onvoiceschanged = loadVoices; } loadVoices(); }
    /* человек сам перелистнул страницу во время чтения — читаем с неё */
    pgin.addEventListener('change', function(){ if (!st.on) return; var i = curPageIdx(); if (i !== st.page){ var was = st.playing; stopSpeak(); st.page = i; st.idx = 0; if (was){ st.playing = true; setTimeout(speakNext, 300); } paint(); } });
    /* экран погас / ушли в другое приложение — Android останавливает речь; вернулись — продолжаем с той же фразы */
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState !== 'visible' || !st.playing || !SS) return;
      setTimeout(function(){ try{ if (!st.playing) return; if (SS.paused){ SS.resume(); return; } if (!SS.speaking && !SS.pending){ st.token++; timersOff(); speakNext(); } }catch(e){} }, 400);
    });
    window.addEventListener('pagehide', function(){ try{ if (SS) SS.cancel(); }catch(e){} });
    window.__tlAudio = { pageText: pageText, state: st, open: open, voices: function(){ return voices; }, status: status };   /* для автотеста */
  }catch(e){ try{ console.warn('book audio off:', e); }catch(_e){} }
})();
