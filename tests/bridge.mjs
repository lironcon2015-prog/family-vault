/* bridge.mjs — תחבורת הגשר, מול Apps Script מזויף.
   הגשר האמיתי הוא קובץ .gs שרץ אצל גוגל ואי אפשר להריץ אותו כאן; מה שכן
   נבדק הוא **כל מה שבצד הלקוח**, כולל הדבר שהכי קל לשבור בלי לשים לב:
   שהבקשה נשארת "פשוטה" ולכן אין preflight. */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 420, height: 920 }, locale: 'he-IL' });

/* ---------- Apps Script מזויף ---------- */
const URL_EXEC = 'https://script.google.com/macros/s/FAKE/exec';
const SECRET = 'סוד-אקראי-ארוך-מאוד-לבדיקה';
let store = { db: null, files: {} };
let seen = [];
let mode = 'ok';

await ctx.route('https://script.google.com/**', async route => {
  const req = route.request();
  seen.push({
    method: req.method(),
    headers: req.headers(),
    body: req.postData()
  });

  if (mode === 'html') {
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Google</html>' });
  }
  if (mode === 'down') return route.abort('failed');
  /* גשר שלא עונה לעולם — בדיוק מה ש-fetch לבדו אינו יודע להיחלץ ממנו.
     ההשהיה ארוכה מהתקרה שהבדיקה מציבה, ולכן התקרה היא שמכריעה. */
  if (mode === 'hang') { await new Promise(r => setTimeout(r, 8000)); return route.abort('failed'); }
  if (mode === 'http500') return route.fulfill({ status: 500, body: 'boom' });

  const body = JSON.parse(req.postData() || '{}');
  const reply = (o) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(o)
  });
  if (body.token !== SECRET) return reply({ ok: false, error: 'סוד שגוי' });

  switch (body.action) {
    case 'ping':     return reply({ ok: true, result: { name: 'DocVault' } });
    case 'getDb':    return reply({ ok: true, result: { db: store.db } });
    case 'putDb':    store.db = body.db; return reply({ ok: true, result: { id: 'db-1' } });
    case 'upload': {
      const id = 'f' + (Object.keys(store.files).length + 1);
      store.files[id] = { data: body.data, mime: body.mime, name: body.docId + '__' + body.name };
      return reply({ ok: true, result: { fileId: id } });
    }
    case 'download': {
      const f = store.files[body.fileId];
      if (!f) return reply({ ok: false, error: 'הקובץ אינו בתיקיית DocVault' });
      return reply({ ok: true, result: { name: f.name, mime: f.mime, data: f.data } });
    }
    default: return reply({ ok: false, error: 'פעולה לא מוכרת: ' + body.action });
  }
});

const page = await ctx.newPage();
/* שגיאות הרשת שהבדיקה **מייצרת בכוונה** (500, ניתוק) נרשמות בקונסול
   של הדפדפן. הן לא באג — הבאג היחיד שמעניין כאן הוא חריגה בקוד. */
const noise = /status of (4|5)\d\d|ERR_FAILED|net::/;
const errs = []; page.on('pageerror', e => errs.push(e.message));
page.on('console', m => {
  if (m.type() === 'error' && !noise.test(m.text())) errs.push(m.text());
});
await page.goto(BASE);
await page.waitForSelector('.scr-title');

const set = (url, token) => page.evaluate(async ([u, tk]) => {
  const S = window.Settings, C = window.CONFIG;
  await S.set(C.K.bridgeUrl, u);
  await S.set(C.K.bridgeToken, tk);
}, [url, token]);

/* ---------- הגדרה ---------- */
console.log('\n— הגדרה ומצב חיבור —');
t('בלי הגדרה, לא מחובר',
  (await page.evaluate(() => window.Bridge.connected())) === false);

const noConf = await page.evaluate(() =>
  window.Bridge.getDb().then(() => 'עבר', e => e.message));
t('וקריאה מחזירה הודעה שמפנה להגדרות', /הגשר לא הוגדר/.test(noConf), noConf);

await set(URL_EXEC, SECRET);
t('אחרי הדבקה — מחובר, בלי שום התחברות',
  (await page.evaluate(() => window.Bridge.connected())) === true);

/* זה הלב: אין סשן, ולכן אין מה לחדש. אותה בדיקה אחרי רענון. */
await page.reload();
await page.waitForSelector('.scr-title');
t('והחיבור שורד רענון בלי פופאפ',
  (await page.evaluate(() => window.Bridge.connected())) === true);

/* ---------- הבקשה נשארת פשוטה ---------- */
console.log('\n— בלי preflight —');
seen = [];
const ping = await page.evaluate(() => window.Bridge.connect());
t('ping מחזיר את שם התיקייה', ping === 'DocVault', ping);
t('שיטת הבקשה POST', seen[0] && seen[0].method === 'POST');
/* Content-Type מפורש היה מפעיל OPTIONS, ו-Apps Script אינו עונה עליו.
   זו האזהרה מנאביגו, והיא הדבר היחיד שנראה שרירותי כאן ואינו. */
t('אין Content-Type של JSON — אחרת יש preflight שהגשר לא עונה לו',
  !/application\/json/.test((seen[0] && seen[0].headers['content-type']) || ''),
  (seen[0] && seen[0].headers['content-type']) || '(אין)');
t('אף בקשה לא הייתה OPTIONS',
  seen.every(r => r.method !== 'OPTIONS'), seen.map(r => r.method).join(','));
t('הסוד נוסע בגוף ולא בכתובת',
  /"token"/.test(seen[0].body) && !/token=/.test(URL_EXEC));

/* ---------- מחזור מלא ---------- */
console.log('\n— db.json ---');
/* האפליקציה מסנכרנת מעצמה בעלייה, ומאחר שהגשר כבר מוגדר — היא כבר
   כתבה. זו בדיוק ההתנהגות הרצויה, ולכן מאפסים את הצד המרוחק כאן. */
store = { db: null, files: {} };
t('כספת ריקה מחזירה null',
  (await page.evaluate(() => window.Bridge.getDb())) === null);

await page.evaluate(() => window.Bridge.putDb({ version: 1, entities: [], docs: [] }));
const back = await page.evaluate(() => window.Bridge.getDb());
t('מה שנכתב חוזר', back && back.version === 1, JSON.stringify(back));

console.log('\n— blobs —');
const round = await page.evaluate(async () => {
  const bytes = new Uint8Array([1, 2, 3, 250, 251, 0, 255]);
  const id = await window.Bridge.uploadBlob('doc-1', 'רישיון.png',
    'image/png', new Blob([bytes], { type: 'image/png' }));
  const got = await window.Bridge.downloadBlob(id);
  const out = new Uint8Array(await got.arrayBuffer());
  return { id: id, mime: got.type, same: [...out].join(',') === [...bytes].join(',') };
});
t('העלאה מחזירה מזהה', round.id === 'f1', round.id);
t('והבייטים חוזרים זהים דרך base64', round.same === true);
t('וגם ה-mime', round.mime === 'image/png', round.mime);

const named = await page.evaluate(() => window.Bridge.call('download', { fileId: 'f1' }));
t('שם הקובץ נושא את מזהה המסמך כקידומת',
  named.name === 'doc-1__רישיון.png', named.name);

/* ---------- מסלולי כשל ---------- */
console.log('\n— כשלים שאומרים מה קרה —');
const tooBig = await page.evaluate(async () => {
  const big = new Blob([new Uint8Array(window.CONFIG.BRIDGE_MAX_BYTES + 1024)]);
  return window.Bridge.uploadBlob('d', 'x', 'application/octet-stream', big)
    .then(() => 'עבר', e => e.message);
});
t('קובץ מעל התקרה נעצר בצד הלקוח', /גדול מדי לגשר/.test(tooBig), tooBig);
t('וההודעה אומרת גם את הגודל וגם את התקרה',
  /MB/.test(tooBig), tooBig);

/* סוד באורך תקין אבל לא הנכון — כדי שהבדיקה תגיע לגשר ולא תיעצר ברצפה. */
await set(URL_EXEC, 'סוד-אחר-באותו-אורך-בדיוק');
const badSecret = await page.evaluate(() =>
  window.Bridge.getDb().then(() => 'עבר', e => e.message));
t('סוד שגוי מוחזר כשגיאת גשר', /סוד שגוי/.test(badSecret), badSecret);

/* הדיווח: סוד קצר, וההודעה שחזרה שלחה לחפש במקום הלא נכון. */
await set(URL_EXEC, 'קצר');
const shortSecret = await page.evaluate(() =>
  window.Bridge.getDb().then(() => 'עבר', e => e.message));
t('סוד קצר נדחה בצד הלקוח, בלי סיבוב לגשר',
  /קצר מדי/.test(shortSecret), shortSecret);
t('וההודעה אומרת את האורך שנמצא ואת הנדרש',
  /3 תווים/.test(shortSecret) && /16/.test(shortSecret), shortSecret);
t('ולא מבלבלת עם "לא הוגדר"', !/לא הוגדר/.test(shortSecret), shortSecret);
await set(URL_EXEC, SECRET);

mode = 'html';
const htmlBack = await page.evaluate(() =>
  window.Bridge.getDb().then(() => 'עבר', e => e.message));
t('תשובת HTML מסבירה שהכתובת אינה של Web app',
  /exec/.test(htmlBack), htmlBack);

mode = 'http500';
const boom = await page.evaluate(() =>
  window.Bridge.getDb().then(() => 'עבר', e => e.message));
t('שגיאת HTTP נושאת את הקוד', /500/.test(boom), boom);

mode = 'down';
const offline = await page.evaluate(() =>
  window.Bridge.getDb().then(() => 'עבר', e => e.message));
t('רשת נופלת מוסברת כרשת ולא כשגיאת גשר',
  /אין חיבור לגשר/.test(offline), offline);
mode = 'ok';

/* הדיווח: מחוון הסנכרון פועם בלי סוף. `fetch` שנתקע אינו נכשל, ולכן המנעול
   ב-Sync לא משתחרר ומחוון הסנכרון נשאר במצב 'start' לתמיד. */
mode = 'hang';
const hung = await page.evaluate(async () => {
  window.CONFIG.NET_TIMEOUT_MS = 400;          // התקרה, מוקטנת לבדיקה
  const t0 = Date.now();
  const msg = await window.Bridge.getDb().then(() => 'עבר', e => e.message);
  return { msg, ms: Date.now() - t0 };
});
t('בקשה תקועה נכשלת ולא נתלית', hung.msg !== 'עבר', hung.msg);
t('וההודעה אומרת שלא נענתה בזמן', /לא ענה בזמן/.test(hung.msg), hung.msg);
t('והיא נכשלת בזמן התקרה, לא אחריה', hung.ms < 3000, hung.ms + 'ms');
t('ולא מתחזה ל"אין חיבור"', !/אין חיבור/.test(hung.msg), hung.msg);

/* וזה מה שבאמת חשוב: אחרי כישלון כזה הסנכרון משתחרר ורץ שוב. */
const recovered = await page.evaluate(async () => {
  const r1 = await window.Sync.run({ silent: true });
  window.CONFIG.NET_TIMEOUT_MS = 30000;
  return { failed: !!(r1 && r1.error), busy: window.Sync.busy() };
});
t('הסנכרון שנכשל מדווח שגיאה', recovered.failed, JSON.stringify(recovered));
t('והמנעול משתחרר — האפליקציה מסנכרנת שוב', recovered.busy === false, String(recovered.busy));
mode = 'ok';
const after = await page.evaluate(() => window.Sync.run({ silent: true }));
t('והריצה הבאה עוברת', !after.error && !after.skipped, JSON.stringify(after));

/* ---------- החוזה מול הצינור ---------- */
console.log('\n— אותו חוזה כמו OAuth —');
const contract = await page.evaluate(() => {
  const need = ['connected', 'getDb', 'putDb', 'uploadBlob', 'downloadBlob'];
  return {
    bridge: need.filter(k => typeof window.Bridge[k] !== 'function'),
    drive: need.filter(k => typeof window.Drive[k] !== 'function')
  };
});
t('הגשר מממש את כל חמש הפונקציות', contract.bridge.length === 0, contract.bridge.join(','));
t('וגם OAuth — כלומר ההחלפה היא שורה אחת', contract.drive.length === 0, contract.drive.join(','));

const picked = await page.evaluate(async () => {
  const S = window.Settings, C = window.CONFIG;
  await S.set(C.K.backupMode, 'oauth');
  const a = window.App.transport() === window.Drive;
  await S.set(C.K.backupMode, 'bridge');
  const b = window.App.transport() === window.Bridge;
  return { a, b };
});
t('ההגדרה בוחרת את התחבורה', picked.a === true && picked.b === true);

const def = await page.evaluate(() => window.Settings.get(window.CONFIG.K.backupMode));
t('וברירת המחדל היא הגשר — זה שאינו מבקש התחברות', def === 'bridge', def);

/* ---------- הסנכרון עצמו רץ דרך הגשר ---------- */
console.log('\n— מחזור סנכרון מלא דרך הגשר —');
store = { db: null, files: {} };
const cycle = await page.evaluate(async () => {
  const DB = window.DB, U = window.U;
  await window.Settings.set(window.CONFIG.K.backupMode, 'bridge');
  window.Sync.transport = window.App.transport();

  await DB.saveEntity({ id: 'e1', type: 'person', name: 'איתמר', color: '#4B6B7A', avatar: 'א', sortOrder: 1 });
  const bid = U.id();
  await DB.saveDoc({
    id: 'd1', entityId: 'e1', typeKey: 'generic', title: 'תעודה',
    fields: [{ key: 'title', label: 'כותרת', value: 'תעודה', kind: 'text', sensitive: false, verified: true }],
    issueDate: null, expiryDate: null, source: 'upload', notes: '',
    supersededBy: null, deleted: 0,
    files: [{ blobId: bid, driveFileId: null, mime: 'image/png', name: 'a.png', size: 3 }]
  }, [{ id: bid, docId: 'd1', data: new Blob([new Uint8Array([9, 8, 7])]), mime: 'image/png', size: 3 }]);

  const r = await window.Sync.run({ silent: true });
  const doc = await DB.get('docs', 'd1');
  return { r: r, driveFileId: doc.files[0].driveFileId };
});
t('הסנכרון הושלם בלי התחברות', cycle.r && cycle.r.ok === true, JSON.stringify(cycle.r));
t('והקובץ קיבל מזהה מהגשר', !!cycle.driveFileId, String(cycle.driveFileId));

const uploaded = await page.evaluate(() => window.Bridge.getDb());
t('db.json הועלה עם הישות והמסמך',
  uploaded && uploaded.entities.length === 1 && uploaded.docs.length === 1,
  JSON.stringify(uploaded && { e: uploaded.entities.length, d: uploaded.docs.length }));
t('ו-blobId המקומי לא עזב את המכשיר',
  uploaded && uploaded.docs[0].files[0].blobId === undefined,
  JSON.stringify(uploaded && uploaded.docs[0].files[0]));

/* ---------- הקובץ .gs עצמו ---------- */
console.log('\n— bridge.gs —');
const gs = await page.evaluate(() => fetch('/tools/bridge.gs').then(r => r.text()));
t('קיים בריפו', gs.length > 500, String(gs.length));
/* DEC-48: הסוד ב-Script properties. ההתנהגות עצמה נבדקת ב-link.mjs, שמריץ
   את הקובץ מול PropertiesService מזויף. */
t('הסוד נקרא מ-Script properties ולא כתוב בקובץ',
  /getScriptProperties\(\)\.getProperty\('SECRET'\)/.test(gs) && !/^var SECRET\s*=/m.test(gs));
t('בודק את הסוד לפני כל פעולה, בזמן קבוע', /!_same\(String\(req\.token \|\| ''\), secret\)/.test(gs));
t('מסרב לרוץ בלי סוד, ואומר איפה מגדירים', /if \(!secret\)/.test(gs) && /Script properties → SECRET/.test(gs));
t('ומסרב לסוד קצר, בהודעה נפרדת עם האורך',
  /secret\.length < MIN_SECRET/.test(gs) && /קצר מדי/.test(gs));
/* מספר אחד בשני צדדים. אם הם ייפרדו, אחד הצדדים ידחה מה שהשני קיבל. */
t('הרצפה זהה בגשר ובאפליקציה',
  (gs.match(/MIN_SECRET = (\d+)/) || [])[1] === '16' &&
  /BRIDGE_MIN_SECRET: 16/.test(await page.evaluate(() => fetch('/js/config.js').then(r => r.text()))));
/* ההקשחה מול נאביגו: הורדה מאמתת שהקובץ בתיקייה שלנו, אחרת הסוד היה
   מפתח לכל קובץ בדרייב לפי מזהה. */
t('הורדה מאמתת שהקובץ בתוך DocVault', /_inVault\(file\)/.test(gs));
t('ואין בו פעולת מחיקה', !/\.setTrashed\(|removeFile\(/.test(gs));
t('התיקייה מסומנת ב-description כדי שתימצא מחדש', /setDescription\(MARKER\)/.test(gs));

/* התקלה שדווחה בהקמה בפועל: ריבוי חשבונות גוגל בדפדפן. היא אינה באג בקוד,
   ולכן הדרך היחידה למנוע אותה היא שההסבר יהיה בשלושת המקומות שמסתכלים בהם. */
const readme = await page.evaluate(() => fetch('/README.md').then(r => r.text()));
const scr = await page.evaluate(() => fetch('/js/screens.js').then(r => r.text()));
t('bridge.gs מסביר את תקלת authuser', /authuser/.test(gs));
t('README מסביר את תקלת authuser', /authuser/.test(readme));
t('וההסבר קיים גם בהגדרות באפליקציה', /authuser/.test(scr));
t('שלושתם מזהירים ש-‎/dev אינה הכתובת', /\/dev/.test(gs) && /`\/dev`/.test(readme) && /\/dev/.test(scr));

t('אפס שגיאות', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
