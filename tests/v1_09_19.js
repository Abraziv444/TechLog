/* v1.09.19 — чат «как привычно»: меню сообщения, реакции (одна от человека), ответ-цитата с переходом, правка своего
   (пометка «изменено», Esc — отмена), копирование, фото (уменьшение на устройстве, миниатюра, просмотр), ссылки,
   «пачки», защита от HTML в тексте, срок хранения, SQL. Демо-режим. Запуск: node tests/v1_09_19.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8919;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 340) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  for (const f of ['update-to-1_09_19.sql', 'full-install-1_09_19.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
    t(`${f}: старая chat_send удаляется, снимок проверяется (JPEG, размер), правка — автор и 24 часа, реакция — из белого списка и только по видимому сообщению, уборка по сроку`,
      q.includes('drop function if exists public.chat_send(uuid, text, text, boolean, text, uuid, text);') && q.includes("if length(p_img) > 1500000 or length(p_thumb) > 60000 then raise exception 'TOO_BIG'")
      && q.includes("where id = p_id and from_user = auth.uid() and created_at > now() - interval '24 hours'") && q.includes("if p_emoji not in ('👍','❤️','😂','😮','😢','🙏') then raise exception 'BAD_EMOJI'")
      && q.includes('delete from public.chat_msgs where created_at < now() - make_interval(days => v_days)') && q.includes("update public.push_queue set body = '' where kind = 'chat' and sent_at is not null")
      && q.includes('create policy chat_files_sel on public.chat_files for select'));
  }
  const bk = fs.readFileSync(path.join(ROOT, 'supabase/functions-dashboard/backup/index.ts'), 'utf8');
  const list = (/const TABLES = \[([\s\S]*?)\];/.exec(bk) || [])[1] || '';
  t('чат убран из автобэкапа на Диск, прайс и оплаты остались', !/"chat_msgs"|"chat_files"|"chat_reads"/.test(list) && /"price_list"/.test(list) && /"acc_payments"/.test(list) && bk.includes('const BK_VER = "1.09.19";'));

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  for (const o of [{ w: 1400, h: 900, mode: 'desktop' }, { w: 412, h: 915, mode: 'mobile', touch: true }]){
    console.log('— ' + o.mode + ' —');
    const ctx = await br.newContext({ viewport: { width: o.w, height: o.h }, hasTouch: !!o.touch, isMobile: !!o.touch, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); });
    p.on('dialog', d => d.accept());
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(400);
    await p.evaluate(mode => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', mode); }, o.mode);
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1500);
    const ids = await p.evaluate(() => { const tech = state.data.profiles.find(x => x.role === 'tech').id; const now = Date.now();
      const mk = (from, body, ago, extra) => Object.assign({ id: uid(), from_user: from, to_user: null, channel: 'all', body, important: false, doc_kind: null, doc_id: null, doc_title: '', created_at: new Date(now - ago).toISOString(), reactions: {} }, extra || {});
      state.data.chat_msgs = [mk(tech, 'Первое <b onclick="alert(1)">не жирное</b>', 90000), mk(tech, 'второе подряд, ссылка https://techlog.pro/help?x=1.', 60000), mk(state.user.id, 'моё сообщение', 30000)];
      return { tech, me: state.user.id, m0: state.data.chat_msgs[0].id, m1: state.data.chat_msgs[1].id, mine: state.data.chat_msgs[2].id }; });
    await p.evaluate(() => App.chOpen('all')); await p.waitForTimeout(400);
    const safe = await p.evaluate(({ m0, m1 }) => { const a = document.querySelector(`.ch-msg[data-id="${m0}"] .ch-text`), b = document.querySelector(`.ch-msg[data-id="${m1}"]`);
      const link = b.querySelector('.ch-text a'); return { noTag: !a.querySelector('b') && /<b onclick/.test(a.textContent), cont: b.classList.contains('cont') && !b.querySelector('.ch-who'),
        href: link && link.getAttribute('href'), rel: link && link.getAttribute('rel'), tail: b.querySelector('.ch-text').textContent.trim().endsWith('.') }; }, ids);
    t('HTML в тексте не исполняется; ссылка нажимается (точка в конце в неё не попала, rel=noopener); второе сообщение подряд — «пачкой» без имени',
      safe.noTag && safe.cont && safe.href === 'https://techlog.pro/help?x=1' && /noopener/.test(safe.rel || '') && safe.tail, safe);
    /* меню и реакции */
    await p.click(`.ch-msg[data-id="${ids.m0}"] .ch-bub`); await p.waitForTimeout(250);
    const menu = await p.evaluate(() => { const m = document.getElementById('ch-menu'); if (!m) return null; const r = m.getBoundingClientRect(), box = document.getElementById('ch-msgs').getBoundingClientRect();
      return { emoji: m.querySelectorAll('.ch-menu-e button').length, acts: [...m.querySelectorAll('.ch-menu-a button')].map(b => b.textContent.trim().toLowerCase()), fit: r.left >= box.left - 1 && r.right <= box.right + 1,
        tap: [...m.querySelectorAll('button')].every(b => b.getBoundingClientRect().height >= 38) }; });
    t('нажатие на чужое сообщение — меню: 6 реакций, «Ответить», «Копировать» (админу в канале — ещё «Удалить»), без «Изменить»; кнопки ≥ 38 px, меню в границах ленты',
      menu && menu.emoji === 6 && menu.acts.some(a => /ответить/.test(a)) && menu.acts.some(a => /копировать/.test(a)) && !menu.acts.some(a => /изменить/.test(a)) && menu.fit && menu.tap, menu);
    await p.click('#ch-menu .ch-menu-e button:nth-child(1)'); await p.waitForTimeout(250);
    let rc = await p.evaluate(id => { const c = document.querySelector(`.ch-msg[data-id="${id}"] .ch-rc`); return c ? { txt: c.textContent, mine: c.classList.contains('mine'), menu: !!document.getElementById('ch-menu') } : null; }, ids.m0);
    t('реакция 👍 стала чипом со счётчиком 1, своя подсвечена, меню закрылось', rc && /👍/.test(rc.txt) && /1/.test(rc.txt) && rc.mine && !rc.menu, rc);
    await p.evaluate(id => App.chReact(id, '❤️'), ids.m0); await p.waitForTimeout(200);
    t('другая реакция заменяет прежнюю (одна от человека)', await p.evaluate(id => { const r = chRows().find(x => x.id === id).reactions; return Object.keys(r).join() === '❤️' && r['❤️'].length === 1; }, ids.m0));
    await p.click(`.ch-msg[data-id="${ids.m0}"] .ch-rc`); await p.waitForTimeout(200);
    t('нажатие на свой чип снимает реакцию', await p.evaluate(id => Object.keys(chRows().find(x => x.id === id).reactions).length === 0 && !document.querySelector(`.ch-msg[data-id="${id}"] .ch-rc`), ids.m0));
    /* ответ-цитата */
    await p.evaluate(id => App.chReply(id), ids.m1); await p.waitForTimeout(300);
    t('«Ответить»: над полем ввода — чьё и какое сообщение цитируется', await p.evaluate(() => { const e = document.getElementById('ch-replying'); return !!e && /второе подряд/.test(e.textContent); }));
    await p.fill('#ch-in', 'отвечаю'); await p.click('#ch-send'); await p.waitForTimeout(400);
    const q = await p.evaluate(() => { const m = [...document.querySelectorAll('#ch-msgs .ch-msg')].pop(); const qt = m.querySelector('.ch-quote'); return { quote: qt ? qt.textContent : '', ctx: !!document.getElementById('ch-replying') }; });
    t('ответ ушёл с цитатой, полоса ответа убрана', /второе подряд/.test(q.quote) && !q.ctx, q);
    await p.click('#ch-msgs .ch-msg:last-child .ch-quote'); await p.waitForTimeout(300);
    t('нажатие на цитату подсвечивает исходное сообщение', await p.evaluate(id => document.querySelector(`.ch-msg[data-id="${id}"]`).classList.contains('flash'), ids.m1));
    /* правка своего */
    await p.click(`.ch-msg[data-id="${ids.mine}"] .ch-bub`); await p.waitForTimeout(250);
    t('у своего сообщения в меню есть «Изменить» и «Удалить»', await p.evaluate(() => { const a = [...document.querySelectorAll('#ch-menu .ch-menu-a button')].map(b => b.textContent.trim().toLowerCase()); return a.some(x => /изменить/.test(x)) && a.some(x => /удалить/.test(x)); }));
    await p.evaluate(id => App.chEdit(id), ids.mine); await p.waitForTimeout(300);
    const edm = await p.evaluate(() => ({ bar: !!document.getElementById('ch-editing'), val: document.getElementById('ch-in').value, noCam: !document.getElementById('ch-img-btn') }));
    t('режим правки: текст в поле, полоса «Изменение», фото и документ недоступны', edm.bar && edm.val === 'моё сообщение' && edm.noCam, edm);
    await p.fill('#ch-in', 'моё исправленное'); await p.click('#ch-send'); await p.waitForTimeout(350);
    const edited = await p.evaluate(id => { const el = document.querySelector(`.ch-msg[data-id="${id}"]`); return { txt: el.querySelector('.ch-text').textContent, mark: !!el.querySelector('.ch-edited'), n: chMsgsOf('all').length, bar: !!document.getElementById('ch-editing'), input: document.getElementById('ch-in').value }; }, ids.mine);
    t('правка сохранена: новый текст, пометка «изменено», нового сообщения не появилось, поле очищено', edited.txt === 'моё исправленное' && edited.mark && edited.n === 4 && !edited.bar && edited.input === '', edited);
    await p.evaluate(id => App.chEdit(id), ids.mine); await p.waitForTimeout(200); await p.press('#ch-in', 'Escape'); await p.waitForTimeout(250);
    t('Esc отменяет правку и не оставляет текст в поле', await p.evaluate(() => !document.getElementById('ch-editing') && document.getElementById('ch-in').value === ''));
    t('чужое и старое сообщение править нельзя', await p.evaluate(({ m0, mine }) => { const a = chRows().find(x => x.id === m0), b = Object.assign({}, chRows().find(x => x.id === mine), { created_at: new Date(Date.now() - 25 * 3600000).toISOString() }); return !chCanEdit(a) && !chCanEdit(b); }, ids));
    /* копирование */
    await p.evaluate(id => App.chCopy(id), ids.m1); await p.waitForTimeout(200);
    t('«Копировать» кладёт текст в буфер', /второе подряд/.test(await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))));
    /* фото */
    const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 3000, 2000); g.addColorStop(0, '#1CB0F6'); g.addColorStop(1, '#58CC02'); x.fillStyle = g; x.fillRect(0, 0, 3000, 2000);
      for (let i = 0; i < 400; i++){ x.fillStyle = `hsl(${i * 7 % 360},70%,50%)`; x.fillRect((i * 97) % 2900, (i * 53) % 1900, 90, 60); } return c.toDataURL('image/png').split(',')[1]; });
    await p.setInputFiles('#ch-file', { name: 'ceiling.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await p.waitForTimeout(1200);
    const prep = await p.evaluate(() => CH.img ? { w: CH.img.w, h: CH.img.h, kb: Math.round(CH.img.bytes / 1024), thumbKb: Math.round(CH.img.thumb.length / 1024), jpeg: CH.img.full.startsWith('data:image/jpeg;base64,'), chip: !!document.getElementById('ch-att-img') } : null);
    t('снимок 3000×2000 уменьшен на устройстве: длинная сторона 1600, JPEG ≤ 520 КБ, миниатюра ≤ 40 КБ, над полем ввода — превью', prep && prep.w === 1600 && prep.h === 1067 && prep.jpeg && prep.kb <= 520 && prep.thumbKb <= 40 && prep.chip, prep);
    await p.click('#ch-send'); await p.waitForTimeout(500);
    const im = await p.evaluate(() => { const m = [...document.querySelectorAll('#ch-msgs .ch-msg')].pop(); const i = m.querySelector('.ch-img img'); const r = i ? i.getBoundingClientRect() : null, box = document.getElementById('ch-msgs').getBoundingClientRect();
      return { has: !!i, fit: r && r.right <= box.right + 1 && r.width > 100, chip: !!document.getElementById('ch-att-img'), prev: (document.querySelector('#ch-ths .ch-th[data-k="all"] .tiny') || {}).textContent }; });
    t('фото-сообщение без текста ушло: миниатюра в ленте в границах, превью у поля убрано, в списке переписок «📷 Фото»', im.has && im.fit && !im.chip && /📷/.test(im.prev || ''), im);
    await p.click('#ch-msgs .ch-msg:last-child .ch-img'); await p.waitForTimeout(400);
    t('нажатие открывает снимок целиком с кнопкой скачивания', await p.evaluate(() => { const i = document.getElementById('ch-view-img'), d = document.getElementById('ch-view-dl'); return !!i && i.src.length > 50000 && !!d && /\.jpg$/.test(d.getAttribute('download')); }));
    await p.evaluate(() => App.closeModal());
    await ctx.close();
  }
  { console.log('— срок хранения —');
    const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/index.html`); await p.waitForTimeout(300);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', 'desktop'); });
    await p.reload(); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length); await p.waitForTimeout(1400);
    await p.evaluate(() => { App.go('settings'); foldSet('misc', true); render(); }); await p.waitForTimeout(500);
    t('настройка «Хранить переписку, дней» — в «Функциях», по умолчанию 180', await p.evaluate(() => { const r = document.getElementById('chat-keep-row'); return !!r && r.querySelector('input').value === '180'; }));
    await ctx.close(); }
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
