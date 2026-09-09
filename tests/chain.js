/* TechLog · tests/chain.js — цепочка связанных документов
   Проверяет вызов из любого документа, порядок карточек, пометки
   «вы здесь» и «закрыт продлением», частичное продление и адаптив.
   Запуск: node tests/chain.js [порт]   (сервер поднят отдельно) */
const { chromium } = require('playwright-core');
let ok=0,bad=0; const T=(n,c,x)=>{ if(c){ok++;console.log('  ✓ '+n);} else {bad++;console.log('  ✗ '+n+(x?' — '+String(x).slice(0,150):''));} };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:1200,height:860} });
  await p.route('**://cdn.jsdelivr.net/**', r=>r.abort());
  p.on('pageerror', e=>console.log('PAGEERROR:', e.message));
  await p.goto('http://127.0.0.1:' + (process.argv[2] || '8080') + '/index.html',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(500);
  await p.evaluate(()=>localStorage.setItem('techlog_session_v1','demo-admin'));
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200);

  // сценарий 1: полное продление (исходная аренда закрыта)
  const id = await p.evaluate(()=>{
    const d=JSON.parse(localStorage.getItem('techlog_state_v1')); const j=d.jobs[0]; const et=d.equipment_types[0].id;
    d.proposals=[{id:'pp1',no:7,date:'2026-09-01',counterparty_id:j.counterparty_id,complex_id:j.complex_id,unit_number:j.unit_number,items:[],total:200,status:'approved'}];
    j.proposal_id='pp1'; j.date='2026-09-05';
    d.placements=[{id:'pk1',job_id:j.id,equipment_type_id:et,qty:2,date:'2026-09-05',due_date:'2026-09-08',superseded:true,technician_id:j.technician_id},
                  {id:'pk2',job_id:j.id,equipment_type_id:et,qty:2,date:'2026-09-08',due_date:'2026-09-11',ext_of:'pk1',technician_id:j.technician_id}];
    localStorage.setItem('techlog_state_v1', JSON.stringify(d)); location.reload(); return j.id; });
  await p.waitForTimeout(1300);

  console.log('\n— вызов из любого документа —');
  await p.evaluate(i=>App.openJob(i), id); await p.waitForTimeout(600);
  T('кнопка цепочки в шапке работы', await p.evaluate(()=>!!document.querySelector('.docbar .db-chain')));
  const c1 = await p.evaluate(()=>{ document.querySelector('.docbar .db-chain').click();
    return new Promise(r=>setTimeout(()=>{
      const items=[...document.querySelectorAll('.chain-item')];
      r({ n:items.length, теги:items.map(e=>e.querySelector('.chain-tag').textContent.trim()),
          заголовок:(document.querySelector('#overlay .card b')||{}).textContent,
          путь:(document.querySelectorAll('#overlay .card .tiny')[0]||{}).textContent,
          вы_здесь:items.filter(e=>/вы здесь/.test(e.textContent)).length,
          дни:[...document.querySelectorAll('.chain-gap')].map(e=>e.textContent),
          закрыт:/закрыт продлением/.test(document.body.innerText) }); },500)); });
  T('четыре документа в цепочке', c1.n===4, JSON.stringify(c1.теги));
  T('путь показан строкой', /PROP → WORK → PICK → LONG/.test(c1.путь||''), c1.путь);
  T('текущий документ помечен «вы здесь»', c1.вы_здесь===1, String(c1.вы_здесь));
  T('на стрелках дни между документами', c1.дни.length===3, JSON.stringify(c1.дни));
  T('полностью продлённая аренда помечена', c1.закрыт);
  await p.evaluate(()=>App.closeModal());

  console.log('\n— вызов из пропозала —');
  await p.evaluate(()=>App.openProposal('pp1')); await p.waitForTimeout(600);
  T('кнопка цепочки в шапке пропозала', await p.evaluate(()=>!!document.querySelector('.docbar .db-chain')));
  const c2 = await p.evaluate(()=>{ document.querySelector('.docbar .db-chain').click();
    return new Promise(r=>setTimeout(()=>r({ n:document.querySelectorAll('.chain-item').length,
      вы_здесь:[...document.querySelectorAll('.chain-item')].filter(e=>/вы здесь/.test(e.textContent)).length }),500)); });
  T('из пропозала видна та же цепочка', c2.n===4, JSON.stringify(c2));
  T('пропозал помечен как текущий', c2.вы_здесь===1);
  await p.evaluate(()=>App.closeModal());

  console.log('\n— частичное продление —');
  await p.evaluate(i=>{ const d=JSON.parse(localStorage.getItem('techlog_state_v1'));
    d.placements[0].superseded=false; d.placements[0].qty=1; d.placements[1].qty=1;
    localStorage.setItem('techlog_state_v1', JSON.stringify(d)); location.reload(); }, id);
  await p.waitForTimeout(1300);
  const c3 = await p.evaluate(i=>{ App.chain('job', i);
    return new Promise(r=>setTimeout(()=>r({ част:/продлена часть/.test(document.body.innerText),
      закрыт:/закрыт продлением/.test(document.body.innerText) }),500)); }, id);
  T('частичное продление помечено отдельно', c3.част, JSON.stringify(c3));
  T('при частичном продлении нет метки «закрыт»', !c3.закрыт);

  console.log('\n— адаптив —');
  for (const [W,exp] of [[1200,'row'],[420,'column']]){
    await p.setViewportSize({width:W,height:800}); await p.waitForTimeout(300);
    const dir = await p.evaluate(()=>getComputedStyle(document.querySelector('.chain')).flexDirection);
    T(W+'px → ' + exp, dir===exp, dir);
  }
  console.log(`\nИтого: пройдено ${ok}, провалено ${bad}`);
  await b.close(); process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
