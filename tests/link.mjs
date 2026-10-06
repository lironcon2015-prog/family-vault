/* link.mjs — מסמכים מקושרים מאפליקציה אחרת. DEC-47, SPEC §18.

   שני חלקים, ושניהם רצים מול **הגשר האמיתי**: `tools/bridge.gs` נטען ל-vm של
   Node מול DriveApp מזויף, וכל בקשה של הדפדפן לכתובת הגשר עוברת ל-`doPost`
   שלו. כך נבדק גם מה שהדפדפן אינו רואה — שהגשר אינו מוציא עסקאות מקובץ
   הגיבוי של התקציב, ושאינו מוריד קובץ מחוץ לתיקיית המסמכים שלו. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

/* ---------- דרייב מזויף ---------- */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let nid = 0, clock = 1000;
const items = new Map();

function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }
function mkBlob(bytes, mime, name) {
  return {
    bytes, mime, name,
    getBytes: () => bytes, getContentType: () => mime,
    getDataAsString: () => Buffer.from(bytes).toString('utf8')
  };
}
function node(kind, name, parent, extra) {
  const id = (kind === 'folder' ? 'fold-' : 'file-') + (++nid);
  const n = Object.assign({ id, kind, name, parents: parent ? [parent] : [], trashed: false, desc: '', updated: ++clock }, extra || {});
  items.set(id, n);
  return wrapNode(n);
}
function wrapNode(n) {
  const children = (kind, name) => [...items.values()]
    .filter(x => x.kind === kind && x.parents.includes(n.id) && (name == null || x.name === name))
    .map(wrapNode);
  return {
    getId: () => n.id, getName: () => n.name, isTrashed: () => n.trashed,
    getDescription: () => n.desc, setDescription: d => { n.desc = d; },
    getParents: () => iter(n.parents.map(p => wrapNode(items.get(p)))),
    getLastUpdated: () => new Date(n.updated),
    getFoldersByName: name => iter(children('folder', name)),
    getFilesByName: name => iter(children('file', name)),
    createFolder: name => node('folder', name, n.id),
    createFile: (a, b, c) => typeof a === 'string'
      ? node('file', a, n.id, { bytes: Buffer.from(b, 'utf8'), mime: c })
      : node('file', a.name, n.id, { bytes: a.bytes, mime: a.mime }),
    getBlob: () => mkBlob(n.bytes, n.mime, n.name),
    setContent: s => { n.bytes = Buffer.from(s, 'utf8'); n.updated = ++clock; }
  };
}
const DriveApp = {
  getFoldersByName: name => iter([...items.values()].filter(x => x.kind === 'folder' && x.name === name).map(wrapNode)),
  getFilesByName: name => iter([...items.values()].filter(x => x.kind === 'file' && x.name === name).map(wrapNode)),
  getFileById: id => { const n = items.get(id); if (!n) throw new Error('No item with the given ID'); return wrapNode(n); },
  createFolder: name => node('folder', name, null)
};
const Utilities = {
  base64Decode: s => [...Buffer.from(s, 'base64')],
  base64Encode: b => Buffer.from(b).toString('base64'),
  newBlob: (bytes, mime, name) => mkBlob(Buffer.from(bytes), mime, name)
};
const ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput: s => ({ text: s, setMimeType() { return this; } })
};

const SECRET = 'סוד-אקראי-ארוך-מאוד-לבדיקה';
const gs = vm.createContext({ DriveApp, Utilities, ContentService, JSON, String, Number, Error });
vm.runInContext(readFileSync(new URL('../tools/bridge.gs', import.meta.url), 'utf8')
  .replace(/var SECRET = '[^']*';/, "var SECRET = '" + SECRET + "';"), gs);
const post = body => JSON.parse(gs.doPost({ postData: { contents: JSON.stringify(body) } }).text);

/* ---------- מה שהתקציב השאיר בדרייב ---------- */
const docsFolder = node('folder', 'HomeBudget מסמכים', null);
const put = name => docsFolder.createFile({ name, bytes: Buffer.from(PNG, 'base64'), mime: 'image/png' }).getId();
const fV7 = put('voucher-7.png'), fV8 = put('voucher-8.png'), fG4 = put('guarantee-4.png'),
      fAr = put('arnona.png'), fOld = put('old.png');
const elsewhere = node('folder', 'פרטי', null);
const fOutside = elsewhere.createFile({ name: 'secret.png', bytes: Buffer.from(PNG, 'base64'), mime: 'image/png' }).getId();

const budgetDocs = [
  { id: 'bd-v7', name: 'voucher-7.png', title: 'שובר תשלום 7', mime: 'image/png', size: 70, docType: 'voucher',
    docDate: '2025-08-12', amount: 84210, linkedPaymentId: 'p7', summary: 'תשלום שביעי לפי לוח התשלומים',
    text: 'לתשלום עד 20.08.2025 שובר מס׳ 7 מתוך 10 לפי לוח התשלומים', driveFileId: fV7, createdAt: '2025-08-12T10:00:00Z' },
  { id: 'bd-v8', name: 'voucher-8.png', title: 'שובר תשלום 8', mime: 'image/png', size: 70, docType: 'voucher',
    docDate: '2025-11-02', amount: 85100, linkedPaymentId: 'p8', summary: '', text: '', driveFileId: fV8, createdAt: '2025-11-02T10:00:00Z' },
  { id: 'bd-g4', name: 'guarantee-4.png', title: 'ערבות בנקאית 4', mime: 'image/png', size: 70, docType: 'guarantee',
    docDate: '2025-09-02', amount: 412000, summary: 'ערבות חוק המכר מבנק לאומי', text: 'ערבות מספר LG-77310-4 בתוקף עד 30.11.2026',
    driveFileId: fG4, createdAt: '2025-09-02T10:00:00Z' },
  { id: 'bd-ar', name: 'arnona.png', title: 'הודעת ארנונה', mime: 'image/png', size: 70, docType: 'c-arnona',
    docDate: '2026-01-05', amount: 1260, driveFileId: fAr, createdAt: '2026-01-05T10:00:00Z' },
  { id: 'bd-old', name: 'old.png', title: 'מכתב מהיזם', mime: 'image/png', size: 70, docType: 'c-deleted',
    docDate: '2024-04-01', amount: 0, driveFileId: fOld, createdAt: '2024-04-01T10:00:00Z' },
  { id: 'bd-local', name: 'scan.png', title: 'סריקה שלא עלתה', mime: 'image/png', size: 70, docType: 'receipt',
    docDate: '2026-02-01', amount: 900, driveFileId: '', createdAt: '2026-02-01T10:00:00Z' }
];
const backup = {
  transactions: [{ id: 'tx1', vendor: 'סופר', amount: 230 }],
  accounts: [{ id: 'acc', name: 'עו"ש' }],
  property: { name: 'דירה בנתניה' },
  propertyPayments: [{ id: 'p7', paymentNumber: 7 }, { id: 'p8', paymentNumber: 8 }],
  propertyDocs: budgetDocs,
  propertyDocCats: [{ id: 'c-arnona', label: 'ארנונה', icon: 'ic:folder' }],
  exportedAt: '2026-10-06T08:00:00Z'
};
/* עותק ישן של הגיבוי, כמו שמכשיר שני משאיר — הגשר חייב לבחור בעדכני */
node('file', 'finance-app-backup.json', null, { bytes: Buffer.from(JSON.stringify({ propertyDocs: [] })), mime: 'application/json' });
const backupFile = node('file', 'finance-app-backup.json', null, { bytes: Buffer.from(JSON.stringify(backup)), mime: 'application/json' });
const writeBackup = () => backupFile.setContent(JSON.stringify(backup));

/* ---------- הגשר עצמו, בלי דפדפן ---------- */
console.log('\n— הגשר: קריאה בלבד, ורק מה שמותר —');
const man = post({ token: SECRET, action: 'linkManifest', source: 'homebudget' });
t('הרשימה נקראת מהגיבוי העדכני', man.ok && man.result.docs.length === 6, JSON.stringify(man).slice(0, 200));
t('ושם הנכס מגיע איתה', man.result.title === 'דירה בנתניה');
t('מספר התשלום נגזר מהתשלום המקושר', man.result.docs[0].payment === 7);
const leaked = JSON.stringify(man.result);
t('עסקאות וחשבונות אינם עוזבים את גוגל', !/סופר|tx1|עו"ש|transactions|accounts/.test(leaked));
t('מקור לא מוכר נדחה', !post({ token: SECRET, action: 'linkManifest', source: 'other' }).ok);
const outside = post({ token: SECRET, action: 'linkDownload', source: 'homebudget', fileId: fOutside });
t('קובץ מחוץ לתיקיית המסמכים נדחה', !outside.ok && /HomeBudget מסמכים/.test(outside.error), outside.error);
const inside = post({ token: SECRET, action: 'linkDownload', source: 'homebudget', fileId: fV7 });
t('קובץ בתוך התיקייה יורד', inside.ok && inside.result.data === PNG);
t('בלי הסוד — כלום', !post({ token: 'x', action: 'linkManifest', source: 'homebudget' }).ok);
t('אין פעולת מחיקה גם עכשיו', /פעולה לא מוכרת/.test(post({ token: SECRET, action: 'delete', fileId: fV7 }).error));

/* ---------- הדפדפן ---------- */
const URL_EXEC = 'https://script.google.com/macros/s/FAKE/exec';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let oldBridge = false;
const calls = [];

async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 920 }, locale: 'he-IL' });
  await ctx.route('https://script.google.com/**', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(name + ':' + body.action);
    if (oldBridge && /^link/.test(body.action)) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'פעולה לא מוכרת: ' + body.action }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(post(body)) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  await page.goto(BASE);
  await page.waitForSelector('.scr-title');
  await page.evaluate(async ([u, tk]) => {
    await window.Settings.set(window.CONFIG.K.bridgeUrl, u);
    await window.Settings.set(window.CONFIG.K.bridgeToken, tk);
    window.Sync.transport = window.App.transport();
  }, [URL_EXEC, SECRET]);
  return { page, errs, ctx };
}

const A = await device('A');
const p = A.page;
const count = a => calls.filter(c => c === a).length;
/* צילומי מסך לעין, לא לבדיקה. רק כש-SHOTS מצביע על תיקייה. */
const shot = async name => { if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/link-' + name + '.png', fullPage: true }); };

console.log('\n— נרמול, קבוצות וחיפוש —');
const pure = await p.evaluate(raw => {
  const L = window.Linked, src = L.source('homebudget');
  const m = L.normalize(src, raw);
  const g = L.groups(m);
  return {
    cats: m.cats.map(c => c.id),
    custom: m.cats.filter(c => c.custom).map(c => c.label),
    oldCat: L.find(m, 'bd-old').cat,
    groups: g.map(x => x.cat.id + ':' + x.docs.length),
    order: g[0].docs.map(d => d.id),
    s1: L.search(m, 'שובר 7').map(d => d.id),
    s2: L.search(m, '84,210').map(d => d.id),
    s3: L.search(m, '12/08/2025').map(d => d.id),
    s4: L.search(m, 'LG-77310').map(d => d.id),
    s5: L.search(m, 'שובר 9').map(d => d.id),
    snip: L.snippet(L.find(m, 'bd-g4'), L.tokens('lg-77310')),
    type1: L.typeFor(src, 'guarantee', 'home'),
    type2: L.typeFor(src, 'c-arnona', 'home'),
    type3: L.typeFor(src, 'insurance', 'person')
  };
}, man.result);
t('קטגוריה שהמשתמש הוסיף בתקציב מגיעה כקבוצה, אחרי המובנות', pure.custom[0] === 'ארנונה' && pure.cats[pure.cats.length - 1] === 'c-arnona');
t('מסמך שהקטגוריה שלו נמחקה עובר ל"כלליים", כמו במקור', pure.oldCat === 'general');
t('קבוצות ריקות אינן מוצגות', pure.groups.join(',') === 'voucher:2,receipt:1,guarantee:1,general:1,c-arnona:1', pure.groups.join(','));
t('בתוך קבוצה — חדש קודם, לפי תאריך המסמך', pure.order.join(',') === 'bd-v8,bd-v7');
t('חיפוש הוא AND על מילים', pure.s1.join(',') === 'bd-v7', pure.s1.join(','));
t('הסכום נמצא גם כשמקלידים אותו מעוצב', pure.s2.join(',') === 'bd-v7');
t('והתאריך גם בצורה המוצגת', pure.s3.join(',') === 'bd-v7');
t('החיפוש עובר על תוכן המסמך', pure.s4.join(',') === 'bd-g4');
t('מילה שאינה בשום מקום מצמצמת לאפס', pure.s5.length === 0);
t('התאמה בתוך התמלול מחזירה קטע עם המילה', pure.snip && pure.snip.hit === 'LG-77310', JSON.stringify(pure.snip));
t('ערבות מוצעת כ"ערבות חוק המכר"', pure.type1 === 'sale_guarantee');
t('קבוצה שאין לה הצעה — שואלים', pure.type2 === null);
t('הצעה לסוג שאינו מותר לישות אינה מוצעת', pure.type3 === null);

console.log('\n— קישור מההגדרות —');
await p.evaluate(async () => {
  await window.DB.saveEntity({ id: 'e-home', type: 'home', name: 'הדירה', color: '#4B6B7A', avatar: 'ה' });
});
await p.evaluate(() => { location.hash = '#/settings'; });
await p.waitForSelector('text=מסמכים מקושרים');
t('בהגדרות יש שורה לתיקיית התקציב', await p.isVisible('text=HomeBudget מסמכים'));
await p.click('.set-row:has-text("HomeBudget מסמכים") button');
await p.waitForSelector('.lfacts >> text=6 מסמכים');
await shot('setup');
t('הגיליון מראה מה יש שם לפני הקישור', await p.isVisible('text=אפס העלאה ואפס עותקים בדרייב'));
t('ומציע את הישות הקיימת', await p.isVisible('.lpick .card[aria-pressed="true"] >> text=הדירה'));
await p.click('.sheet button.btn.wide:has-text("קשר")');
await p.waitForSelector('.lmirror');
const linked = await p.evaluate(() => window.DB.get('entities', 'e-home'));
t('הישות נושאת את הקישור', linked.link && linked.link.source === 'homebudget');

console.log('\n— הישות המקושרת —');
t('שני מדפים: בכספת ומהתקציב', await p.isVisible('.lsec-h >> text=בכספת') && await p.isVisible('.lsec-h >> text=מהתקציב'));
t('הקבוצות מוצגות מקופלות, עם מספר', (await p.locator('.lgrp').count()) === 5 && (await p.locator('.ldoc').count()) === 0);
await p.click('.lgrp[data-cat="voucher"]');
t('פתיחת קבוצה מציגה את המסמכים שלה', (await p.locator('.ldoc').count()) === 2);
t('עם הסכום', await p.isVisible('.ldoc >> text=₪84,210'));
await shot('entity');
await p.fill('.lmirror .search-i', 'LG-77310');
await p.waitForSelector('.lsnip mark');
t('חיפוש מציג את הקטע מתוך התמלול', (await p.textContent('.lsnip mark')) === 'LG-77310');
const focused = await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('search-i'));
t('ההקלדה אינה מחליפה את השדה', focused);
await shot('search');
await p.fill('.lmirror .search-i', '');

await p.evaluate(() => { location.hash = '#/entities'; });
await p.waitForSelector('.atile');
await shot('home');
t('באריח בלוח הנכסים יש תג "התקציב"', await p.isVisible('.atile-link >> text=התקציב'));

console.log('\n— מסמך במראה —');
const before = count('A:linkDownload');
await p.evaluate(() => { location.hash = '#/linked/e-home/bd-v7'; });
await p.waitForSelector('.anchor-wrap img');
t('הקובץ יורד מהמקור כשנוגעים בו', count('A:linkDownload') === before + 1);
await shot('doc');
t('קריאה בלבד, ונאמר איפה עורכים', await p.isVisible('text=עריכה, שינוי קבוצה ומחיקה נעשים באפליקציית התקציב'));
t('מספר התשלום מוצג', await p.isVisible('.row >> text=#7') || await p.isVisible('text=#7'));
await p.evaluate(() => { location.hash = '#/entity/e-home'; });
await p.waitForSelector('.lmirror');
await p.evaluate(() => { location.hash = '#/linked/e-home/bd-v7'; });
await p.waitForSelector('.anchor-wrap img');
t('בפעם השנייה — מהקאש, בלי רשת', count('A:linkDownload') === before + 1);

console.log('\n— הוספה לכספת —');
await p.evaluate(() => { location.hash = '#/linked/e-home/bd-g4'; });
await p.waitForSelector('button:has-text("הוסף לכספת")');
await p.click('button:has-text("הוסף לכספת")');
await p.waitForSelector('.lpick');
await shot('promote');
t('הסוג המוצע ראשון ומסומן', (await p.textContent('.lpick .card:first-child .card-t')) === 'ערבות חוק המכר'
  && (await p.getAttribute('.lpick .card:first-child', 'aria-pressed')) === 'true');
const upBefore = count('A:upload');
await p.click('.lpick .card:first-child');
await p.waitForURL(/#\/doc\/.+\/edit/);
const promoted = await p.evaluate(() => window.DB.listDocs().then(ds => ds.filter(d => d.source === 'link')[0]));
t('נוצר מסמך כספת', promoted && promoted.typeKey === 'sale_guarantee' && promoted.entityId === 'e-home');
const pf = promoted.files[0];
t('הקובץ שלו הוא הקובץ של התקציב', pf.driveFileId === fG4 && pf.src === 'homebudget' && pf.srcId === 'bd-g4');
t('הסכום כבר ממולא', promoted.fields.some(f => f.key === 'amount' && f.value === '₪412,000'));
t('התאריך והתקציר עברו', promoted.issueDate === '2025-09-02' && /לאומי/.test(promoted.notes));
await p.evaluate(() => window.Sync.run({ silent: true }));
t('הסנכרון אינו מעלה אותו שוב', count('A:upload') === upBefore, String(count('A:upload') - upBefore));
const remote = post({ token: SECRET, action: 'getDb' }).result.db;
const rdoc = remote.docs.filter(d => d.id === promoted.id)[0];
t('db.json נושא את הסימון, בלי blobId', rdoc && rdoc.files[0].src === 'homebudget' && rdoc.files[0].srcId === 'bd-g4' && !('blobId' in rdoc.files[0]));

await p.evaluate(() => { location.hash = '#/entity/e-home'; });
await p.waitForSelector('.lmirror');
t('במדף "בכספת" — המסמך החדש', await p.isVisible('.dcard >> text=ערבות בנקאית 4'));
t('ובקבוצה במראה — "1 מתוך 1 בכספת"', await p.isVisible('.lgrp[data-cat="guarantee"] >> text=1 מתוך 1 בכספת'));
await p.evaluate(id => { location.hash = '#/doc/' + id; }, promoted.id);
await p.waitForSelector('text=הקובץ נשאר באפליקציית התקציב ולא הועלה שוב');
t('מסך המסמך אומר מאיפה הקובץ', true);

console.log('\n— עריכת הישות אינה מנתקת —');
await p.evaluate(() => { location.hash = '#/entity/e-home'; });
await p.waitForSelector('.lmirror');
await p.click('button[aria-label="עריכת ישות"]');
await p.fill('#e-name', 'דירה בנתניה');
await p.click('.sheet button:has-text("שמירה")');
await p.waitForSelector('.scr-title:has-text("דירה בנתניה")');
const renamed = await p.evaluate(() => window.DB.get('entities', 'e-home'));
t('שינוי שם שומר את הקישור', renamed.link && renamed.link.source === 'homebudget');

console.log('\n— מכשיר שני —');
const B = await device('B');
await B.page.evaluate(() => window.Sync.run({ silent: true }));
const bdoc = await B.page.evaluate(id => window.DB.get('docs', id), promoted.id);
t('המסמך הגיע עם הסימון', bdoc && bdoc.files[0].src === 'homebudget');
t('והקובץ ירד מהמקור, לא מ-DocVault', !!bdoc.files[0].blobId && count('B:linkDownload') >= 1 && count('B:download') === 0);

console.log('\n— שינויים בתקציב —');
backup.propertyDocCats.push({ id: 'c-repairs', label: 'תיקונים', icon: 'ic:folder' });
backup.propertyDocs.push({ id: 'bd-new', name: 'repair.png', title: 'הצעת מחיר לתיקון', mime: 'image/png', size: 70,
  docType: 'c-repairs', docDate: '2026-10-01', amount: 3400, driveFileId: put('repair.png'), createdAt: '2026-10-01T10:00:00Z' });
backup.propertyDocs = backup.propertyDocs.filter(d => d.id !== 'bd-g4');
writeBackup();
await p.click('.mirror-h button');
await p.waitForSelector('.lgrp[data-cat="c-repairs"]');
t('קטגוריה חדשה בתקציב מופיעה כקבוצה חדשה', await p.isVisible('.lgrp[data-cat="c-repairs"] >> text=תיקונים'));
await p.waitForSelector('.lorphan');
await shot('orphan');
t('מסמך שנמחק בתקציב ושמור בכספת — מוכרז', await p.isVisible('text=נמחק באפליקציית התקציב, אבל הוא שמור בכספת'));
const upB = count('A:upload');
await p.click('.lacts button:has-text("שמור עותק בכספת")');
await p.waitForFunction(id => window.DB.get('docs', id).then(d => !d.files[0].src), promoted.id);
await p.evaluate(() => window.Sync.run({ silent: true }));
const kept = await p.evaluate(id => window.DB.get('docs', id), promoted.id);
t('"שמור עותק" — הפעם היחידה שקובץ מועלה', count('A:upload') === upB + 1 && !!kept.files[0].driveFileId && kept.files[0].driveFileId !== fG4);
await p.evaluate(() => window.App.render());
await p.waitForSelector('.lmirror');
t('ואז ההכרזה נעלמת', (await p.locator('.lorphan').count()) === 0);

console.log('\n— כשאין דרך לקרוא —');
oldBridge = true;
await p.click('.mirror-h button');
await p.waitForSelector('.lmirror .notice-warn');
t('גשר ישן — ההודעה אומרת לעדכן אותו', /הגשר צריך עדכון/.test(await p.textContent('.lmirror .notice-warn')));
oldBridge = false;
const why = await p.evaluate(async () => {
  await window.Settings.set(window.CONFIG.K.backupMode, 'oauth');
  window.Sync.transport = window.App.transport();
  return { ready: window.Linked.ready(), why: window.Linked.whyNot() };
});
t('בהתחברות לגוגל — לא זמין, ומוסבר למה', !why.ready && /גשר/.test(why.why), why.why);
await p.evaluate(() => window.App.render());
await p.waitForSelector('.lmirror');
t('והמראה עדיין מוצג מהקאש', (await p.locator('.lgrp').count()) > 0);

console.log('\n— שגיאות —');
const errs = A.errs.concat(B.errs).filter(e => !/status of (4|5)\d\d|net::/.test(e));
t('אפס שגיאות', errs.length === 0, errs.join(' | '));

await browser.close();
console.log('\nסה״כ: ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
