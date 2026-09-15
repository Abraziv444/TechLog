/* v1.08.84: рендер одиночного PDF-инвойса через jsdom + jspdf (node) для проверки глазами.
   Подготовка: mkdir -p /tmp/vmtest && cd /tmp/vmtest && npm i jsdom@24 jspdf@2.5.1
   Запуск:     NODE_PATH=/tmp/vmtest/node_modules node tests/inv-pdf.js . long /tmp/inv.pdf && pdftoppm -r 80 -png /tmp/inv.pdf /tmp/inv
   variant: short (хвост помещается, правая половина пустая) · mid (3 строки Other services) ·
            long (6 строк + 4 доп. работы + длинная заметка) · huge (переносится на вторую страницу) */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ROOT = process.argv[2], VAR = process.argv[3] || 'long', OUT = process.argv[4] || '/tmp/vmtest/inv.pdf';
const appSrc = fs.readFileSync(ROOT + '/app.js', 'utf8');
const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>`,
  { url: 'https://example.com/', pretendToBeVisual: false, runScripts: 'dangerously' });
const w = dom.window;
w.TECHLOG_CONFIG = {};
w.scrollTo = () => {};
w.fetch = () => Promise.reject(new Error('нет сети'));
w.requestAnimationFrame = () => 0;
if (!w.navigator.vibrate) w.navigator.vibrate = () => {};
w.jspdf = require('jspdf');
const expose = `;window.__T = { buildInvoicePdfDoc, seedDemoData, state, emptyFormData, docNo, INV_W, INV_H,
  setData: d => { state.data = d; }, setJob: id => { state.jobId = id; }, uid, todayISO, buildBatchDoc, setRep: (a,b) => { state.repFrom = a; state.repTo = b; } };`;
const sc = w.document.createElement('script');
sc.textContent = appSrc + expose;
w.document.body.appendChild(sc);
const T = w.__T;
if (!T) { console.log('⛔ нет внутренностей'); process.exit(1); }
const data = T.seedDemoData();
T.setData(data);
const j = data.jobs[0];
j.no = 31; j.seq = 31;
j.helper_ids = ['demo-manager', 'demo-tech'];
const fd = j.form_data;
if (VAR === 'long'){
  fd.others = [
    { desc: 'Cut ceiling toilet 2x7, living room ceiling 7x7, bedroom 7x7', amount: 200 },
    { desc: 'Remove wet drywall behind the washer, 4x8 sheet', amount: 120 },
    { desc: 'Antimicrobial treatment of subfloor in hallway', amount: 85 },
    { desc: 'Haul away debris, 2 contractor bags', amount: 40 },
    { desc: 'Reinstall baseboard in bedroom 2 (12 ft)', amount: 60 },
    { desc: 'Seal the pipe penetration under the kitchen sink', amount: 25 },
  ];
  fd.extra = [
    { kind: 'work', name: 'Painting walls / Покраска стен', needs_size: true, size_a: 12, size_b: 9, size_unit: 'sqft', price: 1.5 },
    { kind: 'purchase', product_name: 'Drywall sheet 4x8', qty: 2, price: 18 },
    { kind: 'purchase', product_name: 'Joint compound 5 gal', qty: 1, price: 22 },
    { kind: 'work', name: 'Caulking bathtub', price: 45 },
  ];
  j.note = '';
  j.note_en = 'Key at leasing office, ask for Maria. Dog in unit - call tenant 30 min before pickup. '
    + 'Water damage came from the upstairs unit 1016; the leasing office asked to document all wet areas with photos before demolition. '
    + 'Tenant will be back on Thursday; dehumidifier must run through the weekend. '
    + 'Please leave the invoice copy under the door and send the photos to the property manager by email.';
} else if (VAR === 'huge'){
  fd.others = Array.from({length: 38}, (_, i) => ({ desc: 'Line ' + (i+1) + ': remove and replace damaged material in room ' + (i%6+1) + ', includes disposal and cleanup of the working area', amount: 10 + i }));
  fd.extra = Array.from({length: 9}, (_, i) => ({ kind: 'purchase', product_name: 'Material item ' + (i+1), qty: i+1, price: 7 }));
  j.note = ''; j.note_en = Array.from({length: 14}, (_, i) => 'Paragraph ' + (i+1) + ': the leasing office asked to document all wet areas with photos before demolition and to keep the dehumidifier running through the weekend.').join(' ');
} else if (VAR === 'mid'){
  fd.others = [
    { desc: 'Cut ceiling toilet 2x7, living room ceiling 7x7', amount: 200 },
    { desc: 'Remove wet drywall behind the washer', amount: 120 },
    { desc: 'Haul away debris, 2 contractor bags', amount: 40 },
  ];
  fd.extra = [];
  j.note = ''; j.note_en = 'Key at leasing office. Dog in unit - call tenant 30 min before pickup.';
} else {
  fd.others = [{ desc: 'inspection', amount: 0 }];
  fd.extra = [];
  j.note = ''; j.note_en = 'inspection';
}
T.setJob(j.id);
const doc = T.buildInvoicePdfDoc(true);
if (!doc) { console.log('⛔ doc null'); process.exit(1); }
fs.writeFileSync(OUT, Buffer.from(doc.output('arraybuffer')));
const ps = doc.internal.pageSize;
console.log("✓", OUT, "страниц", doc.internal.getNumberOfPages(), "размер", ps.getWidth().toFixed(1), "x", ps.getHeight().toFixed(1)); process.exit(0);
