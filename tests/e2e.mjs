import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
const SP = process.env.FIXTURES || '.';
let pass = 0, fail = 0;
const errs = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ' :: ' + extra : '')); }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({
  viewport: { width: 420, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
  locale: 'he-IL'
});
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

await page.goto(BASE);
await page.waitForSelector('.scr-title');

console.log('\n— אתחול —');
t('נטען בלי שגיאות קונסול', errs.length === 0, errs.join(' | '));
t('כותרת מסך הבית', (await page.textContent('.scr-title')) === 'התיק המשפחתי');
t('מסך הבית הוא ישויות', (await page.evaluate(() => location.hash)) === '#/entities',
  await page.evaluate(() => location.hash));
t('והוא הפריט הימני בסרגל', await page.evaluate(() => {
  const items = [...document.querySelectorAll('.nav-i')];
  const right = items.reduce((a, b) => a.getBoundingClientRect().right > b.getBoundingClientRect().right ? a : b);
  return right.dataset.hash === '#/entities';
}));
t('מצב ריק עם פעולה בתוך המסגרת', await page.isVisible('.empty .btn'));
t('data-pal הוצב לפני CSS', (await page.getAttribute('html', 'data-pal')) === 'a');

// ---------- entities ----------
console.log('\n— ישויות —');
async function newEntity(name, type) {
  await page.click('.nav-i[data-hash="#/entities"]');
  await page.click('.scr-actions .iconbtn, .empty .btn');
  await page.waitForSelector('#e-name');
  await page.fill('#e-name', name);
  await page.selectOption('#e-type', type);
  await page.click('.sheet-actions .btn:not(.ghost)');
  await page.waitForSelector('.backdrop', { state: 'detached' });
}
await newEntity('ליאור', 'person');
await newEntity('מאזדה 3', 'vehicle');
await newEntity('הבית', 'home');
t('שלוש ישויות נוצרו', (await page.locator('.card').count()) === 3);

// ---------- manual doc ----------
console.log('\n— מסמך ידני —');
async function newDoc(entityName, typeKey, fill, dates) {
  await page.click('.fab');
  await page.waitForSelector('.routes');
  await page.click('.routes .route:has-text("הזנה ידנית")');
  await page.waitForSelector('#d-type');
  const ents = await page.$$eval('#d-entity option', o => o.map(x => ({ v: x.value, t: x.textContent })));
  const ent = ents.find(e => e.t === entityName);
  await page.selectOption('#d-entity', ent.v);
  await page.selectOption('#d-type', typeKey);
  await page.waitForSelector('#d-title');
  for (const [k, v] of Object.entries(fill)) await page.fill('#f-' + k, v);
  if (dates?.expiry) {
    if (!(await page.isVisible('#d-expiry'))) await page.click('.btn.ghost.wide');
    await page.fill('#d-expiry', dates.expiry);
  }
  if (dates?.issue) await page.fill('#d-issue', dates.issue);
  await page.click('#doc-save');
  await page.waitForSelector('.doc-head', { timeout: 4000 });
}

const today = new Date();
const ymd = d => new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);

await newDoc('ליאור', 'id_card', { idNumber: '123456782', fullName: 'ליאור כהן' }, { expiry: ymd(400) });
t('מסמך נשמר ונפתח', await page.isVisible('.rows .row'));
t('שדה ת״ז ממוסך כברירת מחדל', (await page.textContent('.rows .row:first-child .row-v')).includes('••••'));
t('כפתור עין קיים', await page.isVisible('.rows .row .eye'));

// masked copy copies the FULL value
await page.click('.rows .row:first-child');
const clip1 = await page.evaluate(() => navigator.clipboard.readText());
t('העתקה ממוסכת מעתיקה ערך מלא', clip1 === '123456782', clip1);
t('toast הופיע', await page.isVisible('.toast.show'));
t('המסך לא נחשף אחרי העתקה', (await page.textContent('.rows .row:first-child .row-v')).includes('••••'));

await page.click('.rows .row:first-child .eye');
t('עין חושפת', (await page.textContent('.rows .row:first-child .row-v')) === '123456782');
await page.click('.rows .row:first-child .eye');

// invalid check digit is kept and flagged
await newDoc('ליאור', 'driving_license', { idNumber: '123456783', licenseNumber: '4183920' }, { expiry: ymd(12) });
const flagged = await page.textContent('.rows');
t('שדה שנכשל בוולידציה נשמר', flagged.includes('4183920'));
t('ומסומן לאימות', (await page.locator('.chip.verify').count()) > 0);

// ---------- all 14 types ----------
console.log('\n— כל 14 הסוגים —');
const types = await page.evaluate(() => window.DOC_TYPES.all().map(t => ({
  key: t.key, expiry: t.expiry, ent: t.entityTypes[0],
  req: t.fields.filter(f => f.required).map(f => ({ key: f.key, kind: f.kind }))
})));
t('הטבלה מכילה 14 שורות', types.length === 14, String(types.length));

const sample = { id: '123456782', plate: '8452103', policy: 'PL2291043', passport: 'M4821639', text: 'בדיקה', date: ymd(30), phone: '0524418890' };
const entName = { person: 'ליאור', vehicle: 'מאזדה 3', home: 'הבית' };
let made = 1 + 1; // already created two
for (const ty of types) {
  if (ty.key === 'id_card' || ty.key === 'driving_license') continue;
  const fill = {};
  ty.req.forEach(f => { fill[f.key] = sample[f.kind] || 'בדיקה'; });
  await newDoc(entName[ty.ent] || 'ליאור', ty.key, fill, { expiry: ymd(45) });
  made++;
}
t('נוצר מסמך מכל אחד מ-14 הסוגים', made === 14, String(made));

// passport must not offer files
await page.click('.nav-i[data-hash="#/entities"]');
await page.click('.card >> nth=0');
const titles = await page.$$eval('.card-t', e => e.map(x => x.textContent));
t('כרטיסי הישות מציגים מסמכים', titles.length > 0);

// ---------- search ----------
console.log('\n— חיפוש גלובלי —');
await page.click('.nav-i[data-hash="#/quick"]');
await page.waitForSelector('.search-i');
await page.fill('.search-i', '84521');
await page.waitForTimeout(250);
const hits = await page.locator('.rows .row').count();
t('חיפוש "84521" מוצא לוחית 84-521-03', hits > 0, String(hits));
t('התוצאה נושאת שם ישות ומסמך', (await page.locator('.row-sub').count()) > 0);
await page.click('.rows .row >> nth=0');
const clip2 = await page.evaluate(() => navigator.clipboard.readText());
t('העתקה ממסך החיפוש', clip2.length > 0, clip2);

await page.fill('.search-i', '');
await page.waitForTimeout(250);
t('לפני הקלדה מוצגים "אחרונים"', (await page.textContent('.scr')).includes('אחרונים'));

// ---------- expiry ----------
console.log('\n— מנוע התפוגה —');
const buckets = await page.evaluate(() => {
  const E = window.Expiry;
  return {
    zero: E.bucket(0), neg: E.bucket(-3), a: E.bucket(1), b: E.bucket(30),
    c: E.bucket(31), d: E.bucket(90), e: E.bucket(91), none: E.bucket(null)
  };
});
t('daysLeft=0 נכנס ל-past', buckets.zero === 'past', buckets.zero);
t('שלילי → past', buckets.neg === 'past');
t('1..30 → d30', buckets.a === 'd30' && buckets.b === 'd30');
t('31..90 → d90', buckets.c === 'd90' && buckets.d === 'd90');
t('91+ → ok', buckets.e === 'ok');
t('ללא תאריך → null', buckets.none === null);

const dstSafe = await page.evaluate(() => {
  // תאריך שחוצה מעבר שעון קיץ בישראל
  const t = new Date(2026, 2, 1);
  return window.U.daysBetween('2026-04-01', t);
});
t('חישוב חוצה שעון קיץ נותר שלם', dstSafe === 31, String(dstSafe));

await page.click('.nav-i[data-hash="#/expiries"]');
// לחכות למסך עצמו ולא ל-.bucket-h: הכותרת "אחרונים" במסך החיפוש חולקת
// את אותה מחלקה, ומספקת את ההמתנה עוד לפני שהרינדור התחלף
await page.waitForFunction(() =>
  location.hash === '#/expiries' &&
  document.querySelector('.scr-title')?.textContent === 'תפוגות');
await page.waitForSelector('.bucket-h');
const homeText = await page.textContent('.scr');
t('מסך הבית מקבץ לדליים', homeText.includes('עד 30 יום') || homeText.includes('עד 90 יום'), homeText.slice(0, 160));
t('הדלי "תקין" מקופל מאחורי שורה אחת', homeText.includes('תקין ·'), homeText.slice(0, 160));

// הבאנר היומי עבר עם מסך הבית — בלעדיו מנוע התפוגה מאבד את המשטח בפתיחה
t('אין באנר תפוגה במסך התפוגות עצמו', !homeText.includes('דורשים טיפול'));
await page.goto(BASE + '#/entities');
await page.waitForSelector('.card');
t('הבאנר יושב במסך הבית', (await page.textContent('.scr')).includes('דורש'),
  (await page.textContent('.scr')).slice(0, 90));

// ---------- files: all four routes ----------
console.log('\n— ארבעת מסלולי הקלט —');
await page.click('.nav-i[data-hash="#/entities"]');
await page.click('.card >> nth=0');
await page.click('.card >> nth=0');
await page.waitForSelector('.files');
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('.files .btn')
]);
await chooser.setFiles(SP + '/shot.png');
await page.waitForTimeout(700);
t('מסלול 1 — בחירת קובץ', (await page.locator('.file-row').count()) > 0);
t('גודל הקובץ מוצג', (await page.textContent('.files')).match(/ב׳|KB|MB/) !== null);

const camAccept = await page.evaluate(() => {
  window.App.pickFiles(null, true);
  const i = document.querySelector('input[type=file]');
  return { cap: i.getAttribute('capture'), accept: i.getAttribute('accept'), multiple: i.multiple };
});
t('מסלול 2 — מצלמה מגדירה capture', camAccept.cap === 'environment');
t('accept נכון', camAccept.accept === 'image/*,application/pdf');
t('ריבוי קבצים למסמך אחד', camAccept.multiple === true);

const pasteOk = await page.evaluate(async () => {
  const dt = new DataTransfer();
  const blob = await (await fetch('/index.html')).blob();
  dt.items.add(new File([blob], 'p.png', { type: 'image/png' }));
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  return ev.defaultPrevented;
});
t('מסלול 3 — הדבקה נקלטת', pasteOk === true);

await page.waitForTimeout(400);
const dropOk = await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([1,2,3])], 'd.pdf', { type: 'application/pdf' }));
  const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
  document.body.dispatchEvent(ev);
  return ev.defaultPrevented;
});
t('מסלול 4 — גרירה נקלטת', dropOk === true);

// ההדבקה חייבת להיות גלויה בגיליון ההוספה ולא רק דרך Ctrl+V
await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');
await page.click('.fab');
await page.waitForSelector('.routes');
const routeLabels = await page.$$eval('.route-t', e => e.map(x => x.textContent));
t('להדבקה יש כפתור משלה בגיליון ההוספה',
  routeLabels.some(l => l.includes('הדבקה')), routeLabels.join(' · '));
t('וארבעת המסלולים גלויים',
  routeLabels.length === 5, routeLabels.join(' · '));

await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = c.height = 24;
  const x = c.getContext('2d'); x.fillStyle = '#357'; x.fillRect(0, 0, 24, 24);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
});
await page.click('.route:has-text("הדבקה")');
await page.waitForSelector('#d-type', { timeout: 10000 });
t('הכפתור קורא את הלוח ומצרף את התמונה',
  (await page.locator('.staged .file-row').count()) === 1);

// ואם הדפדפן לא נותן לקרוא את הלוח — יעד הדבקה ידני, לא כפתור מת
await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');
await page.evaluate(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { read: () => Promise.reject(new Error('חסום')) }
  });
});
await page.click('.fab');
await page.waitForSelector('.routes');
await page.click('.route:has-text("הדבקה")');
await page.waitForSelector('.paste-target', { timeout: 5000 });
t('לוח חסום → נפתח יעד הדבקה ידני', await page.isVisible('.paste-target'));
// גיליון ההוספה עדיין נסגר ברקע, אז מכוונים לגיליון שמכיל את היעד
t('וההודעה מסבירה למה',
  (await page.textContent('.sheet:has(.paste-target)')).includes('לא נתן לקרוא'),
  (await page.textContent('.sheet:has(.paste-target)')).slice(0, 70));

const pastedIn = await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' }));
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  document.querySelector('.paste-target').dispatchEvent(ev);
  return ev.defaultPrevented;
});
t('הדבקה לתוך היעד נקלטת', pastedIn === true);

// ---------- persistence ----------
console.log('\n— התמדה ואופליין —');
await page.goto(BASE + '#/entities');
await page.waitForSelector('.card');
const afterReload = await page.locator('.card').count();
t('רענון דף שומר את הישויות', afterReload === 3, String(afterReload));
const docCount = await page.evaluate(() => window.DB.listDocs().then(d => d.length));
t('רענון דף שומר את המסמכים', docCount >= 12, String(docCount));

await ctx.setOffline(true);
await page.goto(BASE + '#/quick').catch(() => {});
await ctx.setOffline(false);

// ---------- privacy + palette + typeface ----------
console.log('\n— הגדרות —');
await page.goto(BASE + '#/settings');
await page.waitForSelector('.sect');
await page.click('.seg-b >> nth=2');                       // palette C
await page.waitForTimeout(120);
t('החלפת פלטה משנה data-pal', (await page.getAttribute('html', 'data-pal')) === 'c');
const pastC = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--exp-past-fg').trim());
t('פלטה C דורסת את האדום של "פג"', pastC === '#9B1C2E', pastC);
await page.reload();
await page.waitForSelector('.sect');
t('הפלטה שורדת רענון בלי הבזק', (await page.getAttribute('html', 'data-pal')) === 'c');
await page.click('.seg-b >> nth=0');

await page.click('.switch');
await page.waitForTimeout(120);
t('מצב פרטיות מדליק את המחלקה', await page.evaluate(() => document.body.classList.contains('privacy')));
await page.click('.switch');

// ---------- PIN ----------
console.log('\n— שער PIN —');
await page.click('.sect >> nth=1 >> .btn');
await page.waitForSelector('.pad');
for (const d of ['1','2','3','4','1','2','3','4']) {
  await page.click(`.pad .key:has-text("${d}") >> nth=0`);
  await page.waitForTimeout(120);
}
await page.waitForSelector('.backdrop', { state: 'detached', timeout: 4000 });
t('PIN הוגדר', await page.evaluate(() => window.Vault.hasPin()));

await page.goto(BASE);
await page.waitForSelector('.lock');
t('מסך נעילה נפתח אחרי רענון', await page.isVisible('.lock'));
t('אין קישור לכיבוי במסך הנעילה', !(await page.textContent('.lock')).includes('כיבוי'));
t('אין input type=number במסך הנעילה', (await page.locator('.lock input').count()) === 0);
for (const d of ['9','9','9','9']) { await page.click(`.pad .key:has-text("${d}") >> nth=0`); await page.waitForTimeout(120); }
await page.waitForTimeout(200);
t('קוד שגוי לא פותח', await page.isVisible('.lock'));
for (const d of ['1','2','3','4']) { await page.click(`.pad .key:has-text("${d}") >> nth=0`); await page.waitForTimeout(120); }
await page.waitForSelector('.scr-title', { timeout: 4000 });
t('קוד נכון פותח', await page.isVisible('.nav'));

await page.goto(BASE + '#/settings');
await page.waitForSelector('.sect');
await page.click('.btn.ghost.danger');
await page.waitForSelector('.sheet-actions');
await page.click('.sheet-actions .btn.danger');
await page.waitForTimeout(400);
t('אפשר לכבות את שער ה-PIN', await page.evaluate(() => !window.Vault.enabled()));

await page.goto(BASE);
await page.waitForSelector('.scr-title');
t('אחרי כיבוי נפתח ישירות', !(await page.isVisible('.lock')));

console.log('\n— כתב —');
const fontOk = await page.evaluate(async () => {
  await document.fonts.ready;
  return document.fonts.check('16px Assistant');
});
t('Assistant נטען מקומית ולא נפל בשקט', fontOk === true);

console.log('\n— שגיאות קונסול —');
t('אפס שגיאות קונסול לאורך כל הריצה', errs.length === 0, errs.slice(0, 4).join(' | '));

await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
