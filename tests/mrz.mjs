/* בדיקות MRZ — פרסינג, ספרות ביקורת, וקריאה מקצה לקצה דרך Tesseract מקומי. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ locale: 'he-IL' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

const net = [];
const origin = new URL(BASE).origin;
page.on('request', r => {
  const u = r.url();
  if (u.startsWith(origin) || u.startsWith('blob:') || u.startsWith('data:')) return;
  net.push(u);
});

await page.goto(BASE);
await page.waitForSelector('.scr-title');

// ---------- בניית דגימות תקינות ----------
const samples = await page.evaluate(() => {
  const cd = window.MRZ.checkDigit;
  const pad = (s, n) => String(s).padEnd(n, '<').slice(0, n);

  // TD3 — דרכון
  // 0-8 מספר · 9 ביקורת · 10-12 אזרחות · 13-18 לידה · 19 ביקורת · 20 מין
  // 21-26 תפוגה · 27 ביקורת · 28-41 אישי · 42 ביקורת אישי · 43 ביקורת מרכיבה
  const num3 = '12345678<';
  const birth3 = '850312', exp3 = '310804', personal3 = pad('', 14);
  const head3 = num3 + cd(num3) + 'ISR' + birth3 + cd(birth3) + 'F' +
                exp3 + cd(exp3) + personal3 + cd(personal3);
  const comp3 = head3.slice(0, 10) + head3.slice(13, 20) + head3.slice(21, 43);
  const td3 = [pad('P<ISRCOHEN<<MICHAL', 44), head3 + cd(comp3)];

  // TD1 — גב תעודת זהות ביומטרית
  const num1 = '004821639';
  const optional1 = pad('123456782', 15);            // ת״ז תקינה בשדה האופציונלי
  const l1 = 'I<ISR' + num1 + cd(num1) + optional1;
  const birth1 = '850312', exp1 = '310804';
  const head2 = birth1 + cd(birth1) + 'F' + exp1 + cd(exp1) + 'ISR' + pad('', 11);
  const composite = l1.slice(5, 30) + head2.slice(0, 7) + head2.slice(8, 15) + head2.slice(18, 29);
  const td1 = [l1, head2 + cd(composite), pad('COHEN<<LIOR', 30)];

  return { td3, td1 };
});

console.log('\n— פרסינג TD3 —');
const r3 = await page.evaluate(s => window.MRZ.parseTD3(s.td3), samples);
t('TD3 נקרא', r3.ok === true, r3.reason);
t('מספר מסמך', r3.ok && r3.fields.documentNumber === '12345678', r3.ok && r3.fields.documentNumber);
t('תאריך לידה מפוענח למאה הנכונה', r3.ok && r3.fields.birthDate === '1985-03-12', r3.ok && r3.fields.birthDate);
t('תאריך תפוגה', r3.ok && r3.fields.expiryDate === '2031-08-04', r3.ok && r3.fields.expiryDate);
t('שם מפורק', r3.ok && r3.fields.surname === 'COHEN' && r3.fields.givenNames === 'MICHAL', r3.ok && r3.fields.nameEn);
t('מדינה ואזרחות', r3.ok && r3.fields.issuingCountry === 'ISR' && r3.fields.nationality === 'ISR');

console.log('\n— פרסינג TD1 —');
const r1 = await page.evaluate(s => window.MRZ.parseTD1(s.td1), samples);
t('TD1 נקרא — זה מה שנאביגו לא יודעת לעשות', r1.ok === true, r1.reason);
t('מספר התעודה', r1.ok && r1.fields.documentNumber === '004821639', r1.ok && r1.fields.documentNumber);
t('תאריך לידה', r1.ok && r1.fields.birthDate === '1985-03-12', r1.ok && r1.fields.birthDate);
t('תאריך תפוגה', r1.ok && r1.fields.expiryDate === '2031-08-04', r1.ok && r1.fields.expiryDate);
t('שם מהשורה השלישית', r1.ok && r1.fields.surname === 'COHEN' && r1.fields.givenNames === 'LIOR', r1.ok && r1.fields.nameEn);

const foundId = await page.evaluate(s => {
  const r = window.MRZ.parseTD1(s.td1);
  return window.MRZ.israeliIdIn(r.fields.optional);
}, samples);
t('ת״ז נמצאת בשדה האופציונלי דרך ספרת הביקורת שלה', foundId === '123456782', foundId);

const noId = await page.evaluate(() => window.MRZ.israeliIdIn('999888777 000111222'));
t('רצף ספרות שאינו ת״ז תקינה לא נלקח', noId === '', noId);

console.log('\n— כשלים מובחנים —');
const fails = await page.evaluate(s => {
  const bad3 = s.td3.slice();
  bad3[1] = bad3[1].slice(0, 9) + '9' + bad3[1].slice(10);        // ספרת ביקורת שגויה
  const bad1 = s.td1.slice();
  bad1[0] = bad1[0].slice(0, 14) + '9' + bad1[0].slice(15);
  return {
    ck3: window.MRZ.parseTD3(bad3),
    ck1: window.MRZ.parseTD1(bad1),
    pattern3: window.MRZ.parseTD3(['X<ISRCOHEN', '1234']),
    none: window.MRZ.fromText('שלום עולם\nאין כאן שום דבר'),
    ckText: window.MRZ.fromText(bad3.join('\n'))
  };
}, samples);
t('ספרת ביקורת שגויה ב-TD3 → checkdigit', fails.ck3.ok === false && fails.ck3.reason === 'checkdigit', fails.ck3.reason);
t('ספרת ביקורת שגויה ב-TD1 → checkdigit', fails.ck1.ok === false && fails.ck1.reason === 'checkdigit', fails.ck1.reason);
t('שורה שאינה דרכון → pattern', fails.pattern3.reason === 'pattern', fails.pattern3.reason);
t('טקסט ללא MRZ → none', fails.none.reason === 'none', fails.none.reason);
t('הסיבה שורדת עד fromText — "זיהיתי ולא עבר" נבדל מ"לא זיהיתי"',
  fails.ckText.reason === 'checkdigit', fails.ckText.reason);
t('כשל לעולם אינו מחזיר שדות', fails.ck3.fields === null && fails.none.fields === null);

console.log('\n— זיהוי אוטומטי של הפורמט ---');
const auto = await page.evaluate(s => ({
  a: window.MRZ.fromText(s.td3.join('\n')),
  b: window.MRZ.fromText(s.td1.join('\n'))
}), samples);
t('fromText מזהה TD3', auto.a.ok && auto.a.format === 'TD3', auto.a.format);
t('fromText מזהה TD1', auto.b.ok && auto.b.format === 'TD1', auto.b.format);

console.log('\n— ניקוי רעש מילוי ---');
const noisy = await page.evaluate(s => {
  const l = s.td3.slice();
  l[0] = 'P<ISRCOHEN<<MICHAL<<<<LLLLLLLLLLLLLLLLLLLLLL';   // '<' נקרא כ-'L'
  return window.MRZ.parseTD3(l);
}, samples);
t('רצף אות חוזרת מהמילוי לא נכנס לשם', noisy.ok && noisy.fields.givenNames === 'MICHAL', noisy.ok && noisy.fields.givenNames);

console.log('\n— תיקון מילוי, שספרת הביקורת שופטת —');
const rep = await page.evaluate(s => {
  const noisy = s.td1.slice();
  // בדיוק מה שה-OCR מחזיר: מילוי '<' שנקרא כרצף L, בתוך אזור הביקורת
  noisy[1] = noisy[1].slice(0, 18) + 'LLLLLLLLLLL' + noisy[1].slice(29);
  const fixed = window.MRZ.fromText(noisy.join('\n'));

  // תיקון שאינו נכון פשוט לא עובר: משנים תאריך לידה, שהוא אזור מוגן
  const wrong = s.td1.slice();
  wrong[1] = '770101' + wrong[1].slice(6, 18) + 'LLLLLLLLLLL' + wrong[1].slice(29);
  const still = window.MRZ.fromText(wrong.join('\n'));

  return { fixed: { ok: fixed.ok, num: fixed.ok && fixed.fields.documentNumber }, still: still.ok };
}, samples);
t('מילוי שנקרא כאותיות מתוקן והקריאה עוברת', rep.fixed.ok === true);
t('והערך שיצא הוא המקורי', rep.fixed.num === '004821639', rep.fixed.num);
t('אבל תיקון לא מציל קריאה שגויה באמת', rep.still === false);

const nameNoise = await page.evaluate(s => {
  const l = s.td1.slice();
  l[2] = 'COHEN<<LIOR<<<<KLLLLKLKLKLKLK';
  const r = window.MRZ.parseTD1(l);
  return r.ok ? r.fields.givenNames : 'FAILED';
}, samples);
t('רעש דו-אותיות ארוך לא נכנס לשם', nameNoise === 'LIOR', nameNoise);

console.log('\n— קריאה מקצה לקצה דרך Tesseract מקומי —');
const t0 = Date.now();
const ocr = await page.evaluate(async (s) => {
  // מסמך אמיתי: שטח תוכן למעלה, MRZ בתחתית — שם read() מחפש אותו
  const draw = (lines, w) => {
    const c = document.createElement('canvas');
    c.width = 1400; c.height = 900;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#dedad2'; x.fillRect(60, 60, 500, 420);
    x.fillStyle = '#111';
    x.font = (w === 44 ? 46 : 62) + 'px "Courier New", monospace';
    x.textBaseline = 'top';
    const step = 80;
    const top = c.height - 40 - lines.length * step;
    lines.forEach((l, i) => x.fillText(l, 14, top + i * step));
    return new Promise(res => c.toBlob(res, 'image/png'));
  };
  const b3 = await draw(s.td3, 44);
  const b1 = await draw(s.td1, 30);
  const a = await window.MRZ.read(b3);
  const b = await window.MRZ.read(b1);
  return {
    a: { ok: a.ok, reason: a.reason, f: a.fields, m: a.message },
    b: { ok: b.ok, reason: b.reason, f: b.fields, m: b.message }
  };
}, samples);
console.log('  שניות:', ((Date.now() - t0) / 1000).toFixed(1));
t('דרכון נקרא מתמונה', ocr.a.ok === true, ocr.a.reason + ' ' + (ocr.a.m || ''));
t('ומספר המסמך נכון', ocr.a.ok && ocr.a.f.documentNumber === '12345678', ocr.a.ok && ocr.a.f.documentNumber);
t('ותאריך התפוגה נכון', ocr.a.ok && ocr.a.f.expiryDate === '2031-08-04', ocr.a.ok && ocr.a.f.expiryDate);
t('תעודת זהות נקראת מתמונה', ocr.b.ok === true, ocr.b.reason + ' ' + (ocr.b.m || ''));
t('ומספר התעודה נכון', ocr.b.ok && ocr.b.f.documentNumber === '004821639', ocr.b.ok && ocr.b.f.documentNumber);

/* ---------- דלג — DEC-43 ----------
   ה-OCR רץ על המכשיר ואי אפשר לקטוע אותו באמצע ריצה, ולכן מה שנבדק כאן
   הוא הדבר שמסוכן בו: הקריאה **ממשיכה** ברקע, והתוצאה שלה מגיעה למסך
   שכבר נפתח. דרכון הוא סוג ש`allowFiles:false`, כלומר הצעה שתגיע באיחור
   תמחק את הצילום מתחת לטופס הפתוח. */
console.log('\n— דלג בקריאה על המכשיר —');

const shot = await page.evaluate(async (s) => {
  const c = document.createElement('canvas');
  c.width = 1400; c.height = 900;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#111';
  x.font = '46px "Courier New", monospace';
  x.textBaseline = 'top';
  const top = c.height - 40 - s.td3.length * 80;
  s.td3.forEach((l, i) => x.fillText(l, 14, top + i * 80));
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const buf = await blob.arrayBuffer();
  let out = '';
  new Uint8Array(buf).forEach(b => { out += String.fromCharCode(b); });
  return btoa(out);
}, samples);

/* נקודת עגינה לרגע שבו הקריאה שרצה ברקע באמת הסתיימה. בלעדיה הבדיקה
   הייתה מודדת השהיה שרירותית ולא את מה שקרה כשהתוצאה הגיעה.

   **והיא גם שער.** בלי השער הבדיקה הייתה מרוץ: OCR שסיים לפני שהבדיקה
   הספיקה ללחוץ "דלג" מציב את ההצעה בצדק, ואז הבדיקה נכשלת על התנהגות
   נכונה — כישלון שנראה כמו רגרסיה ואינו. השער מחזיק את התוצאה עד
   שהדילוג כבר קרה, ולכן הסדר שהבדיקה מתיימרת לבדוק הוא הסדר שקורה. */
await page.evaluate(() => {
  window.__mrz = { done: false, type: null, release: null };
  const gate = new Promise(res => { window.__mrz.release = res; });
  const orig = window.Parse.fromMrz;
  window.Parse.fromMrz = function () {
    return orig.apply(this, arguments).then(r => gate.then(() => {
      window.__mrz.done = true;
      window.__mrz.type = r.typeKey;
      window.__mrz.drop = !!r.dropFiles;
      return r;
    }));
  };
});

/* בלי ישות אחת לפחות, מסך המסמך החדש הוא מסך ריק ואין בו טופס */
await page.evaluate(async () => {
  await window.DB.saveEntity({ id: window.U.id(), type: 'person', name: 'ליאור',
    color: '#4B6B7A', avatar: 'ל' });
});
await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');
await page.click('.fab');
await page.waitForSelector('.routes');
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('.route:has-text("סריקת דרכון")')
]);
await chooser.setFiles({ name: 'mrz.png', mimeType: 'image/png', buffer: Buffer.from(shot, 'base64') });

await page.waitForSelector('.sheet:has-text("קריאת המסמך")');
const onDevice = await page.textContent('.sheet:has-text("קריאת המסמך")');
t('גיליון הקריאה המקומית אומר שכלום לא נשלח', /לא נשלח/.test(onDevice));
t('ויש בו דלג', /דלג/.test(onDevice), onDevice.slice(0, 80));

const tSkip = Date.now();
await page.click('.sheet:has-text("קריאת המסמך") .btn:has-text("דלג")');
await page.waitForSelector('#d-type', { timeout: 5000 });
t('דלג אינו ממתין לסיום הקריאה', Date.now() - tSkip < 3000, String(Date.now() - tSkip) + 'ms');
t('הטופס נפתח עם הצילום מצורף', (await page.textContent('.scr')).includes('mrz.png'));

/* הדילוג קרה, המסך נמדד — ורק עכשיו התוצאה המאוחרת משוחררת */
await page.evaluate(() => window.__mrz.release());

await page.waitForFunction(() => window.__mrz && window.__mrz.done, null, { timeout: 90000 });
const late = await page.evaluate(() => ({
  type: window.__mrz.type, drop: window.__mrz.drop,
  proposal: window.App.proposal, staged: window.App.staged.length
}));
t('הקריאה ברקע אכן הצליחה — ויש מה להתעלם ממנו', late.type === 'passport', String(late.type));
t('והיא סוג שמוחק את הצילום', late.drop === true);
await page.waitForTimeout(300);
t('אחרי דילוג ההצעה המאוחרת אינה מוצבת', late.proposal === null, JSON.stringify(late.proposal));
t('והצילום לא נמחק מתחת לטופס הפתוח', late.staged === 1, String(late.staged));
t('והטופס נשאר נקי', (await page.inputValue('#d-type')) !== 'passport');

console.log('\n— אין תלות ברשת —');
t('אפס בקשות לדומיין חיצוני לאורך כל הקריאה', net.length === 0, net.slice(0, 3).join(' | '));
t('אפס שגיאות', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
