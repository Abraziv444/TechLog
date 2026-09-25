/* v1.09.50 — офлайн-проверка папок Google Диска в _shared/google.ts (без сети и без Google):
   Drive API и таблица app_secrets подменяются заглушками в памяти.
     · ссылки на корень нет → создаётся «TechLog Archive», ссылка сохраняется;
     · корень с русским именем → переименовывается, ID тот же (файлы на месте);
     · корень удалён / недоступен (404) → находится своя «TechLog Archive» или создаётся новая, ссылка обновляется;
     · сбой Google (500) → ошибка, дубль папки НЕ создаётся;
     · «Архив TechLog» → переименовывается в «Deleted documents», ID тот же; нет ни той ни другой — создаётся;
     · суффикс заблокированного сотрудника: старый «Заблокирован» снимается, новый «(blocked)».
   Запуск: node tests/drive-root.js  (нужен пакет typescript, как у tests/bouncie-tracks.js) */
const fs = require('fs'), path = require('path'), ts = require('typescript');
let ok = 0, bad = 0;
function t(name, cond, note){ if (cond){ ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name + (note !== undefined ? ' — ' + JSON.stringify(note).slice(0, 500) : '')); } }
const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'google.ts'), 'utf8')
  .replace(/import\s*\{\s*createClient\s*\}\s*from\s*"npm:@supabase\/supabase-js@2";/, 'const createClient = globalThis.__createClient;');
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function world(){
  const W = { files: {}, secrets: {}, calls: [], fail500: false, n: 0 };
  W.add = (name, parent, extra) => { const id = 'F' + (++W.n) + 'xxxxxxxxxxxxxxxxxxxxxx'; W.files[id] = { id, name, parents: [parent], trashed: false, mimeType: 'application/vnd.google-apps.folder', ...(extra || {}) }; return id; };
  const json = (o, s = 200) => ({ ok: s < 400, status: s, json: async () => o });
  W.fetch = async (url, opt = {}) => {
    const u = new URL(url); W.calls.push((opt.method || 'GET') + ' ' + u.pathname + (u.search ? '?' + decodeURIComponent(u.searchParams.get('q') || '') : ''));
    if (W.fail500) return json({ error: 'backend' }, 500);
    const m = u.pathname.match(/\/drive\/v3\/files\/?([^/]*)$/);
    if (!m) return json({}, 404);
    const id = m[1];
    if (!id && (opt.method || 'GET') === 'GET'){                      // поиск
      const q = u.searchParams.get('q') || ''; const nm = (q.match(/name='([^']+)'/) || [])[1], par = (q.match(/'([^']+)' in parents/) || [])[1];
      return json({ files: Object.values(W.files).filter(f => !f.trashed && f.name === nm && f.parents.includes(par)).map(f => ({ id: f.id })) });
    }
    if (!id && opt.method === 'POST'){ const b = JSON.parse(opt.body); return json({ id: W.add(b.name, (b.parents || ['root'])[0]) }); }
    const f = W.files[id]; if (!f) return json({ error: 'notFound' }, 404);
    if (opt.method === 'PATCH'){ const b = opt.body ? JSON.parse(opt.body) : {}; if (b.name) f.name = b.name; return json({ id }); }
    return json({ id: f.id, name: f.name, trashed: f.trashed });
  };
  W.client = { from(tb){ const q = { _k: null,
    select(){ return q; }, eq(col, v){ q._k = v; return q; }, in(){ return q; },
    maybeSingle: async () => ({ data: W.secrets[q._k] != null ? { value: W.secrets[q._k] } : null, error: null }),
    upsert: async (row) => { W.secrets[row.key] = row.value; return { error: null }; } }; return q; } };
  return W;
}
function load(W){
  globalThis.Deno = { env: { get: () => 'x' } }; globalThis.fetch = W.fetch; globalThis.__createClient = () => W.client;
  const module = { exports: {} }; (new Function('module', 'exports', 'require', js))(module, module.exports, require); return module.exports;
}

(async () => {
  /* 1. ссылки нет */
  let W = world(), G = load(W);
  const id1 = await G.rootFolder('tok');
  t('ссылки нет — создана «TechLog Archive» в корне Диска, ссылка сохранена', W.files[id1] && W.files[id1].name === 'TechLog Archive' && W.secrets.gd_folder_id === id1 && G.rootFolderInfo().created === true, { id1, sec: W.secrets });
  const calls = W.calls.length; await G.rootFolder('tok');
  t('повторный вызов — из кэша, без запросов к Google', W.calls.length === calls);

  /* 2. русское имя корня */
  W = world(); G = load(W); const ru = W.add('архив', 'root'); W.secrets.gd_folder_id = 'https://drive.google.com/drive/folders/' + ru + '?usp=sharing';
  const id2 = await G.rootFolder('tok');
  t('корень «архив» переименован в «TechLog Archive», ID тот же (файлы на месте), ссылка сохранена как ID', id2 === ru && W.files[ru].name === 'TechLog Archive' && W.secrets.gd_folder_id === ru && G.rootFolderInfo().renamed === true, { id2, name: W.files[ru].name, sec: W.secrets.gd_folder_id });

  /* 3. корень удалён: своя папка есть в корне → берём её */
  W = world(); G = load(W); const mine = W.add('TechLog Archive', 'root'); W.secrets.gd_folder_id = 'Fdeletedxxxxxxxxxxxxxxxxxxxxxx';
  const id3 = await G.rootFolder('tok');
  t('ссылка на удалённую папку — найдена своя «TechLog Archive», ссылка обновлена, дубля нет', id3 === mine && W.secrets.gd_folder_id === mine && Object.values(W.files).filter(f => f.name === 'TechLog Archive').length === 1, { id3, mine });
  /* 3б. корень в корзине, своей нет → создаётся */
  W = world(); G = load(W); const tr = W.add('TechLog Archive', 'root', { trashed: true }); W.secrets.gd_folder_id = tr;
  const id3b = await G.rootFolder('tok');
  t('корень в корзине Диска — создан новый и запомнен', id3b !== tr && W.files[id3b].name === 'TechLog Archive' && W.secrets.gd_folder_id === id3b);

  /* 4. сбой Google */
  W = world(); G = load(W); const r4 = W.add('TechLog Archive', 'root'); W.secrets.gd_folder_id = r4; W.fail500 = true;
  let err = ''; try{ await G.rootFolder('tok'); }catch(e){ err = String(e.message); }
  t('сбой Google (500) — ошибка DRIVE_ROOT, новая папка НЕ создаётся, ссылка не трогается', /DRIVE_ROOT/.test(err) && Object.keys(W.files).length === 1 && W.secrets.gd_folder_id === r4, { err });

  /* 5. папка удалённых документов */
  W = world(); G = load(W); const root = W.add('TechLog Archive', 'root'); const old = W.add('Архив TechLog', root);
  const a1 = await G.archiveFolder('tok', root);
  t('«Архив TechLog» переименована в «Deleted documents», ID тот же', a1 === old && W.files[old].name === 'Deleted documents' && G.ARCHIVE_DIR === 'Deleted documents');
  W = world(); G = load(W); const root2 = W.add('TechLog Archive', 'root');
  const a2 = await G.archiveFolder('tok', root2);
  t('ни старой, ни новой нет — создана «Deleted documents» внутри корня', W.files[a2] && W.files[a2].name === 'Deleted documents' && W.files[a2].parents[0] === root2);

  /* 6. заблокированный сотрудник */
  t('заблокированный: «Ivan P (blocked)»; старый суффикс снимается', G.techDirLabel('Ivan P', true) === 'Ivan P (blocked)' && G.techDirLabel('Ivan P Заблокирован', true) === 'Ivan P (blocked)' && G.techDirLabel('Ivan P Заблокирован', false) === 'Ivan P');

  /* 7. конфигурация без ссылки на папку больше не «не настроена» */
  W = world(); G = load(W); Object.assign(W.secrets, { gd_client_id: 'c', gd_client_secret: 's', gd_refresh_token: 'r' });
  W.client.from = () => ({ select(){ return this; }, in: async () => ({ data: Object.entries(W.secrets).map(([key, value]) => ({ key, value })), error: null }) });
  let cfgErr = ''; try{ await G.driveConfig(); }catch(e){ cfgErr = String(e.message); }
  t('без ссылки на папку Диск считается настроенным (папку создаст rootFolder)', cfgErr === '', cfgErr);

  /* имена служебных папок */
  t('служебные имена по-английски: корень, удалённые, фото, файлы, инвойсы', G.ROOT_DIR === 'TechLog Archive' && !/[А-Яа-я]/.test([G.ROOT_DIR, G.ARCHIVE_DIR, G.PHOTOS_DIR, G.FILES_DIR, G.INVOICES_DIR, G.BLOCKED_SUFFIX].join('')));
  console.log(`\nИтог: ✓ ${ok} · ✗ ${bad}`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
