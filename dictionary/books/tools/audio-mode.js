/* TechLog · учебник: РЕЖИМ ЧТЕНИЯ ВСЛУХ (v1.09.14). Автономный модуль: встраивается в каждый
   учебник (tools/inject-audio.py) и в шаблон viewer.html, с просмотрщиком связан только через
   разметку (#bk, #tb, #pgin). Голос — системный синтез речи браузера (speechSynthesis):
   работает без сети, если на устройстве установлен голос нужного языка. Текст берётся из
   векторных страниц книги: строки собираются по координатам, колонки читаются по порядку,
   колонтитулы пропускаются. При любой ошибке модуль молча выключается — книга остаётся книгой. */
(function(){
  'use strict';
  try{
    var bk = document.getElementById('bk'), tb = document.getElementById('tb'), pgin = document.getElementById('pgin');
    if (!bk || !tb || !pgin || !('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return;
    var D = JSON.parse(bk.textContent), P = D.p || [], M = D.meta || {}, N = P.length; if (!N) return;
    var RU = M.lang !== 'en', LANG = RU ? 'ru' : 'en', SS = window.speechSynthesis;
    var T = RU ? { btn:'Читать вслух', play:'Читать', pause:'Пауза', prev:'Предыдущая страница', next:'Следующая страница', slower:'Медленнее', faster:'Быстрее',
                   close:'Закрыть режим чтения', voice:'Голос', empty:'На этой странице нет текста — перехожу дальше', end:'Книга дочитана',
                   novoice:'На устройстве нет голоса для этого языка. Установите его: Настройки телефона → Синтез речи (Text-to-speech) → язык → скачать голосовые данные. После этого чтение работает и без сети.',
                   offline:'голос на устройстве — работает без сети', online:'сетевой голос — нужен интернет', page:'стр.' }
                 : { btn:'Read aloud', play:'Read', pause:'Pause', prev:'Previous page', next:'Next page', slower:'Slower', faster:'Faster',
                   close:'Close reading mode', voice:'Voice', empty:'No text on this page — moving on', end:'End of the book',
                   novoice:'No voice for this language on the device. Install one: phone Settings → Text-to-speech → language → download voice data. After that reading works offline too.',
                   offline:'on-device voice — works offline', online:'network voice — needs internet', page:'p.' };
    var LS = { get:function(k,d){ try{ var v = localStorage.getItem(k); return v == null ? d : v; }catch(e){ return d; } }, set:function(k,v){ try{ localStorage.setItem(k, v); }catch(e){} } };
    function dec(s){ return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,function(_,n){ return String.fromCharCode(+n); }).replace(/&amp;/g,'&'); }

    /* ---- текст страницы: фрагменты <text x y font-size> → строки → колонки → предложения ---- */
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
          while (s0.length > 240){ var k = s0.lastIndexOf(' ', 220); if (k < 80) k = 220; sent.push(s0.slice(0, k)); s0 = s0.slice(k).trim(); }
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

    /* ---- голоса ---- */
    var voices = [];
    function loadVoices(){
      var all = SS.getVoices() || [];
      voices = all.filter(function(v){ return String(v.lang || '').toLowerCase().replace('_', '-').indexOf(LANG) === 0; })
        .sort(function(a, b){ return (b.localService ? 1 : 0) - (a.localService ? 1 : 0) || a.name.localeCompare(b.name); });   /* сначала те, что работают без сети */
      paintVoices();
    }
    function curVoice(){ var want = LS.get('tl_book_voice_' + LANG, ''); return voices.filter(function(v){ return v.voiceURI === want; })[0] || voices[0] || null; }

    /* ---- состояние и управление ---- */
    var st = { on:false, playing:false, page:0, idx:0, rate: Math.min(1.8, Math.max(0.6, parseFloat(LS.get('tl_book_rate', '1')) || 1)), token:0 };
    function curPageIdx(){ var v = String(pgin.value || '').trim(), k; for (k = 0; k < N; k++) if (P[k].l && String(P[k].l) === v) return k; var n = parseInt(v, 10); return n ? Math.max(0, Math.min(N - 1, n - 1)) : 0; }
    function goPage(i){ pgin.value = P[i].l || (i + 1); if (typeof pgin.onchange === 'function') pgin.onchange.call(pgin); else pgin.dispatchEvent(new Event('change')); }
    function stopSpeak(){ st.token++; try{ SS.cancel(); }catch(e){} }
    function speakNext(){
      if (!st.on || !st.playing) return;
      var sents = pageText(st.page);
      if (st.idx >= sents.length){
        if (st.page >= N - 1){ st.playing = false; say(T.end); paint(); return; }
        st.page++; st.idx = 0; goPage(st.page);
        if (!pageText(st.page).length) say(T.empty);
        setTimeout(speakNext, 350); paint(); return;
      }
      var text = sents[st.idx], u = new SpeechSynthesisUtterance(text), my = ++st.token, v = curVoice();
      if (v){ u.voice = v; u.lang = v.lang; } else u.lang = RU ? 'ru-RU' : 'en-US';
      u.rate = st.rate;
      u.onend = function(){ if (my !== st.token) return; st.idx++; speakNext(); };
      u.onerror = function(ev){ if (my !== st.token) return; if (ev && (ev.error === 'interrupted' || ev.error === 'canceled')) return; st.idx++; setTimeout(speakNext, 120); };
      say(text); paint();
      try{ SS.cancel(); SS.speak(u); }catch(e){ st.playing = false; paint(); }
    }
    function play(){ if (!voices.length){ loadVoices(); if (!voices.length){ say(T.novoice); return; } } st.page = curPageIdx(); if (st.playing) return; st.playing = true; speakNext(); }
    function pause(){ st.playing = false; stopSpeak(); paint(); }
    function jump(d){ var was = st.playing; stopSpeak(); st.page = Math.max(0, Math.min(N - 1, curPageIdx() + d)); st.idx = 0; goPage(st.page); say(''); if (was){ st.playing = true; setTimeout(speakNext, 300); } paint(); }
    function rate(d){ st.rate = Math.round(Math.min(1.8, Math.max(0.6, st.rate + d)) * 10) / 10; LS.set('tl_book_rate', String(st.rate)); if (st.playing){ stopSpeak(); speakNext(); } paint(); }

    /* ---- интерфейс: кнопка в шапке и панель внизу ---- */
    var css = document.createElement('style');
    css.textContent = '#aud{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--panel,#17232A);border-top:2px solid var(--line,#31434C);padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));display:none;color:var(--text,#e8eef1);font:14px/1.35 system-ui,sans-serif}'
      + '#aud.on{display:block}#aud .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}#aud .ab{min-width:42px;height:42px;border-radius:12px;border:2px solid var(--line,#31434C);background:transparent;color:inherit;font:inherit;font-weight:800;cursor:pointer;display:grid;place-items:center;padding:0 8px}'
      + '#aud .ab.go{background:var(--blue,#1CB0F6);border-color:var(--blue,#1CB0F6);color:#04222f;min-width:92px}#aud .ab svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}'
      + '#aud .rt{min-width:44px;text-align:center;font-weight:800}#aud select{flex:1 1 140px;min-width:0;height:42px;border-radius:12px;border:2px solid var(--line,#31434C);background:transparent;color:inherit;font:inherit;padding:0 8px}'
      + '#aud .say{margin-top:6px;max-height:3.9em;overflow:hidden;opacity:.92}#aud .hint{font-size:12px;opacity:.7;margin-top:2px}#aud .sp{flex:1 1 auto}body.aud-on #doc,body.aud-on .doc{padding-bottom:150px}';
    document.head.appendChild(css);
    var btn = document.createElement('button'); btn.className = 'ib'; btn.id = 'baud'; btn.title = T.btn; btn.setAttribute('aria-label', T.btn);
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.6"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6"/></svg>';
    var anchor = document.getElementById('bfind'); if (anchor && anchor.parentNode === tb) tb.insertBefore(btn, anchor); else tb.appendChild(btn);
    var bar = document.createElement('div'); bar.id = 'aud'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', T.btn);
    bar.innerHTML = '<div class="row"><button class="ab" data-a="prev" title="' + T.prev + '" aria-label="' + T.prev + '"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>'
      + '<button class="ab go" data-a="play" id="aud-play"></button>'
      + '<button class="ab" data-a="next" title="' + T.next + '" aria-label="' + T.next + '"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>'
      + '<button class="ab" data-a="slow" title="' + T.slower + '" aria-label="' + T.slower + '">−</button><span class="rt" id="aud-rate"></span><button class="ab" data-a="fast" title="' + T.faster + '" aria-label="' + T.faster + '">+</button>'
      + '<select id="aud-voice" aria-label="' + T.voice + '"></select><span class="sp"></span>'
      + '<button class="ab" data-a="close" title="' + T.close + '" aria-label="' + T.close + '"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
      + '<div class="say" id="aud-say" aria-live="off"></div><div class="hint" id="aud-hint"></div>';
    document.body.appendChild(bar);
    function say(t){ var e = document.getElementById('aud-say'); if (e) e.textContent = t || ''; }
    function paintVoices(){
      var sel = document.getElementById('aud-voice'), h = document.getElementById('aud-hint'); if (!sel) return;
      var cv = curVoice();
      sel.innerHTML = voices.map(function(v){ return '<option value="' + String(v.voiceURI).replace(/"/g, '&quot;') + '"' + (cv && cv.voiceURI === v.voiceURI ? ' selected' : '') + '>' + String(v.name).replace(/</g, '&lt;') + (v.localService ? '' : ' ☁') + '</option>'; }).join('');
      sel.style.display = voices.length > 1 ? '' : 'none';
      if (h) h.textContent = cv ? (cv.localService ? T.offline : T.online) : T.novoice;
    }
    function paint(){
      var pb = document.getElementById('aud-play'), r = document.getElementById('aud-rate');
      if (pb) pb.textContent = (st.playing ? T.pause : T.play) + ' · ' + T.page + ' ' + (P[st.playing ? st.page : curPageIdx()].l || (curPageIdx() + 1));
      if (r) r.textContent = '×' + st.rate.toFixed(1);
      btn.classList.toggle('on', st.on);
    }
    function open(on){ st.on = on; bar.classList.toggle('on', on); document.body.classList.toggle('aud-on', on); if (!on) pause(); else { loadVoices(); st.page = curPageIdx(); st.idx = 0; } paint(); }
    btn.addEventListener('click', function(){ open(!st.on); });
    bar.addEventListener('click', function(e){ var b = e.target.closest ? e.target.closest('[data-a]') : null; if (!b) return; var a = b.getAttribute('data-a');
      if (a === 'play'){ if (st.playing) pause(); else { st.idx = (st.page === curPageIdx()) ? st.idx : 0; play(); } }
      else if (a === 'prev') jump(-1); else if (a === 'next') jump(1); else if (a === 'slow') rate(-0.1); else if (a === 'fast') rate(0.1); else if (a === 'close') open(false); });
    bar.addEventListener('change', function(e){ if (e.target && e.target.id === 'aud-voice'){ LS.set('tl_book_voice_' + LANG, e.target.value); paintVoices(); if (st.playing){ stopSpeak(); speakNext(); } } });
    try{ SS.addEventListener('voiceschanged', loadVoices); }catch(e){ SS.onvoiceschanged = loadVoices; }
    loadVoices();
    /* человек сам перелистнул страницу во время чтения — читаем с неё */
    pgin.addEventListener('change', function(){ if (!st.on) return; var i = curPageIdx(); if (i !== st.page){ var was = st.playing; stopSpeak(); st.page = i; st.idx = 0; if (was){ st.playing = true; setTimeout(speakNext, 300); } paint(); } });
    window.addEventListener('pagehide', function(){ try{ SS.cancel(); }catch(e){} });
    window.__tlAudio = { pageText: pageText, state: st, open: open, voices: function(){ return voices; } };   /* для автотеста */
  }catch(e){ try{ console.warn('book audio off:', e); }catch(_e){} }
})();
