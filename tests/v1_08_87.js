/* v1.08.87 — кликабельные плашки главной: курсор-рука у «Ждут апрува» и
   «Пикап сегодня», клавиатура; модалка «Пикапы: сегодня и просроченные» с
   мини-карточками, числа сходятся с плашкой, карточка → модалка пикапа →
   «назад» возвращает к списку. Запуск: node tests/v1_08_87.js [порт] (демо). */
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
  await p.evaluate((m) => { localStorage.clear(); localStorage.setItem('techlog_session_v1', 'demo-admin'); localStorage.setItem('techlog_view_mode', m); }, mode);
  await p.reload(); await p.waitForTimeout(1300);
  /* гарантируем и «сегодня», и «просрочено», и «ждут апрува»: правим демо-данные и перезапускаем */
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('techlog_state_v1'));
    const iso = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    const open = d.placements.filter(p => !p.picked_up && !p.superseded);
    open.forEach((p, i) => { p.technician_id = 'demo-admin'; p.due_date = i % 2 ? iso(-3 - i) : iso(0); });
    const j = d.jobs.find(x => !x.archived_at) || d.jobs[0]; if (j) j.status = 'done';
    localStorage.setItem('techlog_state_v1', JSON.stringify(d));
  });
  await p.reload(); await p.waitForTimeout(1400);
  return p;
}
(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const [name, vp, mode] of [['ПК', { width: 1440, height: 900 }, 'desktop'], ['телефон', { width: 414, height: 850 }, 'mobile']]){
    console.log('— ' + name + ' —');
    const p = await boot(br, vp, mode);
    const b = await p.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const apv = q('#app .banner.b-apv'), pk = q('#app .banner.b-pk');
      const nums = pk ? [...pk.querySelectorAll('b')].map(x => +x.textContent) : [];
      return { apv: !!apv, pk: !!pk, apvCur: apv && getComputedStyle(apv).cursor, pkCur: pk && getComputedStyle(pk).cursor,
        pkRole: pk && pk.getAttribute('role'), pkTab: pk && pk.getAttribute('tabindex'), chev: !!(pk && pk.querySelector(':scope > .ic:last-child')), nums };
    });
    t('плашки на месте: «Ждут апрува» и «Пикап сегодня · просрочено»', b.apv && b.pk && b.nums.length === 2 && b.nums[0] > 0 && b.nums[1] > 0, JSON.stringify(b));
    t('курсор-рука у «Ждут апрува»', b.apvCur === 'pointer', b.apvCur);
    t('курсор-рука у «Пикап сегодня», role=button, tabindex, стрелка', b.pkCur === 'pointer' && b.pkRole === 'button' && b.pkTab === '0' && b.chev, JSON.stringify(b));
    /* ⓘ не открывает модалку */
    await p.evaluate(() => document.querySelector('#app .banner.b-pk .info-i').click()); await p.waitForTimeout(200);
    t('значок ⓘ по-прежнему только подсказка (модалка не открылась)', !(await p.$('#overlay')));
    /* клавиатура */
    await p.evaluate(() => document.querySelector('#app .banner.b-pk').focus()); await p.keyboard.press('Enter'); await p.waitForTimeout(350);
    t('Enter на плашке открывает модалку', !!(await p.$('#overlay .pkm-card')));
    await p.evaluate(() => window.App.closeModal());
    await p.evaluate(() => document.querySelector('#app .banner.b-pk').click()); await p.waitForTimeout(350);
    const m = await p.evaluate(() => {
      const ov = document.querySelector('#overlay'); if (!ov) return null;
      const hs = [...ov.querySelectorAll('.pkm-h')].map(h => ({ cls: h.className, n: +h.querySelector('.hint').textContent, sub: h.querySelector('.pkm-sub').textContent }));
      const cards = [...ov.querySelectorAll('.pkm-card')];
      const c0 = cards[0], r = c0.getBoundingClientRect(), mr = ov.querySelector('.modal').getBoundingClientRect();
      const od = cards.filter(c => c.classList.contains('od'));
      const lists = [...ov.querySelectorAll('.pkm-list')].map(l => getComputedStyle(l).gridTemplateColumns.split(' ').length);
      return { title: ov.querySelector('h3').textContent.trim(), hs, n: cards.length, odN: od.length,
        odChip: od.every(c => /\d+\s*(дн\.|d)/.test((c.querySelector('.chip.bad') || {}).textContent || '')),
        eq: cards.every(c => c.querySelectorAll('.pkm-eq').length >= 1 && /\d/.test(c.querySelector('.pkm-eq b').textContent)),
        addr: cards.filter(c => c.querySelector('.pkm-a')).length, nav: cards.every(c => !!c.querySelector('button[title]')),
        cur: getComputedStyle(c0).cursor, inside: r.left >= mr.left - 1 && r.right <= mr.right + 1, cols: lists,
        overflowX: ov.querySelector('.modal').scrollWidth - ov.querySelector('.modal').clientWidth };
    });
    t('модалка: заголовок, разделы «Сегодня» и «Просрочено»', m && /Пикапы/.test(m.title) && m.hs.length === 2 && /td/.test(m.hs[0].cls) && /od/.test(m.hs[1].cls), JSON.stringify(m && m.hs));
    t('числа разделов = числа на плашке', m && m.hs[0].n === b.nums[0] && m.hs[1].n === b.nums[1], JSON.stringify({ hs: m && m.hs, nums: b.nums }));
    t('мини-карточки: техника с количеством, компас, рука; у просроченных — «N дн.»', m && m.n >= 2 && m.eq && m.nav && m.cur === 'pointer' && m.odN >= 1 && m.odChip, JSON.stringify(m));
    t('карточки не вылезают из модалки; колонок: ' + (mode === 'desktop' ? 2 : 1), m && m.inside && m.overflowX <= 1 && m.cols.every(c => c === (mode === 'desktop' ? 2 : 1)), JSON.stringify(m && { cols: m.cols, of: m.overflowX }));
    /* карточка → пикап → назад к списку */
    await p.evaluate(() => document.querySelector('#overlay .pkm-card').click()); await p.waitForTimeout(350);
    const pm = await p.evaluate(() => ({ list: !!document.querySelector('#overlay .pkm-card'), pick: /Unit/.test((document.querySelector('#overlay h3') || {}).textContent || ''), take: !!document.querySelector('#overlay .btn-green') }));
    t('нажатие на карточку открывает модалку пикапа («Забрать всё»)', !pm.list && pm.pick && pm.take, JSON.stringify(pm));
    await p.evaluate(() => document.querySelector('#overlay .back-x').click()); await p.waitForTimeout(300);
    t('«назад» в пикапе возвращает к списку', !!(await p.$('#overlay .pkm-card')));
    await p.evaluate(() => document.querySelector('#overlay .back-x').click()); await p.waitForTimeout(250);
    t('«назад» в списке закрывает модалку', !(await p.$('#overlay')));
    /* «Ждут апрува» ведёт в хаб */
    await p.evaluate(() => document.querySelector('#app .banner.b-apv').click()); await p.waitForTimeout(400);
    t('«Ждут апрува» открывает экран апрува', (await p.evaluate(() => document.getElementById('app').className)) === 'scr-approvals');
    await p.close();
  }
  console.log('\nИтого: ' + ok + ' ок, ' + bad + ' провал(ов)');
  await br.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('⛔ ' + (e && e.message || e)); process.exit(1); });
