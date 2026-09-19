/* v1.09.03 — (1) замок правки старых задач: галочка «включено/выключено» + срок
   от 1 дня, строка «Сейчас: …», подсказка «?»; (2) автобэкап по полкам: памятка в
   карточке, список копий по группам с бейджами, предупреждение про старую функцию.
   Запуск: node tests/v1_09_03.js [порт] (демо; сервер поднимается в той же команде). */
const { chromium } = require('playwright-core');
const PORT = process.argv[2] || 8193;
let ok = 0, bad = 0;
function t(name, cond, note){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + note : '')); }
}
async function boot(br, who, mode, w, h, folds){
  const p = await (await br.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.evaluate(([who, mode, folds]) => { localStorage.clear();
    localStorage.setItem('techlog_session_v1', who);
    localStorage.setItem('techlog_view_mode', mode);
    const f = {}; folds.forEach(k => f[k] = 1);
    localStorage.setItem('techlog_fold', JSON.stringify(f)); }, [who, mode, folds]);
  await p.reload(); await p.waitForTimeout(1500);
  await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(600);
  return p;
}
const lockInfo = (p) => p.evaluate(() => {
  const row = document.querySelector('#app #lock-row'); if (!row) return null;
  const chk = row.querySelector('#lock-chk');
  const line = document.querySelector('#app .lock-days');
  const inp = line.querySelector('input'), btns = [...line.querySelectorAll('button')];
  const st = document.querySelector('#app #lock-state');
  const R = row.closest('.card').getBoundingClientRect();
  const over = [row, line, st].filter(x => { const r = x.getBoundingClientRect(); return r.right > R.right + 1 || r.left < R.left - 1; }).length;
  const q = row.querySelector('.tipq'), qr = q && q.getBoundingClientRect();
  return { checked: chk.checked, optOn: chk.closest('.opt').classList.contains('on'), off: line.classList.contains('is-off'),
    val: inp.value, inpDis: inp.disabled, btnDis: btns.every(b => b.disabled), btnLive: btns.every(b => !b.disabled),
    state: st.textContent.trim(), label: line.querySelector('.name').textContent.trim(), over,
    tip: !!q, tipW: qr ? Math.round(qr.width) : 0, tipH: qr ? Math.round(qr.height) : 0,
    org: (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').org_settings || {}).edit_lock_days };
});

(async () => {
  const br = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  for (const [title, mode, w, h] of [['админ, телефон 390', 'mobile', 390, 2600], ['админ, ПК 1280', 'desktop', 1280, 1000]]){
    console.log('— ' + title + ' —');
    const p = await boot(br, 'demo-admin', mode, w, h, ['docs', 'dgs', 'abk']);
    let a = await lockInfo(p);
    t('строка замка есть; по умолчанию выключено: галочка снята, срок блёклый и не нажимается',
      a && !a.checked && !a.optOn && a.off && a.inpDis && a.btnDis, JSON.stringify(a));
    t('при выключенном в поле не 0, а будущий срок (7); подпись без «0 — выкл»', a.val === '7' && !/0\s*—\s*выкл/.test(a.label), a.val + ' · ' + a.label);
    t('строка состояния: «Сейчас: выключено — … никак не блокируется»', /Сейчас: выключено/.test(a.state) && /никак не блокируется/.test(a.state), a.state);
    t('кружок «?» рядом с галочкой, зона нажатия ≥ 24 px, ничего не вылезает за карточку', a.tip && a.tipW >= 24 && a.tipH >= 24 && a.over === 0, JSON.stringify([a.tipW, a.tipH, a.over]));

    await p.click('#lock-row .tipq'); await p.waitForTimeout(300);
    const tip = await p.evaluate(() => { const x = [...document.querySelectorAll('#toasts .toast')].pop(); return x ? { txt: x.textContent, tap: x.classList.contains('tap') } : null; });
    t('«?» открывает подсказку: про значение 0, про минимум 1 день, кого не касается', tip && /значение 0/.test(tip.txt) && /никак не блокируется/.test(tip.txt)
      && /Минимум — 1 день/.test(tip.txt) && /Менеджера и админа/.test(tip.txt), tip && tip.txt.slice(0, 80));
    await p.waitForTimeout(4300);
    const still = await p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].some(x => /Минимум — 1 день/.test(x.textContent)));
    t('длинная подсказка не исчезает через 3,8 с', still);
    await p.click('#toasts .toast.tap'); await p.waitForTimeout(150);
    t('…и закрывается нажатием', !(await p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].some(x => /Минимум — 1 день/.test(x.textContent)))));

    await p.click('#lock-chk'); await p.waitForTimeout(500);
    a = await lockInfo(p);
    t('поставили галочку → включено на 7 дн.: степпер живой, строка «Сейчас: включено … старше 7 дн.» с датой',
      a.checked && a.optOn && !a.off && !a.inpDis && a.btnLive && a.val === '7' && /Сейчас: включено/.test(a.state) && /старше 7 дн\./.test(a.state) && /\d{2}\/\d{2}\/\d{4}/.test(a.state), JSON.stringify(a));
    for (let i = 0; i < 9; i++){ await p.click('.lock-days button[aria-label="−"]'); await p.waitForTimeout(90); }
    await p.waitForTimeout(300);
    a = await lockInfo(p);
    t('девять раз «−» → упёрлись в 1, замок остался включён (ноль не выставить)', a.val === '1' && a.checked && /старше 1 дн\./.test(a.state), JSON.stringify(a));
    await p.fill('.lock-days input', '0'); await p.press('.lock-days input', 'Tab'); await p.waitForTimeout(400);
    a = await lockInfo(p);
    t('ввели 0 руками → стало 1, галочка стоит', a.val === '1' && a.checked, JSON.stringify(a));
    await p.fill('.lock-days input', '12'); await p.press('.lock-days input', 'Tab'); await p.waitForTimeout(400);
    await p.click('#lock-chk'); await p.waitForTimeout(500);
    a = await lockInfo(p);
    t('сняли галочку → выключено, срок 12 показан блёклым (запомнен)', !a.checked && a.off && a.btnDis && a.val === '12' && /Сейчас: выключено/.test(a.state), JSON.stringify(a));
    await p.waitForTimeout(1700);
    const saved0 = await p.evaluate(() => (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').org_settings || {}).edit_lock_days);
    t('в настройках организации при снятой галочке лежит 0', saved0 === 0, saved0);
    await p.click('#lock-chk'); await p.waitForTimeout(500);
    a = await lockInfo(p);
    t('поставили снова → вернулись прежние 12 дн.', a.checked && a.val === '12' && /старше 12 дн\./.test(a.state), JSON.stringify(a));
    await p.waitForTimeout(1700);
    const saved12 = await p.evaluate(() => (JSON.parse(localStorage.getItem('techlog_state_v1') || '{}').org_settings || {}).edit_lock_days);
    t('…и в настройках организации 12', saved12 === 12, saved12);

    /* автобэкап */
    const card = await p.evaluate(() => {
      const r = document.querySelector('#app #abk-rules'); if (!r) return null;
      const c = r.closest('.card'), R = c.getBoundingClientRect();
      const over = [...c.querySelectorAll('*')].filter(x => { const b = x.getBoundingClientRect(); return b.width && (b.right > R.right + 1 || b.left < R.left - 1); }).length;
      return { rows: r.children.length, tags: [...r.querySelectorAll('.abk-tag')].map(x => x.textContent.trim()), txt: r.textContent,
        auto: c.querySelector('.chk-line').textContent.trim(), over };
    });
    t('карточка автобэкапа: памятка из трёх полок — АДМИН · вечно / НЕДЕЛЬНЫЙ · вечно / ежедневный (последние 8)',
      card && card.rows === 3 && /АДМИН · ВЕЧНО/i.test(card.tags[0]) && /НЕДЕЛЬНЫЙ · ВЕЧНО/i.test(card.tags[1]) && /ежедневный/i.test(card.tags[2])
      && /система не удаляет/.test(card.txt) && /последние 8/.test(card.txt), JSON.stringify(card));
    t('галочка автозапуска: «не чаще раза в день»; карточка не вылезает за края', card && /не чаще раза в день/i.test(card.auto) && card.over === 0, JSON.stringify(card && [card.auto, card.over]));

    const files = [];
    files.push({ name: 'TechLog-backup-2026-09-19_1432-ADMIN.sql', createdTime: '2026-09-19T18:32:00Z', size: '2048000', kind: 'admin', by: 'abraziv777' });
    for (let i = 0; i < 14; i++) files.push({ name: `TechLog-backup-2026-0${i < 7 ? 6 : 7}-${String(1 + i).padStart(2, '0')}-weekly-2026-W${20 + i}.sql`, createdTime: `2026-07-${String(1 + i).padStart(2, '0')}T12:00:00Z`, size: '1024000', kind: 'weekly' });
    for (let i = 0; i < 8; i++) files.push({ name: `TechLog-backup-2026-09-${String(19 - i).padStart(2, '0')}-daily.sql`, createdTime: `2026-09-${String(19 - i).padStart(2, '0')}T12:00:00Z`, size: '1024000', kind: 'daily' });
    files.push({ name: 'TechLog-backup-2026-09-01.sql', createdTime: '2026-09-01T12:00:00Z', size: '900000', kind: 'legacy' });
    await p.evaluate((files) => window.App.__test_abkList({ ok: true, ver: '1.09.03', keep_daily: 8, counts: { admin: 1, weekly: 14, daily: 8, legacy: 1 }, files }), files);
    await p.waitForTimeout(200);
    const lst = await p.evaluate(() => {
      const el = document.querySelector('#app #abk-list'), R = el.closest('.card').getBoundingClientRect();
      const g = [...el.querySelectorAll('.abk-grp')].map(x => ({ k: x.dataset.k, h: x.querySelector('.abk-grp-h').textContent.trim(), rows: x.querySelectorAll('.abk-row').length }));
      const over = [...el.querySelectorAll('*')].filter(x => { const b = x.getBoundingClientRect(); return b.width && (b.right > R.right + 1 || b.left < R.left - 1); }).length;
      return { g, over, warn: !!el.querySelector('.banner'), by: /@abraziv777/.test(el.textContent), scrollW: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    t('список копий: группы админ → недельные → ежедневные → старый формат, со счётчиками',
      lst.g.map(x => x.k).join() === 'admin,weekly,daily,legacy' && /· 1$/.test(lst.g[0].h) && /· 14$/.test(lst.g[1].h) && /8 \/ 8/.test(lst.g[2].h), JSON.stringify(lst.g));
    t('недельных показано 12 + строка «ещё 2»; у ручной копии виден автор; предупреждения про старую функцию нет', lst.g[1].rows === 13 && lst.by && !lst.warn, JSON.stringify(lst));
    t('длинные имена файлов не ломают вёрстку (ничего за краями, страница не шире экрана)', lst.over === 0 && lst.scrollW <= 1, JSON.stringify([lst.over, lst.scrollW]));
    await p.evaluate(() => window.App.go('home')); await p.waitForTimeout(300);
    await p.evaluate(() => window.App.go('settings')); await p.waitForTimeout(500);
    t('список переживает перерисовку экрана настроек', await p.evaluate(() => document.querySelectorAll('#app #abk-list .abk-grp').length === 4));

    await p.evaluate((files) => window.App.__test_abkList({ ok: true, files: files.slice(0, 10).map(f => ({ name: f.name, createdTime: f.createdTime, size: f.size })) }), files);
    await p.waitForTimeout(150);
    const old = await p.evaluate(() => { const el = document.querySelector('#app #abk-list'); const b = el.querySelector('.banner'); return { warn: b ? b.textContent : '', grp: el.querySelectorAll('.abk-grp').length }; });
    t('ответ старой функции backup → жёлтое предупреждение «Передеплойте Edge Function backup», список всё равно по группам', /Передеплойте Edge Function backup/.test(old.warn) && old.grp >= 2, JSON.stringify(old));

    t('в демо-режиме автозапуск не срабатывает', (await p.evaluate(() => window.App.__test_abkDue())) === false);
    await p.close();
  }

  console.log('— техник —');
  {
    const p = await boot(br, 'demo-tech', 'mobile', 390, 2400, ['docs', 'dgs', 'abk']);
    const x = await p.evaluate(() => ({ lock: !!document.querySelector('#app #lock-row'), abk: !!document.querySelector('#app #abk-rules') }));
    t('технику ни замок, ни автобэкап не показываются', !x.lock && !x.abk, JSON.stringify(x));
    await p.close();
  }

  await br.close();
  console.log(`\nИтого: ${ok} ✓ / ${bad} ✗`);
  process.exit(bad ? 1 : 0);
})();
