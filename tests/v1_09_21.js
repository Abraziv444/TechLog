/* v1.09.21 — ключи защиты переписки (шаг «ключи без шифрования»). Демо-режим: настоящая криптография браузера
   (WebCrypto + IndexedDB), «сервер» — локальное хранилище. Сценарии: создание ключа; плашка и окно пароля; неизвлекаемость;
   новое устройство (сейф открывается паролем, неверный — нет); смена пароля → перезапирание; восстановление с вошедшего
   устройства; ключ фирмы и второй замок; сброс пароля админом → доступ сохраняется; режим «полное» (предупреждение,
   повторный пароль, второго замка нет, админ помочь не может) и возврат; выход стирает ключ; инструкция; SQL.
   Запуск: node tests/v1_09_21.js [порт]. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const PORT = process.argv[2] || 8921;
const EXE = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 360) : '')); } }
(async () => {
  const ROOT = path.join(__dirname, '..');
  for (const f of ['update-to-1_09_21.sql', 'full-install-1_09_21.sql']){
    const q = fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
    t(`${f}: сейф читает только владелец; закрытая часть ключа на сервер не принимается; полное шифрование = второго замка нет; второй замок — только админу, с записью в журнал; замена ключа только явно`,
      q.includes('create policy chat_keys_own on public.chat_keys for select to authenticated using (user_id = auth.uid());') && q.includes("or p_pub ? 'd' then raise exception 'BAD_KEY'")
      && q.includes("check (mode <> 'total' or escrow is null)") && q.includes("'chat_key_escrow', 'profile', p_user::text") && q.includes("and not coalesce(p_replace, false) then raise exception 'KEY_EXISTS'")
      && q.includes('revoke insert, update, delete on public.chat_pubkeys, public.chat_keys, public.chat_org_key, public.chat_org_holders from authenticated, anon;'));
  }
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  t('пароль не сохраняется: живёт в памяти не дольше двух минут и стирается после использования; в localStorage ключи не пишутся',
    src.includes("finally{ CK.busy = false; CK.pw = '';") && !/localStorage\.setItem\([^)]*(pkcs8|CK\.pw|password)/i.test(src) && src.includes("persistSession: false, autoRefreshToken: false"));
  const bk = fs.readFileSync(path.join(ROOT, 'supabase/functions-dashboard/backup/index.ts'), 'utf8');
  t('таблицы ключей не попадают в бэкап на Диск', !/"chat_keys"|"chat_org_holders"|"chat_pubkeys"/.test((/const TABLES = \[([\s\S]*?)\];/.exec(bk) || [])[1] || ''));

  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const mkCtx = async () => { const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
    p.on('pageerror', e => { bad++; console.log('  ⛔ page error: ' + String(e).slice(0, 240)); }); p.on('dialog', d => d.accept());
    await p.route(/https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); return { ctx, p }; };
  /* «сервер» демо-режима — localStorage. Состояние подкладываем со страницы БЕЗ приложения (version.json): уходя со страницы,
     приложение само сохраняет своё состояние и затёрло бы подложенное. IndexedDB у каждого контекста свой — это и есть «другое устройство». */
  const open = async (p, who, seed) => { await p.goto(`http://127.0.0.1:${PORT}/version.json`, { waitUntil: 'load' });
    await p.evaluate(([w, sd]) => { if (sd) localStorage.setItem('techlog_state_v1', sd); localStorage.setItem('techlog_session_v1', w); localStorage.setItem('techlog_view_mode', 'desktop'); }, [who, seed || '']);
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' }); await p.waitForFunction(() => window.App && document.querySelector('#app').children.length, null, { timeout: 20000 }); await p.waitForTimeout(1300); };
  const PW = 'correct-horse-42', PW2 = 'battery-staple-77';

  /* ===== устройство А: админ создаёт ключ ===== */
  const A = await mkCtx(); await open(A.p, 'demo-admin');
  await A.p.evaluate(() => ckInit(true)); await A.p.waitForTimeout(400);
  t('после обновления без пароля: состояние «нужен пароль», на главной синяя плашка', await A.p.evaluate(() => { render(); return CK.st === 'need_pw' && !!document.getElementById('ck-banner'); }));
  await A.p.click('#ck-banner'); await A.p.waitForTimeout(250);
  await A.p.fill('#ck-pw', 'short'); await A.p.click('#ck-pw-go'); await A.p.waitForTimeout(400);
  t('слишком короткий пароль не принимается', await A.p.evaluate(() => CK.st === 'need_pw' && /10/.test(document.getElementById('ck-pw-err').textContent)));
  await A.p.fill('#ck-pw', PW); await A.p.click('#ck-pw-go'); await A.p.waitForTimeout(2500);
  const made = await A.p.evaluate(async () => { const d = ckDemo(), me = state.user.id, row = d.chat_keys.find(r => r.user_id === me), dev = await ckDevGet(me);
    let exportable = true; try{ await crypto.subtle.exportKey('pkcs8', dev.priv); }catch(e){ exportable = false; }
    return { st: CK.st, banner: !!document.getElementById('ck-banner'), modal: !!document.getElementById('overlay'), safe: !!(row && row.safe && row.safe.ct && row.safe.iter === 600000), noPlain: !JSON.stringify(row).includes('"d"'),
      pub: !!d.chat_pubkeys.find(r => r.user_id === me), extractable: dev.priv.extractable, exportable, org: !!d.chat_org_key, holder: d.chat_org_holders.some(h => h.admin_id === me), escrow: !!row.escrow, keyId: row.key_id, pwLeft: CK.pw }; });
  t('ключ создан: состояние «готов», плашки и окна нет; на «сервере» сейф (600 000 итераций) без закрытой части; ключ на устройстве неизвлекаемый; пароль из памяти стёрт',
    made.st === 'ready' && !made.banner && !made.modal && made.safe && made.noPlain && made.pub && made.extractable === false && made.exportable === false && made.pwLeft === '', made);
  t('первый админ создал ключ фирмы, держит его копию, а его собственный сейф получил второй замок', made.org && made.holder && made.escrow, made);
  await A.p.evaluate(() => { App.go('settings'); foldSet('ck', true); render(); }); await A.p.waitForTimeout(500);
  const card = await A.p.evaluate(() => { const c = document.getElementById('ck-card'); return { has: !!c, chip: /ключ готов/.test(c.textContent), fp: (c.querySelector('.ck-fp') || {}).textContent, mode: (c.querySelector('#ck-mode .on') || {}).textContent, staff: c.querySelectorAll('#ck-staff .ck-row').length, note: /НЕ шифруются/.test(c.textContent) }; });
  t('карточка «Защита переписки»: «ключ готов», номер ключа, режим «С восстановлением», список сотрудников, честная пометка «сообщения пока не шифруются»', card.has && card.chip && /^[0-9A-F ]{19}$/.test(card.fp || '') && /восстановлением/i.test(card.mode || '') && card.staff >= 3 && card.note, card);
  await A.p.click('#ck-help-btn'); await A.p.waitForTimeout(300);
  const help = await A.p.evaluate(() => { const h = document.getElementById('ck-help'); return h ? { h4: h.querySelectorAll('h4').length, len: h.textContent.length, parts: ['Как появляется ключ', 'Где лежит ключ', 'Обычные ситуации', 'Два режима', 'Администратору', 'не защищает'].every(x => h.textContent.includes(x)) } : null; });
  t('«?» открывает ПОЛНУЮ инструкцию по ключам (7 разделов), а не 12-секундную подсказку', help && help.h4 === 7 && help.len > 2500 && help.parts, help);
  await A.p.evaluate(() => App.closeModal());
  t('та же инструкция — в конце раздела «Сообщения» справки', await A.p.evaluate(() => { const h = sectionFaqHtml('chat'); return h.includes('Ключи защиты переписки — полная инструкция') && h.includes('Держите минимум двух админов'); }));
  t('английская инструкция — без кириллицы', await A.p.evaluate(() => { const l = state.lang; state.lang = 'en'; const h = ckHelpHtml().replace(/<[^>]+>/g, ''); state.lang = l; return /Chat protection keys/.test(h) && !/[А-Яа-яЁё]/.test(h); }));
  const seed1 = await A.p.evaluate(() => { saveLocalNow(); return localStorage.getItem('techlog_state_v1'); });

  /* ===== устройство Б (новое): тот же пользователь, только пароль ===== */
  const B = await mkCtx(); await open(B.p, 'demo-admin', seed1);
  await B.p.evaluate(() => ckInit(true)); await B.p.waitForTimeout(400);
  t('новое устройство: ключа на нём нет — «нужен пароль», кнопка «Открыть ключ на этом устройстве»', await B.p.evaluate(() => { App.go('settings'); foldSet('ck', true); render(); return CK.st === 'need_pw' && /Открыть ключ/i.test((document.getElementById('ck-unlock') || {}).textContent || ''); }));
  await B.p.click('#ck-unlock'); await B.p.waitForTimeout(250);
  await B.p.fill('#ck-pw', 'wrong-password-00'); await B.p.click('#ck-pw-go'); await B.p.waitForTimeout(2200);
  t('неверный пароль сейф не открывает', await B.p.evaluate(() => CK.st === 'need_pw' && /неверн/i.test(document.getElementById('ck-pw-err').textContent)));
  await B.p.fill('#ck-pw', PW); await B.p.click('#ck-pw-go'); await B.p.waitForTimeout(2500);
  const onB = await B.p.evaluate(async id => { const dev = await ckDevGet(state.user.id); return { st: CK.st, same: dev && dev.key_id === id, canOrg: !!(await ckOrgPriv()) }; }, made.keyId);
  t('верный пароль открывает сейф: на новом устройстве ТОТ ЖЕ ключ, и ключ фирмы им открывается', onB.st === 'ready' && onB.same && onB.canOrg, onB);

  /* ===== сотрудник: ключ, второй замок, сброс пароля админом ===== */
  const seed2 = await B.p.evaluate(() => { saveLocalNow(); return localStorage.getItem('techlog_state_v1'); });
  const T = await mkCtx(); await open(T.p, 'demo-tech', seed2);
  await T.p.evaluate(pw => { ckPwSet(pw); return ckInit(true); }, PW); await T.p.waitForTimeout(600);
  const tech = await T.p.evaluate(() => { const r = ckDemo().chat_keys.find(x => x.user_id === state.user.id); return { st: CK.st, escrow: !!(r && r.escrow), id: r && r.key_id, uid: state.user.id }; });
  t('сотрудник вошёл по паролю — ключ создан сам, второй замок (ключ фирмы) поставлен сразу', tech.st === 'ready' && tech.escrow, tech);
  /* смена пароля: сейф перезапирается с устройства */
  const rew = await T.p.evaluate(async ([pw, pw2]) => { ckPwSet(pw2); await ckInit(true); const safe = ckDemo().chat_keys.find(x => x.user_id === state.user.id).safe; let oldOk = true, newOk = true;
    try{ await ckSafeOpen(pw, safe); }catch(e){ oldOk = false; } try{ await ckSafeOpen(pw2, safe); }catch(e){ newOk = false; } return { oldOk, newOk, log: (state.data.audit_log || []).some(a => a.action === 'chat_key_rewrap') }; }, [PW, PW2]);
  t('смена пароля: сейф перезаперт с устройства — новым паролем открывается, старым уже нет; запись в журнале', rew.newOk && !rew.oldOk && rew.log, rew);
  const seed3 = await T.p.evaluate(() => { saveLocalNow(); return localStorage.getItem('techlog_state_v1'); });
  /* админ (устройство Б) сбрасывает пароль сотруднику → перезапирает его сейф через ключ фирмы */
  await open(B.p, 'demo-admin', seed3);
  const PW3 = 'temp-password-2026';
  const adm = await B.p.evaluate(async ([uid, pw3]) => { await ckInit(true); const r = await ckAdminRewrap(uid, pw3); const safe = ckDemo().chat_keys.find(x => x.user_id === uid).safe; let opens = true; try{ await ckSafeOpen(pw3, safe); }catch(e){ opens = false; } return { st: CK.st, r, opens }; }, [tech.uid, PW3]);
  t('забыл пароль, устройств нет: админ задаёт новый пароль — его приложение перезапирает сейф сотрудника через ключ фирмы', adm.st === 'ready' && adm.r === 'ok' && adm.opens, adm);
  const seed4 = await B.p.evaluate(() => { saveLocalNow(); return localStorage.getItem('techlog_state_v1'); });
  const N = await mkCtx(); await open(N.p, 'demo-tech', seed4);
  const back = await N.p.evaluate(async ([pw3, id]) => { ckPwSet(pw3); await ckInit(true); const dev = await ckDevGet(state.user.id); return { st: CK.st, same: dev && dev.key_id === id }; }, [PW3, tech.id]);
  t('сотрудник на НОВОМ устройстве входит с временным паролем — ключ тот же, доступ сохранён', back.st === 'ready' && back.same, back);

  /* ===== полное шифрование ===== */
  await N.p.evaluate(() => { App.go('settings'); foldSet('ck', true); render(); }); await N.p.waitForTimeout(400);
  await N.p.click('#ck-mode button:nth-child(2)'); await N.p.waitForTimeout(300);
  const warn = await N.p.evaluate(() => { const w = document.getElementById('ck-warn'), b = document.getElementById('ck-mode-go'); return { danger: w && w.classList.contains('danger'), items: w ? w.querySelectorAll('li').length : 0, disabled: b && b.disabled, field: !!document.getElementById('ck-mpw') }; });
  t('«Полное»: красное предупреждение с тремя пунктами, поле повторного ввода пароля, кнопка неактивна, пока пароль не введён', warn.danger && warn.items === 3 && warn.disabled && warn.field, warn);
  await N.p.fill('#ck-mpw', 'wrong-password-00'); await N.p.click('#ck-mode-go'); await N.p.waitForTimeout(2200);
  t('с неверным паролем режим не меняется', await N.p.evaluate(() => CK.row.mode === 'recover' && /неверн/i.test(document.getElementById('ck-mode-err').textContent)));
  await N.p.fill('#ck-mpw', PW3); await N.p.click('#ck-mode-go'); await N.p.waitForTimeout(2500);
  const tot = await N.p.evaluate(() => { const d = ckDemo(), me = state.user.id, r = d.chat_keys.find(x => x.user_id === me), q = d.chat_pubkeys.find(x => x.user_id === me); return { mode: r.mode, escrow: r.escrow, pubMode: q.mode, ui: (document.querySelector('#ck-mode .on') || {}).textContent, modal: !!document.getElementById('overlay') }; });
  t('полное шифрование включено: второй замок УДАЛЁН, режим виден остальным, окно закрыто', tot.mode === 'total' && tot.escrow === null && tot.pubMode === 'total' && /полное/i.test(tot.ui || '') && !tot.modal, tot);
  const seed5 = await N.p.evaluate(() => { saveLocalNow(); return localStorage.getItem('techlog_state_v1'); });
  await open(B.p, 'demo-admin', seed5);
  const adm2 = await B.p.evaluate(async uid => { await ckInit(true); App.go('settings'); foldSet('ck', true); render(); const row = [...document.querySelectorAll('#ck-staff .ck-row')].find(r => /полное/i.test(r.textContent)); return { r: await ckAdminRewrap(uid, 'another-temp-pass-1'), seen: !!row }; }, tech.uid);
  t('админ видит у сотрудника режим «Полное» и помочь ему со сбросом пароля уже не может', adm2.r === 'total' && adm2.seen, adm2);
  /* восстановление с вошедшего устройства работает и в полном режиме */
  const dev = await N.p.evaluate(async () => { ckPwSet('brand-new-pass-99'); await ckInit(true); const safe = ckDemo().chat_keys.find(x => x.user_id === state.user.id).safe; let okk = true; try{ await ckSafeOpen('brand-new-pass-99', safe); }catch(e){ okk = false; } return { st: CK.st, okk }; });
  t('полный режим: пароль сменился, а вошедшее устройство осталось — оно само перезапирает сейф', dev.st === 'ready' && dev.okk, dev);
  /* возврат в режим с восстановлением */
  await N.p.evaluate(() => { render(); }); await N.p.waitForTimeout(300);
  await N.p.click('#ck-mode button:nth-child(1)'); await N.p.waitForTimeout(300);
  await N.p.fill('#ck-mpw', 'brand-new-pass-99'); await N.p.click('#ck-mode-go'); await N.p.waitForTimeout(2500);
  t('возврат в режим «с восстановлением» — тоже через пароль; второй замок создан заново', await N.p.evaluate(() => { const r = ckDemo().chat_keys.find(x => x.user_id === state.user.id); return r.mode === 'recover' && !!r.escrow; }));
  /* выход стирает ключ с устройства */
  const out = await N.p.evaluate(async () => { const id = state.user.id; App.logout(); await new Promise(r => setTimeout(r, 400)); return { dev: await ckDevGet(id), st: CK.st, user: !!state.user }; });
  t('выход из аккаунта стирает ключ с устройства', out.dev === null && out.st === 'off' && !out.user, out);
  for (const x of [A, B, T, N]) await x.ctx.close();
  await br.close();
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`); process.exit(bad ? 1 : 0);
})();
