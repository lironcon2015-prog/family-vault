/* features.mjs — עשרת התיקונים של 0.9.0.
   כל בדיקה כאן נכתבה מול באג מדווח, ולא מול קוד שנכתב. */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
const SP = process.env.FIXTURES || '.';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({
  viewport: { width: 420, height: 920 },
  permissions: ['clipboard-read', 'clipboard-write'], locale: 'he-IL'
});
const page = await ctx.newPage();
const reqs = []; page.on('request', r => reqs.push(r.url()));
const errs = []; page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(BASE);
await page.waitForSelector('.scr-title');

/* המסגרת נמדדת ולא נקראת מ-CSS. המנגנון הוא גאומטריה מפורשת (DEC-46),
   ובדיקה שקוראת מחרוזת סגנון בודקת את המימוש; מה שצריך להיבדק הוא מה
   שהמשתמש רואה — כמה מהתמונה נכנס למסגרת, ואיזה חלק ממנה.

   `rw`/`rh` הם יחס התמונה למסגרת: 1 בדיוק ממלא, מעל 1 נחתך, מתחת 1
   נכנס כולו. `x`/`y` הם אותה סמנטיקה של `object-position`. */
const frameOf = (pg, sel) => pg.evaluate((s) => {
  const i = document.querySelector(s);
  if (!i) return null;
  const h = i.parentElement;
  const ir = i.getBoundingClientRect(), hr = h.getBoundingClientRect();
  const r = (a, b) => Math.round((a / b) * 1000) / 1000;
  const at = (hs, is, hl, il) => Math.abs(is - hs) < 0.5 ? 50
    : Math.round(((hl - il) / (is - hs)) * 100);
  return {
    rw: r(ir.width, hr.width), rh: r(ir.height, hr.height),
    x: at(hr.width, ir.width, hr.left, ir.left),
    y: at(hr.height, ir.height, hr.top, ir.top),
    fits: ir.width <= hr.width + 1 && ir.height <= hr.height + 1
  };
}, sel);

/* ---------- 6 · קנה מידה קבוע ---------- */
console.log('\n— קנה מידה קבוע —');
const vp = await page.getAttribute('meta[name="viewport"]', 'content');
t('viewport נועל את קנה המידה', /user-scalable=no/.test(vp) && /maximum-scale=1/.test(vp), vp);
t('ויש גם minimum-scale, אחרת אפשר להתרחק', /minimum-scale=1/.test(vp), vp);
t('Zoom.reset קיים ונקרא בחזרה לאפליקציה',
  await page.evaluate(() => typeof window.App.Zoom.reset === 'function'));
t('הזום נעצר בגבול הצופה ולא לפניו', await page.evaluate(() => {
  const d = document.createElement('div');
  d.className = 'zoom-stage';
  const kid = document.createElement('span');
  d.appendChild(kid);
  document.body.appendChild(d);
  const inside = window.App.Zoom.inViewer(kid);
  const outside = window.App.Zoom.inViewer(document.querySelector('.scr-title'));
  d.remove();
  return inside === true && outside === false;
}));

/* ---------- 5 · קיבוץ וסידור ---------- */
console.log('\n— קיבוץ ישויות —');
await page.evaluate(async () => {
  const U = window.U, DB = window.DB;
  const mk = (id, name, type, order) => DB.saveEntity({
    id, type, name, color: '#4B6B7A', avatar: name[0], sortOrder: order
  });
  await mk('e-car', 'מאזדה', 'vehicle', 10);
  await mk('e-dana', 'דנה', 'person', 30);
  await mk('e-home', 'הבית', 'home', 20);
  await mk('e-itamar', 'איתמר', 'person', 40);
  await window.App.render();
});
await page.waitForSelector('.egroup');

/* DEC-39: שתי קבוצות ולא ארבע. הפריסה נגזרת מ-`ENTITY_GROUPS`, והתווית
   נבנית משמות הסוגים שיש להם ישויות בפועל. */
const groups = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('.grp-h b')].map(h => h.textContent);
  const gs = [...document.querySelectorAll('.egroup')].map(g => ({
    layout: g.dataset.layout,
    names: [...g.querySelectorAll('.card-t')].map(x => x.textContent)
  }));
  return { heads, gs };
});
t('הקבוצה הראשונה היא רצועת האנשים', groups.gs[0] && groups.gs[0].layout === 'rail',
  JSON.stringify(groups.gs.map(g => g.layout)));
t('ואחריה לוח הנכסים', groups.gs.map(g => g.layout).join(',') === 'rail,board',
  groups.gs.map(g => g.layout).join(','));
t('התווית נבנית מהסוגים שיש להם ישויות', groups.heads.join(' | ') === 'אדם | רכב ובית',
  groups.heads.join(' | '));
t('בתוך הקבוצה הסדר הוא sortOrder', groups.gs[0].names.join(',') === 'דנה,איתמר',
  groups.gs[0].names.join(','));

/* גרירה נבדקת דרך התוצאה שלה — סדר חדש נשמר וגובר על ברירת המחדל */
const reordered = await page.evaluate(async () => {
  const box = document.querySelector('.egroup[data-type="person"]');
  const cards = [...box.querySelectorAll('.ecard')];
  box.insertBefore(cards[1], cards[0]);
  await window.Screens.saveOrder([...box.querySelectorAll('.ecard')]);
  const rows = await window.DB.listEntities();
  const people = rows.filter(r => r.type === 'person');
  return people.map(p => p.name + ':' + p.sortOrder);
});
t('הסדר החדש נשמר על הישויות', reordered.join(',') === 'איתמר:1000,דנה:2000', reordered.join(','));

await page.reload();
await page.waitForSelector('.egroup');
const afterReload = await page.evaluate(() =>
  [...document.querySelectorAll('.egroup[data-type="person"] .card-t')].map(x => x.textContent));
t('והוא שורד רענון — הגרירה דורסת את ברירת המחדל',
  afterReload.join(',') === 'איתמר,דנה', afterReload.join(','));

/* ---------- 5b · מה שהפיל את הגרירה בנייד ---------- */
/* `touch-action` נקבע בתחילת המחווה, ולכן הוספת `.reordering` באמצעה
   אינה עוצרת גלילה. הבלם האמיתי הוא `touchmove` לא-פסיבי. */
const touchGuard = await page.evaluate(async () => {
  const box = document.querySelector('.egroup[data-type="person"]');
  const card = box.querySelector('.ecard');
  const r = card.getBoundingClientRect();

  function ev(type, y) {
    return new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true,
      clientX: r.left + r.width / 2, clientY: y
    });
  }
  card.dispatchEvent(ev('pointerdown', r.top + 10));
  const before = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
  box.dispatchEvent(before);
  const beforeStopped = before.defaultPrevented;

  await new Promise(res => setTimeout(res, 450));   /* הלחיצה הארוכה מבשילה */
  const during = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
  box.dispatchEvent(during);
  const duringStopped = during.defaultPrevented;
  const lifted = card.classList.contains('dragging');

  card.dispatchEvent(ev('pointerup', r.top + 10));
  await new Promise(res => setTimeout(res, 400));
  return { beforeStopped, duringStopped, lifted };
});
t('לפני שהגרירה מבשילה, גלילה נשארת של הדפדפן', touchGuard.beforeStopped === false);
t('הלחיצה הארוכה מרימה את הכרטיס', touchGuard.lifted === true);
t('ומאותו רגע הגלילה נעצרת, אחרת הדף זז במקום הכרטיס',
  touchGuard.duringStopped === true);

/* `-webkit-touch-callout` הוא מאפיין של WebKit ו-Chromium אינו מדווח
   עליו ב-getComputedStyle, ולכן הבדיקה על ה-CSS עצמו ולא על החישוב. */
const calloutCss = await page.evaluate(() =>
  fetch('/style.css').then(r => r.text()));
t('בועת הבחירה של iOS מכובה על כרטיס נגרר',
  /-webkit-touch-callout:\s*none/.test(calloutCss));
t('וגם בחירת טקסט, שמבטלת את המחווה',
  /user-select:\s*none/.test(calloutCss));
t('והכלל חל גם על ישויות וגם על מסמכים',
  /\.egroup \.card,\s*\.dgroup \.card/.test(calloutCss));

/* המקור עצמו: היה בקובץ עותק ישן של UI.reorder שדרס את החדש, ולכן
   הבלם על הגלילה כלל לא רץ במכשיר. בדיקה שנועלת את זה. */
const reorderSrc = await page.evaluate(() => ({
  touch: window.UI.reorder.toString().includes('touchmove'),
  scroll: window.UI.reorder.toString().includes('scrollBy')
}));
t('UI.reorder שרץ בפועל הוא זה שיש בו בלם גלילה', reorderSrc.touch === true);
t('וגם גלילה אוטומטית בקצוות', reorderSrc.scroll === true);
/* הבדיקה נכתבה על UI.reorder אחרי שהגדרה כפולה דרסה אותו בשקט. היא הורחבה
   לכל הקובץ אחרי ש-UI.cropper ו-UI.zoomable הוכפלו בדיוק באותה דרך: מספר
   אחד לפונקציה אחת אינו שומר על הקובץ, הוא שומר על השורה שכבר נכווינו בה. */
const dupes = await page.evaluate(() => fetch('/js/ui.js').then(r => r.text()).then(src => {
  const seen = {}, dup = [];
  (src.match(/^  UI\.[A-Za-z]+ = function/gm) || []).forEach(l => {
    const k = l.trim();
    if (seen[k]) dup.push(k); else seen[k] = 1;
  });
  return dup;
}));
t('אף פונקציה ב-ui.js אינה מוגדרת פעמיים', dupes.length === 0, dupes.join(' | '));

/* ---------- 4 · אווטאר ---------- */
console.log('\n— אווטאר של ישות —');
const av = await page.evaluate(async () => {
  /* 4:3 — מתחת ל-AVATAR_WIDE_RATIO, ולכן במסלול הרגיל */
  const c = new OffscreenCanvas(800, 600);
  const x = c.getContext('2d');
  x.fillStyle = '#c33'; x.fillRect(0, 0, 800, 600);
  x.fillStyle = '#fff'; x.fillRect(260, 100, 280, 400);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const f = new File([blob], 'face.png', { type: 'image/png' });
  const url = await window.Files.avatar(f);
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  return { url: url.slice(0, 24), w: bmp.width, h: bmp.height, bytes: Math.round(url.length * 0.75) };
});
t('האווטאר הוא data URL של JPEG', /^data:image\/jpeg/.test(av.url), av.url);
t('התמונה נשמרת שלמה ולא נחתכת לריבוע', av.w !== av.h, av.w + 'x' + av.h);
t('והצלע הקצרה היא שנקבעת', Math.min(av.w, av.h) === 256, av.w + 'x' + av.h);
t('היחס נשמר', Math.abs(av.w / av.h - 800 / 600) < 0.02, (av.w / av.h).toFixed(3));
t('ומתחת לתקרת המשקל', av.bytes <= 120 * 1024, String(av.bytes));

/* ---------- 4b · תמונה רחבה נכנסת שלמה לעיגול ----------
   DEC-41. העיגול חותך ריבוע מהמרכז, ובתצלום רכב הרוחב הוא הנושא —
   חיתוך כזה מותיר ידית דלת. */
const wide = await page.evaluate(async () => {
  const PAD = [30, 107, 140];      /* הרקע של התצלום */
  const MARK = [240, 200, 40];     /* סימן בקצה השמאלי ובימני */

  function make(w, h) {
    const c = new OffscreenCanvas(w, h);
    const x = c.getContext('2d');
    x.fillStyle = 'rgb(' + PAD.join(',') + ')'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgb(' + MARK.join(',') + ')';
    x.fillRect(Math.round(w * .017), Math.round(h * .35), Math.round(w * .05), Math.round(h * .3));
    x.fillRect(Math.round(w * .933), Math.round(h * .35), Math.round(w * .05), Math.round(h * .3));
    return c.convertToBlob({ type: 'image/png' })
      .then(b => window.Files.avatar(new File([b], 'x.png', { type: 'image/png' })));
  }
  async function read(url) {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    const g = c.getContext('2d');
    const at = (px, py) => Array.from(g.getImageData(px, py, 1, 1).data).slice(0, 3);
    const near = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
    return { w: bmp.width, h: bmp.height, at, near, bytes: Math.round(url.length * 0.75) };
  }

  const r = await read(await make(1200, 400));          /* 3:1 */
  const mid = Math.round(r.h / 2);
  const near = await read(await make(800, 600));        /* 4:3 — לא מרופדת */
  const tall = await read(await make(400, 1200));       /* אנכית — לא מרופדת */

  return {
    square: r.w === r.h,
    side: r.w,
    /* שני הקצוות של המקור שרדו: הם יושבים בשורת האמצע של הפלט */
    leftMark:  r.near(r.at(Math.round(r.w * .078), mid), MARK) < 110,
    rightMark: r.near(r.at(Math.round(r.w * .922), mid), MARK) < 110,
    /* והריפוד הוא הרקע של התצלום עצמו, ולא צבע שהומצא */
    padTop: r.near(r.at(Math.round(r.w / 2), 6), PAD) < 90,
    bytes: r.bytes,
    nearRatio: (near.w / near.h).toFixed(2),
    tallRatio: (tall.w / tall.h).toFixed(2)
  };
});
t('תמונה רחבה מרופדת לריבוע', wide.square === true, wide.side + 'px');
t('והצלע אינה עולה על התקרה', wide.side === 384, String(wide.side));
t('הקצה השמאלי של התצלום שרד את העיגול', wide.leftMark === true);
t('וגם הימני — כלומר רואים את התמונה כולה', wide.rightMark === true);
t('הריפוד נדגם מהרקע של התצלום ולא הומצא', wide.padTop === true);
t('והמשקל נשאר מתחת לתקרה', wide.bytes <= 120 * 1024, String(wide.bytes));
t('תמונה 4:3 אינה מרופדת', wide.nearRatio === '1.33', wide.nearRatio);
t('וגם לא תמונה אנכית — שם החיתוך הוא הפנים', wide.tallRatio === '0.33', wide.tallRatio);

const avShown = await page.evaluate(async () => {
  const e = (await window.DB.listEntities()).filter(x => x.name === 'דנה')[0];
  /* **תמונה גבוהה ולא ריבוע.** בריבוע אין סרך בשום ציר, ולכן המסגרת
     אינה משנה דבר ואי אפשר למדוד אותה — בדיוק כפי שהמשתמש לא היה
     רואה בה הבדל. */
  const c = document.createElement('canvas');
  c.width = 200; c.height = 400;
  const cx = c.getContext('2d');
  cx.fillStyle = '#4B6B7A'; cx.fillRect(0, 0, 200, 400);
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, 200, 80);
  e.avatarImage = c.toDataURL('image/png');
  await window.DB.saveEntity(e);
  await window.App.render();
  const card = [...document.querySelectorAll('.ecard')]
    .filter(c => c.querySelector('.card-t').textContent === 'דנה')[0];
  const other = [...document.querySelectorAll('.ecard')]
    .filter(c => c.querySelector('.card-t').textContent === 'איתמר')[0];
  return {
    img: !!card.querySelector('.av img'),
    letter: other.querySelector('.av span').textContent
  };
});
t('ישות עם תמונה מציגה תמונה', avShown.img === true);
t('וישות בלעדיה נשארת עם האות', avShown.letter === 'א', avShown.letter);

/* מסגרת האווטאר — מה שיוצג בתוך העיגול */
const DANA = '.ecard[data-name="דנה"] .av img';
await page.evaluate(() => {
  [...document.querySelectorAll('.ecard')].forEach(c => {
    c.dataset.name = c.querySelector('.card-t').textContent;
  });
});
const avBefore = await frameOf(page, DANA);
t('אווטאר בלי מסגרת שמורה נשאר במרכז', avBefore.x === 50 && avBefore.y === 50,
  JSON.stringify(avBefore));
t('ובלי הגדלה הוא בדיוק ממלא את העיגול', avBefore.rw >= 1 && avBefore.rh >= 1 &&
  Math.min(avBefore.rw, avBefore.rh) === 1, avBefore.rw + 'x' + avBefore.rh);
t('ותמונה גבוהה גולשת בציר האנכי בלבד', avBefore.rw === 1 && avBefore.rh === 2,
  avBefore.rw + 'x' + avBefore.rh);

await page.evaluate(async () => {
  const DB = window.DB;
  const e = (await DB.listEntities()).filter(x => x.name === 'דנה')[0];
  e.avatarFocus = { x: 30, y: 80 };
  await DB.saveEntity(e);
  await window.App.render();
  [...document.querySelectorAll('.ecard')].forEach(c => {
    c.dataset.name = c.querySelector('.card-t').textContent;
  });
});
await page.waitForTimeout(150);
const avAfter = await frameOf(page, DANA);
/* בציר שאין בו סרך אין מה למדוד, ולכן נבדק הציר שיש בו */
t('והמסגרת שנבחרה מצוירת', avAfter.y === 80, JSON.stringify(avAfter));

/* ההגדלה — המספר השלישי במסגרת. `transform-origin` חייב להיות זהה
   ל-`object-position`, אחרת התמונה גדלה סביב המרכז ומחליקה מהנקודה
   שנבחרה. זו הבדיקה ששומרת על זה. */
await page.evaluate(async () => {
  const DB = window.DB;
  const e = (await DB.listEntities()).filter(x => x.name === 'דנה')[0];
  e.avatarFocus = { x: 30, y: 80, z: 2 };
  await DB.saveEntity(e);
  await window.App.render();
  [...document.querySelectorAll('.ecard')].forEach(c => {
    c.dataset.name = c.querySelector('.card-t').textContent;
  });
});
await page.waitForTimeout(150);
const avZoom = await frameOf(page, DANA);
t('הגדלה שנשמרה על הישות מצוירת בעיגול',
  Math.abs(avZoom.rw / avBefore.rw - 2) < 0.02 &&
  Math.abs(avZoom.rh / avBefore.rh - 2) < 0.02,
  avZoom.rw + '/' + avBefore.rw);
t('והנקודה שנבחרה נשארת הנקודה שנבחרה גם בהגדלה',
  avZoom.x === 30 && avZoom.y === 80, JSON.stringify(avZoom));
t('ובהגדלה גם הציר הרוחבי נעשה מדיד', avZoom.rw > 1, String(avZoom.rw));
t('והעיגול חותך את מה שגלש', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.ecard .av')).overflow === 'hidden'));

await page.evaluate(() => window.Screens.entitySheet(
  window.Screens.state.entities.filter(e => e.name === 'דנה')[0]));
await page.waitForSelector('#e-name');
await page.waitForTimeout(200);
t('טופס הישות מציג בורר עגול', await page.isVisible('.crop-circle'));
t('ובלי מחוון מיקום — בעיגול גוררים לשני הכיוונים',
  (await page.locator('.crop-circle').count()) === 1 &&
  (await page.locator('.crop .crop-range').count()) === 1 &&
  (await page.locator('.crop-zoom .crop-range').count()) === 1);

/* מקשי החיצים הם הדרך היחידה להזיז בלי עכבר, ובעיגול גם לרוחב */
await page.focus('.crop-box');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowDown');
const moved = await frameOf(page, '.crop-img');
t('חיצים מזיזים את המסגרת בשני הצירים', moved.x === 34 && moved.y === 84,
  JSON.stringify(moved));

await page.click('.sheet-actions .btn:not(.ghost)');
await page.waitForSelector('.backdrop', { state: 'detached' });
const savedFocus = await page.evaluate(async () =>
  (await window.DB.listEntities()).filter(e => e.name === 'דנה')[0].avatarFocus);
t('והבחירה נשמרת על הישות',
  savedFocus && savedFocus.x === 34 && savedFocus.y === 84, JSON.stringify(savedFocus));

/* ---------- סידור מסמכים בתוך ישות ---------- */
console.log('\n— סדר המסמכים בישות —');
await page.evaluate(async () => {
  const DB = window.DB;
  const mk = (id, title) => DB.saveDoc({
    id, entityId: 'e-order', typeKey: 'generic', title,
    fields: [{ key: 'title', label: 'כותרת', value: title, kind: 'text', sensitive: false, verified: true }],
    issueDate: null, expiryDate: null, files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0
  }, []);
  await DB.saveEntity({ id: 'e-order', type: 'other', name: 'סידור', color: '#4B6B7A', avatar: 'ס', sortOrder: 5 });
  await mk('o-1', 'אלף');
  await mk('o-2', 'בית');
  await mk('o-3', 'גימל');
});

await page.goto(BASE + '#/entity/e-order');
await page.waitForSelector('.dgroup');

/* ברירת המחדל היא האחרון שנגעו בו. `DB.saveDoc` חותם `updatedAt` בעצמו,
   ולכן הציפייה נגזרת מה-DB ולא מסדר הכתיבה — שתי שמירות באותה מילישנייה
   הן תיקו, וזה בדיוק סוג הבדיקה שנשברת פעם בכמה הרצות. */
const expected = await page.evaluate(async () => {
  const docs = (await window.DB.listDocs())
    .filter(d => d.entityId === 'e-order')
    .sort(window.Screens.docOrder);
  return docs.map(d => d.title);
});
const shown = await page.evaluate(() =>
  [...document.querySelectorAll('.dcard .card-t')].map(x => x.textContent));
t('סדר התצוגה נגזר מ-Screens.docOrder', shown.join(',') === expected.join(','),
  shown.join(',') + ' vs ' + expected.join(','));
t('ובלי סדר ידני הוא לפי האחרון שנגעו בו',
  expected.length === 3 && shown.length === 3, shown.join(','));

const reorderedDocs = await page.evaluate(async () => {
  const box = document.querySelector('.dgroup');
  const cards = [...box.querySelectorAll('.dcard')];
  box.insertBefore(cards[2], cards[0]);          /* האחרון לראש */
  const wanted = [...box.querySelectorAll('.dcard .card-t')].map(x => x.textContent);
  await window.Screens.saveDocOrder([...box.querySelectorAll('.dcard')]);
  const docs = await window.DB.listDocs();
  const byOrder = docs.filter(d => d.entityId === 'e-order')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(d => d.title);
  return { wanted, byOrder };
});
t('הסדר החדש נשמר על המסמכים',
  reorderedDocs.byOrder.join(',') === reorderedDocs.wanted.join(','),
  reorderedDocs.byOrder.join(',') + ' vs ' + reorderedDocs.wanted.join(','));

await page.reload();
await page.waitForSelector('.dgroup');
const afterDocs = await page.evaluate(() =>
  [...document.querySelectorAll('.dcard .card-t')].map(x => x.textContent));
t('והוא שורד רענון', afterDocs.join(',') === reorderedDocs.wanted.join(','),
  afterDocs.join(','));

const survives = await page.evaluate(async () => {
  const doc = await window.DB.get('docs', 'o-3');
  const was = doc.sortOrder;
  doc.title = 'גימל ערוך';
  await window.DB.saveDoc(doc, []);
  return { was: was, now: (await window.DB.get('docs', 'o-3')).sortOrder };
});
t('סדר ידני שורד עריכת מסמך', survives.now === survives.was, JSON.stringify(survives));

const formKeeps = await page.evaluate(() => {
  /* הטופס בונה אובייקט חדש, ולכן `sortOrder` חייב להיות בו במפורש */
  return fetch('/js/forms.js').then(r => r.text())
    .then(src => /sortOrder: \(doc && doc\.sortOrder/.test(src));
});
t('וגם עריכה דרך הטופס, שבונה אובייקט חדש', formKeeps === true);

/* ---------- 3 · מסמך מעודכן דוחק את הקודם ---------- */
console.log('\n— גרסאות של אותו מסמך —');
const ver = await page.evaluate(async () => {
  const U = window.U, DB = window.DB, V = window.Versions;
  const mk = (id, expiry, plate) => ({
    id, entityId: 'e-car', typeKey: 'vehicle_test', title: 'טסט ' + expiry.slice(0, 4),
    fields: [{ key: 'plate', label: 'מספר רישוי', value: plate, kind: 'plate',
               sensitive: false, confidence: null, verified: true }],
    issueDate: null, expiryDate: expiry, files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0
  });
  const oldDoc = mk('v-old', '2025-01-01', '8452103');
  await DB.saveDoc(oldDoc, []);
  const docs = await DB.listDocs();

  const fresh = mk('v-new', '2026-12-31', '8452103');
  fresh.updatedAt = U.now();
  const plan = V.plan(fresh, docs);
  await DB.supersede(fresh, plan.supersede, []);

  const after = await DB.listDocs();
  const live = V.live(after);
  const olderNow = after.filter(d => d.id === 'v-old')[0];

  /* מסמך של רכב אחר, אותה לוחית? לא — לוחית אחרת, ולכן אינו אותו מסמך */
  const unrelated = mk('v-other', '2027-01-01', '1234567');
  unrelated.updatedAt = U.now();
  const plan2 = V.plan(unrelated, after);

  return {
    planned: plan.supersede,
    pointer: olderNow.supersededBy,
    liveIds: live.map(d => d.id).filter(id => id.indexOf('v-') === 0),
    unrelatedPlan: plan2.supersede.length,
    identitySame: V.identity(oldDoc) === V.identity(fresh),
    identityOther: V.identity(unrelated) === V.identity(fresh)
  };
});
t('הגרסה הישנה זוהתה', ver.planned.join(',') === 'v-old', ver.planned.join(','));
t('והיא מצביעה על החדשה', ver.pointer === 'v-new', String(ver.pointer));
t('רק החדשה נחשבת נוכחית', ver.liveIds.join(',') === 'v-new', ver.liveIds.join(','));
t('הישנה לא נמחקה', ver.pointer !== undefined);
t('אותה לוחית = אותו מסמך', ver.identitySame === true);
t('לוחית אחרת = מסמך אחר', ver.identityOther === false);
t('ומסמך אחר לא נדחק', ver.unrelatedPlan === 0);

const older = await page.evaluate(async () => {
  const V = window.Versions, DB = window.DB, U = window.U;
  const docs = await DB.listDocs();
  const stale = {
    id: 'v-stale', entityId: 'e-car', typeKey: 'vehicle_test', title: 'טסט ישן',
    fields: [{ key: 'plate', label: 'מספר רישוי', value: '8452103', kind: 'plate',
               sensitive: false, confidence: null, verified: true }],
    issueDate: null, expiryDate: '2024-01-01', files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0, updatedAt: U.now()
  };
  return { plan: window.Versions.plan(stale, docs) };
});
t('העלאה של מסמך ישן יותר אינה דוחקת את החדש',
  older.plan.supersede.length === 0 && older.plan.supersededBy === 'v-new',
  JSON.stringify(older.plan));

const surfaces = await page.evaluate(async () => {
  await window.Screens.reload();
  const S = window.Screens.state, E = window.Expiry, Search = window.Search;
  const g = E.group(S.live);
  const rows = Search.rows(S.live, S.byId);
  return {
    inExpiry: [].concat(g.past, g.d30, g.d90, g.ok).map(i => i.doc.id).indexOf('v-old'),
    inQuick: rows.map(r => r.doc.id).indexOf('v-old'),
    liveHasNew: S.live.some(d => d.id === 'v-new')
  };
});
t('גרסה שנדחקה אינה במנוע התפוגה', surfaces.inExpiry === -1);
t('ואינה בהעתקה המהירה', surfaces.inQuick === -1);
t('העדכנית כן', surfaces.liveHasNew === true);

await page.goto(BASE + '#/doc/v-old');
await page.waitForSelector('.scr-body');
t('כרטיס הגרסה הקודמת אומר זאת, ומצביע לעדכנית',
  await page.isVisible('.notice-warn'));
await page.goto(BASE + '#/doc/v-new');
await page.waitForSelector('.scr-body');
t('והעדכנית מציגה את הקודמות שלה',
  (await page.locator('.files-h', { hasText: 'גרסאות קודמות' }).count()) === 1);

await page.goto(BASE + '#/entity/e-car');
await page.waitForSelector('.scr');
t('מסך הישות מקפל את הגרסאות הקודמות',
  (await page.locator('.fold', { hasText: 'גרסאות קודמות' }).count()) === 1);

/* ---------- 7 · מה שדורש טיפול ----------
   DEC-39: במסך הבית הבאנר נבלע בשורת המצב שבמסד. הוא לא נמחק — הוא עדיין
   מה שמוצג כשמסך התפוגות הוא מסך הבית, ולכן שתי ההתנהגויות נבדקות. */
console.log('\n— מה שדורש טיפול —');
const flag = await page.evaluate(async () => {
  const DB = window.DB, U = window.U;
  const expired = {
    id: 'b-1', entityId: 'e-car', typeKey: 'vehicle_insurance', title: 'ביטוח פג',
    fields: [
      { key: 'policyNumber', label: 'מספר פוליסה', value: 'PL1', kind: 'policy', sensitive: true, verified: true },
      { key: 'insurer', label: 'חברת ביטוח', value: 'הראל', kind: 'text', sensitive: false, verified: true }
    ],
    issueDate: null, expiryDate: '2020-01-01', files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0
  };
  await DB.saveDoc(expired, []);
  location.hash = '#/entities';
  await window.App.render();
  const el = document.querySelector('.mast-flag');
  const shown = !!el, text = el ? el.textContent : '';

  /* טיפול: מסמך מעודכן עם אותה פוליסה ואותה חברה */
  const renewed = JSON.parse(JSON.stringify(expired));
  renewed.id = 'b-2'; renewed.title = 'ביטוח מחודש'; renewed.expiryDate = '2030-01-01';
  renewed.updatedAt = U.now();
  const plan = window.Versions.plan(renewed, await DB.listDocs());
  await DB.supersede(renewed, plan.supersede, []);
  await window.App.render();
  return { shown, text, after: !!document.querySelector('.mast-flag'), planned: plan.supersede };
});
t('שורת המצב מסמנת מסמך שפג', flag.shown === true);
t('והיא אומרת כמה', /דורש/.test(flag.text), flag.text);
t('העלאת המסמך המחודש דחקה את שפג', flag.planned.join(',') === 'b-1', flag.planned.join(','));
t('ואחרי הטיפול הסימון נעלם', flag.after === false);

await page.locator('.mast-flag').count().then(async () => {});
const flagGo = await page.evaluate(async () => {
  const DB = window.DB;
  await DB.saveDoc({
    id: 'b-5', entityId: 'e-car', typeKey: 'vehicle_test', title: 'טסט שפג מזמן',
    fields: [{ key: 'plate', label: 'מספר רישוי', value: '3334445', kind: 'plate', sensitive: false, verified: true }],
    issueDate: null, expiryDate: '2020-02-02', files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0
  }, []);
  location.hash = '#/entities';
  await window.App.render();
  document.querySelector('.mast-flag').click();
  await new Promise(r => setTimeout(r, 260));
  return location.hash;
});
t('ולחיצה עליה לוקחת לרשימת התפוגות', flagGo === '#/expiries', flagGo);

/* הבאנר עצמו — במסלול שבו מסך התפוגות הוא מסך הבית */
const sig = await page.evaluate(async () => {
  const DB = window.DB, S = window.Settings, C = window.CONFIG;
  const was = C.HOME;
  C.HOME = 'expiries';
  await S.set(C.K.lastNoticeDay, '');
  await S.set(C.K.lastNoticeSig, '');
  location.hash = '#/expiries';
  await window.App.render();
  const shown = !!document.querySelector('.notice');
  const clickable = !!document.querySelector('.notice-go');

  document.querySelector('.notice .iconbtn').click();
  await new Promise(r => setTimeout(r, 140));
  const dismissed = !document.querySelector('.notice');
  await window.App.render();
  const stillGone = !document.querySelector('.notice');

  /* מסמך חדש שפג — החתימה השתנתה, והבאנר חוזר גם באותו יום */
  await DB.saveDoc({
    id: 'b-4', entityId: 'e-car', typeKey: 'vehicle_test', title: 'טסט נוסף',
    fields: [{ key: 'plate', label: 'מספר רישוי', value: '1112223', kind: 'plate', sensitive: false, verified: true }],
    issueDate: null, expiryDate: '2020-06-01', files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0
  }, []);
  await window.App.render();
  const back = !!document.querySelector('.notice');

  C.HOME = was;
  location.hash = '#/entities';
  await window.App.render();
  return { shown, clickable, dismissed, stillGone, back };
});
t('כשמסך התפוגות הוא מסך הבית — הבאנר מופיע', sig.shown === true);
t('והוא לחיץ', sig.clickable === true);
t('סגירת הבאנר מסתירה אותו', sig.dismissed === true);
t('והוא נשאר סגור לאותה רשימה', sig.stillGone === true);
t('אבל חוזר כשנוסף מסמך שדורש טיפול', sig.back === true);

/* ---------- 2 · שינוי שם קובץ ---------- */
console.log('\n— שם הקובץ —');
const renamed = await page.evaluate(async () => {
  const DB = window.DB, U = window.U;
  const blobId = U.id();
  const doc = {
    id: 'f-1', entityId: 'e-itamar', typeKey: 'generic', title: 'קובץ',
    fields: [{ key: 'title', label: 'כותרת', value: 'קובץ', kind: 'text', sensitive: false, verified: true }],
    issueDate: null, expiryDate: null, source: 'upload', notes: '',
    supersededBy: null, deleted: 0,
    files: [{ blobId, driveFileId: null, mime: 'image/png', name: 'IMG_0001.png', size: 10 }]
  };
  await DB.saveDoc(doc, [{ id: blobId, docId: doc.id, data: new Blob([new Uint8Array([1, 2])]), mime: 'image/png', size: 2 }]);
  await DB.renameFile(doc, blobId, 'רישיון רכב.png');
  const back = await DB.get('docs', 'f-1');
  return { name: back.files[0].name, blobId: back.files[0].blobId === blobId };
});
t('השם נשמר', renamed.name === 'רישיון רכב.png', renamed.name);
t('והקובץ עצמו לא זז', renamed.blobId === true);

await page.goto(BASE + '#/doc/f-1');
await page.waitForSelector('.file-row');
t('יש כפתור שינוי שם בשורת הקובץ',
  (await page.locator('.file-row [aria-label="שינוי שם הקובץ"]').count()) === 1);
await page.click('.file-row [aria-label="שינוי שם הקובץ"]');
await page.waitForSelector('#p-in');
t('הגיליון נפתח עם השם הנוכחי',
  (await page.inputValue('#p-in')) === 'רישיון רכב.png');
await page.fill('#p-in', 'ביטוח 2026.png');
await page.click('.sheet-actions .btn:not(.ghost)');
await page.waitForSelector('.backdrop', { state: 'detached' });
t('והשינוי מהמסך נשמר', await page.evaluate(async () =>
  (await window.DB.get('docs', 'f-1')).files[0].name === 'ביטוח 2026.png'));

/* ---------- 9 · ייצוא ---------- */
console.log('\n— ייצוא ושיתוף —');
t('יש כפתור שיתוף בשורת הקובץ',
  (await page.locator('.file-row [aria-label="שיתוף הקובץ"]').count()) === 1);
t('ויש שיתוף בכותרת המסמך',
  (await page.locator('.scr-actions [aria-label="שיתוף"]').count()) === 1);

await page.click('.scr-actions [aria-label="שיתוף"]');
await page.waitForSelector('.routes');
const shareRoutes = await page.evaluate(() =>
  [...document.querySelectorAll('.route-t')].map(x => x.textContent));
t('הגיליון מציע את הקובץ ואת הפרטים כטקסט',
  shareRoutes.length === 2 && shareRoutes[1] === 'הפרטים כטקסט', shareRoutes.join(','));
await page.click('.sheet-h .iconbtn');
await page.waitForSelector('.backdrop', { state: 'detached' });

const names = await page.evaluate(() => ({
  keepsExt: window.Share.safeName('ביטוח 2026.pdf', 'application/pdf'),
  addsExt: window.Share.safeName('ביטוח 2026', 'application/pdf'),
  strips: window.Share.safeName('a/b:c*d?.png', 'image/png'),
  empty: window.Share.safeName('', 'image/jpeg')
}));
t('סיומת קיימת אינה מוכפלת', names.keepsExt === 'ביטוח 2026.pdf', names.keepsExt);
t('וסיומת חסרה מתווספת', names.addsExt === 'ביטוח 2026.pdf', names.addsExt);
t('מפרידי נתיב מנוקים', names.strips === 'a b c d.png', names.strips);
t('שם ריק מקבל ברירת מחדל', names.empty === 'מסמך.jpg', names.empty);

/* ההורדה היא מסלול הנסיגה, והיא זו שנבדקת — Web Share אינו קיים ב-Chromium */
const dl = await page.evaluate(async () => {
  const before = document.querySelectorAll('a[download]').length;
  let clicked = null;
  const proto = HTMLAnchorElement.prototype;
  const orig = proto.click;
  proto.click = function () { clicked = this.getAttribute('download'); };
  const mode = await window.Share.file(new Blob(['x']), 'טסט', 'application/pdf');
  proto.click = orig;
  return { mode, clicked, before };
});
t('בלי Web Share נופלים להורדה', dl.mode === 'download', dl.mode);
t('ושם הקובץ שהורד נכון', dl.clicked === 'טסט.pdf', String(dl.clicked));

/* ---------- 8 · העוגן מציג את ראש התמונה ---------- */
console.log('\n— ראש התמונה —');
const anchorPos = await page.evaluate(() => {
  const d = document.createElement('img');
  d.className = 'anchor';
  document.body.appendChild(d);
  const v = getComputedStyle(d).objectPosition;
  const fit = getComputedStyle(d).objectFit;
  d.remove();
  return { v, fit };
});
t('object-fit נשאר cover', anchorPos.fit === 'cover', anchorPos.fit);
t('object-position בראש התמונה ולא במרכזה',
  /0(px|%)?$/.test(anchorPos.v.split(' ')[1] || ''), anchorPos.v);

/* ---------- 8b · בחירת מסגרת לתצוגה המקדימה ---------- */
console.log('\n— מסגרת התצוגה המקדימה —');
await page.evaluate(async () => {
  const DB = window.DB, U = window.U;
  const c = new OffscreenCanvas(800, 2000), x = c.getContext('2d');
  x.fillStyle = '#eee'; x.fillRect(0, 0, 800, 2000);
  x.fillStyle = '#c00'; x.fillRect(0, 0, 800, 600);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const bid = U.id();
  await DB.saveDoc({
    id: 'crop-1', entityId: 'e-itamar', typeKey: 'generic', title: 'תעודה גבוהה',
    fields: [{ key: 'title', label: 'כותרת', value: 'תעודה גבוהה', kind: 'text', sensitive: false, verified: true }],
    issueDate: null, expiryDate: null, source: 'upload', notes: '',
    supersededBy: null, deleted: 0,
    files: [{ blobId: bid, driveFileId: null, mime: 'image/png', name: 'tall.png', size: blob.size }]
  }, [{ id: bid, docId: 'crop-1', data: blob, mime: 'image/png', size: blob.size }]);

  const w = new OffscreenCanvas(2000, 400), wx = w.getContext('2d');
  wx.fillStyle = '#0a0'; wx.fillRect(0, 0, 2000, 400);
  const wblob = await w.convertToBlob({ type: 'image/png' });
  const wid = U.id();
  await DB.saveDoc({
    id: 'crop-2', entityId: 'e-itamar', typeKey: 'generic', title: 'תעודה רחבה',
    fields: [{ key: 'title', label: 'כותרת', value: 'תעודה רחבה', kind: 'text', sensitive: false, verified: true }],
    issueDate: null, expiryDate: null, source: 'upload', notes: '',
    supersededBy: null, deleted: 0,
    files: [{ blobId: wid, driveFileId: null, mime: 'image/png', name: 'wide.png', size: wblob.size }]
  }, [{ id: wid, docId: 'crop-2', data: wblob, mime: 'image/png', size: wblob.size }]);
});

await page.goto(BASE + '#/doc/crop-1');
await page.waitForSelector('img.anchor');
const anchorDefault = await frameOf(page, 'img.anchor');
t('בלי בחירה, העוגן בראש התמונה',
  anchorDefault.x === 50 && anchorDefault.y === 0, JSON.stringify(anchorDefault));

await page.goto(BASE + '#/doc/crop-1/edit');
await page.waitForSelector('.crop-box');
await page.waitForTimeout(250);
t('בטופס העריכה יש בורר מסגרת', await page.isVisible('.crop-range'));
t('והוא פעיל בתמונה גבוהה מהמסגרת',
  (await page.evaluate(() => document.querySelector('.crop-range').disabled)) === false);

/* גרירה כלפי מעלה מזיזה את החלון כלפי מטה בתמונה */
const cbox = await page.locator('.crop-box').boundingBox();
await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + 20);
await page.mouse.down();
await page.mouse.move(cbox.x + cbox.width / 2, cbox.y - 60, { steps: 10 });
await page.mouse.up();
const dragged = await page.evaluate(() => Number(document.querySelector('.crop-range').value));
t('גרירה מזיזה את המסגרת', dragged > 0, String(dragged));

await page.evaluate(() => {
  const s = document.querySelector('.crop-range');
  s.value = '70';
  s.dispatchEvent(new Event('input'));
});
const linked = await frameOf(page, '.crop-img');
t('והמחוון והתצוגה קשורים זה לזה', linked.x === 50 && linked.y === 70,
  JSON.stringify(linked));

await page.click('#doc-save');
await page.waitForSelector('.doc-head');
await page.waitForTimeout(250);
t('הבחירה נשמרת על הקובץ',
  (await page.evaluate(async () => (await window.DB.get('docs', 'crop-1')).files[0].focusY)) === 70);
const anchorDrawn = await frameOf(page, 'img.anchor');
t('והעוגן מצייר אותה', anchorDrawn.x === 50 && anchorDrawn.y === 70,
  JSON.stringify(anchorDrawn));

await page.goto(BASE + '#/doc/crop-1/edit');
await page.waitForSelector('.crop-range');
await page.waitForTimeout(250);
t('פתיחה מחדש של העריכה מציגה את מה שנבחר',
  (await page.evaluate(() => document.querySelector('.crop-range').value)) === '70');

/* ---------- הגדלה בבורר המסגרת ----------
   הדיווח: "אני רוצה לא רק להזיז את התמונה אלא גם להקטין ולהגדיל".
   מיקום בלבד אינו מספיק כשהנושא תופס רבע מהצילום. */
t('לבורר יש מחוון גודל', (await page.locator('.crop-zoom .crop-range').count()) === 1);
t('והוא מתחיל ב-100 אחוז, כלומר ממלא את המסגרת',
  (await page.inputValue('.crop-zoom .crop-range')) === '100');

const atOne = await frameOf(page, '.crop-img');
t('ובגודל 100 התמונה בדיוק ממלאת את המסגרת',
  Math.min(atOne.rw, atOne.rh) === 1 && atOne.rw >= 1 && atOne.rh >= 1,
  atOne.rw + 'x' + atOne.rh);

/* הדיווח השני: "נותן לי רק להגדיל ולא להקטין". 100 הוא נקודת ההתחלה
   ולא הרצפה — מתחתיו התמונה מתכווצת עד שכולה בתוך המסגרת. */
const floorAt = await page.evaluate(() =>
  Number(document.querySelector('.crop-zoom .crop-range').min));
t('והרצפה שלו מתחת ל-100, כלומר אפשר גם להקטין', floorAt < 100, String(floorAt));

await page.evaluate(() => {
  const z = document.querySelector('.crop-zoom .crop-range');
  z.value = z.min;
  z.dispatchEvent(new Event('input'));
});
const shrunk = await frameOf(page, '.crop-img');
const shrunkHint = await page.textContent('.crop-hint');
t('ההקטנה מכווצת את התצוגה', shrunk.rw < atOne.rw && shrunk.rh < atOne.rh,
  shrunk.rw + 'x' + shrunk.rh);
/* זו הבדיקה שתופסת את הבאג האמיתי: `object-fit: cover` עם `scale`
   מקטין את החיתוך ואינו מגלה את מה שנחתך, ואז `fits` לעולם לא מתקיים
   בשני הצירים. רק גאומטריה מפורשת מגיעה לכאן. */
t('וברצפה כל התמונה נכנסת למסגרת', shrunk.fits === true,
  shrunk.rw + 'x' + shrunk.rh);
t('וההודעה אומרת את זה', /כל התמונה/.test(shrunkHint), shrunkHint);

await page.evaluate(() => {
  const z = document.querySelector('.crop-zoom .crop-range');
  z.value = '100';
  z.dispatchEvent(new Event('input'));
});

await page.evaluate(() => {
  const z = document.querySelector('.crop-zoom .crop-range');
  z.value = '200';
  z.dispatchEvent(new Event('input'));
});
const zoomed = await frameOf(page, '.crop-img');
t('הזזת המחוון מגדילה את התצוגה',
  Math.abs(zoomed.rw / atOne.rw - 2) < 0.02 && Math.abs(zoomed.rh / atOne.rh - 2) < 0.02,
  zoomed.rw + '/' + atOne.rw);
t('והנקודה שנבחרה נשמרת בהגדלה', zoomed.x === 50 && zoomed.y === 70,
  JSON.stringify(zoomed));

await page.click('#doc-save');
await page.waitForSelector('.doc-head');
await page.waitForTimeout(250);
const savedFrame = await page.evaluate(async () =>
  (await window.DB.get('docs', 'crop-1')).files[0]);
t('ההגדלה נשמרת על הקובץ', savedFrame.focusZ === 2, String(savedFrame.focusZ));
t('וגם הציר הרוחבי, שנעשה חי ברגע שיש הגדלה',
  savedFrame.focusX === 50, String(savedFrame.focusX));
t('והמיקום לא נפגע', savedFrame.focusY === 70, String(savedFrame.focusY));
const anchorZoom = await frameOf(page, 'img.anchor');
t('והעוגן מצייר את ההגדלה',
  Math.abs(anchorZoom.rw / anchorDrawn.rw - 2) < 0.02,
  anchorZoom.rw + '/' + anchorDrawn.rw);
t('והעוגן יושב במעטפת שחותכת את מה שגלש', await page.evaluate(() => {
  const w = document.querySelector('.anchor-wrap');
  return !!w && w.contains(document.querySelector('img.anchor')) &&
         getComputedStyle(w).overflow === 'hidden';
}));
t('ולחיצה על העוגן עדיין פותחת את הצופה', await page.evaluate(() => {
  document.querySelector('.anchor-wrap').click();
  return !!document.querySelector('.viewer, .zoom-stage');
}));
await page.keyboard.press('Escape');

await page.goto(BASE + '#/doc/crop-1/edit');
await page.waitForSelector('.crop-zoom .crop-range');
await page.waitForTimeout(250);
t('פתיחה מחדש מציגה את ההגדלה שנבחרה',
  (await page.inputValue('.crop-zoom .crop-range')) === '200');

await page.evaluate(() => {
  const z = document.querySelector('.crop-zoom .crop-range');
  z.value = '100';
  z.dispatchEvent(new Event('input'));
});
const backToOne = await frameOf(page, '.crop-img');
t('וחזרה ל-100 מחזירה בדיוק למילוי המסגרת',
  Math.min(backToOne.rw, backToOne.rh) === 1, backToOne.rw + 'x' + backToOne.rh);

/* הקטנה היא בחירה ככל בחירה אחרת, ולכן היא נשמרת ומצוירת כמוה */
await page.evaluate(() => {
  const z = document.querySelector('.crop-zoom .crop-range');
  z.value = z.min;
  z.dispatchEvent(new Event('input'));
});
const smallZ = await page.evaluate(() =>
  Number(document.querySelector('.crop-zoom .crop-range').value) / 100);
await page.click('#doc-save');
await page.waitForSelector('.doc-head');
await page.waitForTimeout(250);
const savedSmall = await page.evaluate(async () =>
  (await window.DB.get('docs', 'crop-1')).files[0].focusZ);
t('הקטנה נשמרת על הקובץ כמו הגדלה', savedSmall === smallZ && savedSmall < 1,
  String(savedSmall));
const anchorSmall = await frameOf(page, 'img.anchor');
t('והעוגן מצייר גם אותה',
  Math.abs(anchorSmall.rw / anchorDrawn.rw - smallZ) < 0.02,
  anchorSmall.rw + '/' + anchorDrawn.rw);
t('והמעטפת מציגה רקע במקום לחתוך', anchorSmall.fits === true,
  anchorSmall.rw + 'x' + anchorSmall.rh);

await page.goto(BASE + '#/doc/crop-2/edit');
await page.waitForSelector('.crop-range');
await page.waitForTimeout(300);
const flat = await page.evaluate(() => ({
  off: document.querySelector('.crop-range').disabled,
  hint: document.querySelector('.crop-hint').textContent
}));
t('בתמונה רחבה מהמסגרת הבורר מושבת', flat.off === true);
t('ואומר למה, במקום להזיז ולא לעשות כלום', /רחבה מהמסגרת/.test(flat.hint), flat.hint);

/* הליבה של החישוב: הסרך בהגדלה z אינו הכפלה של הסרך ב-1, מפני
   שהתמונה גדלה והמסגרת לא. ציר שלא היה בו מה להזיז נעשה חי. */
await page.evaluate(() => {
  const z = document.querySelector('.crop-zoom .crop-range');
  z.value = '150';
  z.dispatchEvent(new Event('input'));
});
const opened = await page.evaluate(() => ({
  off: document.querySelector('.crop-range').disabled,
  hint: document.querySelector('.crop-hint').textContent
}));
t('הגדלה פותחת מקום לתזוזה בציר שלא היה בו', opened.off === false);
t('וההודעה מפסיקה לומר שאין מה להזיז', !/רחבה מהמסגרת/.test(opened.hint), opened.hint);

const focusSync = await page.evaluate(async () => {
  const doc = await window.DB.get('docs', 'crop-1');
  const out = window.Sync.mergeRecords('docs', [
    { id: 'crop-1', updatedAt: (doc.updatedAt || 0) + 1000, entityId: 'e-itamar',
      typeKey: 'generic', title: 'תעודה גבוהה', fields: [], deleted: 0,
      files: [{ driveFileId: 'g1', mime: 'image/png', name: 'tall.png', size: 9,
                focusX: 40, focusY: 70, focusZ: 1.5 }] },
    /* קובץ מצד מרוחק ישן, מלפני שההגדלה הייתה קיימת */
    { id: 'crop-old', updatedAt: 9, entityId: 'e-itamar', typeKey: 'generic',
      title: 'ישן', fields: [], deleted: 0,
      files: [{ driveFileId: 'g2', mime: 'image/png', name: 'o.png', size: 9, focusY: 20 }] }
  ], [doc]);
  const exported = await window.Sync.exportDb();
  const mine = exported.docs.filter(d => d.id === 'crop-1')[0];
  const oldOne = out.writes.filter(w => w.id === 'crop-old')[0].files[0];
  return {
    merged: out.writes[0].files[0], exported: mine.files[0],
    mineZ: doc.files[0].focusZ,
    oldZ: oldOne.focusZ, oldX: oldOne.focusX
  };
});
t('המסגרת נוסעת בייצוא לדרייב', focusSync.exported.focusY === 70,
  String(focusSync.exported.focusY));
t('ושורדת מיזוג במקום להתאפס', focusSync.merged.focusY === 70,
  String(focusSync.merged.focusY));
t('וגם ההגדלה נוסעת — בשני הכיוונים',
  focusSync.exported.focusZ === focusSync.mineZ && focusSync.mineZ < 1 &&
  focusSync.merged.focusZ === 1.5,
  focusSync.exported.focusZ + ' / ' + focusSync.merged.focusZ);
t('וגם הציר הרוחבי', focusSync.exported.focusX === 50 && focusSync.merged.focusX === 40,
  focusSync.exported.focusX + ' / ' + focusSync.merged.focusX);
/* ברירת המחדל של הגדלה היא 1 ולא 0 — אחרת מסמך שנשמר לפני התכונה
   היה חוזר מהמיזוג בהגדלה אפס, כלומר נעלם. */
t('וקובץ ישן בלי הגדלה חוזר עם 1, לא עם 0', focusSync.oldZ === 1, String(focusSync.oldZ));
t('ובלי ציר רוחבי חוזר עם מרכז', focusSync.oldX === 50, String(focusSync.oldX));

/* ---------- 1 · הדבקת קובץ ---------- */
console.log('\n— הדבקת קובץ —');
const paste = await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([37, 80, 68, 70])], 'x.pdf', { type: 'application/pdf' }));
  const got = window.Files.fromDataTransfer(dt);
  return { n: got.length, mime: got[0] && got[0].type };
});
t('קובץ PDF מהלוח מזוהה', paste.n === 1 && paste.mime === 'application/pdf', JSON.stringify(paste));

/* **המסלול היחיד שבו PDF באמת מגיע מהלוח** הוא אירוע `paste` אמיתי.
   ה-Clipboard API האסינכרוני אינו מוסר `application/pdf` בשום דפדפן —
   הבדיקה למטה מוודאת את זה מול הדפדפן ולא מול הנחה. */
const realPaste = await page.evaluate(async () => {
  window.App.staged = [];
  location.hash = '#/entities';
  await window.App.render();
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])],
    'policy.pdf', { type: 'application/pdf' }));
  document.body.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dt, bubbles: true, cancelable: true
  }));
  await new Promise(r => setTimeout(r, 600));
  return { staged: window.App.staged.map(f => f.mime + '|' + f.name), hash: location.hash };
});
t('הדבקת PDF באירוע אמיתי מצרפת את הקובץ',
  realPaste.staged.join(',') === 'application/pdf|policy.pdf', realPaste.staged.join(','));
t('ופותחת את טופס המסמך', realPaste.hash === '#/doc/new', realPaste.hash);

const targetPaste = await page.evaluate(async () => {
  window.App.staged = [];
  location.hash = '#/entities';
  await window.App.render();
  window.Screens.pasteSheet();
  await new Promise(r => setTimeout(r, 200));
  const target = document.querySelector('.paste-target');
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([37, 80, 68, 70])], 'x.pdf', { type: 'application/pdf' }));
  target.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dt, bubbles: true, cancelable: true
  }));
  await new Promise(r => setTimeout(r, 600));
  return { staged: window.App.staged.map(f => f.mime), hash: location.hash };
});
t('והדבקה לתוך המסגרת עובדת גם היא',
  targetPaste.staged.join(',') === 'application/pdf', targetPaste.staged.join(','));

const apiLimit = await page.evaluate(async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'application/pdf': new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' })
    })]);
    return { supported: true };
  } catch (e) { return { supported: false, err: String(e.message || e) }; }
});
t('ה-Clipboard API אינו יודע PDF כלל — ולכן הכפתור אינו יכול להסתמך עליו',
  apiLimit.supported === false, apiLimit.err);

/* לוח עם טקסט בלבד ובלי הסכמת פרסינג: המסלול חייב להסתיים ביעד ההדבקה,
   שבו הדבקת קובץ כן עובדת, ולא בהודעה שמפנה להגדרות ונגמרת. */
const deadEnd = await page.evaluate(async () => {
  location.hash = '#/entities';
  await window.App.render();
  const orig = navigator.clipboard.read, origT = navigator.clipboard.readText;
  navigator.clipboard.read = () => Promise.resolve([{
    types: ['text/plain'], getType: (t) => Promise.resolve(new Blob(['policy.pdf'], { type: t }))
  }]);
  navigator.clipboard.readText = () => Promise.resolve('policy.pdf');
  window.App.pasteRoute();
  await new Promise(r => setTimeout(r, 600));
  navigator.clipboard.read = orig;
  navigator.clipboard.readText = origT;
  const sheet = document.querySelector('.paste-target');
  const reason = document.querySelector('.sheet-p');
  return { sheet: !!sheet, reason: reason ? reason.textContent : '' };
});
t('לוח בלי קובץ נופל ליעד ההדבקה במקום להיתקע', deadEnd.sheet === true);
t('וההסבר אומר איפה כן להדביק', /הדבק כאן במסגרת/.test(deadEnd.reason), deadEnd.reason);
await page.evaluate(() => {
  const b = document.querySelector('.backdrop');
  if (b) b.remove();
});

/* הבאג שדווח מהמכשיר: הדבקה שלא מסרה קובץ — המצב הרגיל ב-iOS — סגרה
   את הגיליון והחזירה את המשתמש למסך הישות בלי מילה. */
const emptyPaste = await page.evaluate(async () => {
  location.hash = '#/entities';
  await window.App.render();
  window.App.staged = [];
  window.Screens.pasteSheet();
  await new Promise(r => setTimeout(r, 200));
  const target = document.querySelector('.paste-target');
  const dt = new DataTransfer();   /* לוח ריק — בדיוק מה ש-iOS מוסר */
  target.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dt, bubbles: true, cancelable: true
  }));
  await new Promise(r => setTimeout(r, 400));
  return {
    stillOpen: !!document.querySelector('.paste-target'),
    err: (document.querySelector('.sheet .form-err') || {}).textContent || '',
    hash: location.hash
  };
});
t('הדבקה שלא מסרה קובץ אינה סוגרת את הגיליון', emptyPaste.stillOpen === true);
t('ואומרת מה קרה במקום להיעלם', /לא מסרה קובץ/.test(emptyPaste.err), emptyPaste.err);
t('והמשתמש לא נזרק מהזרימה', emptyPaste.hash === '#/entities', emptyPaste.hash);

const primary = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.sheet .btn')]
    .filter(x => x.textContent.indexOf('בחירת קובץ') !== -1)[0];
  return b ? b.className : '';
});
t('בורר הקבצים הוא הפעולה הראשית, לא נסיגה',
  primary.indexOf('ghost') === -1, primary);
await page.evaluate(() => {
  const b = document.querySelector('.backdrop');
  if (b) b.remove();
});

/* וכשההדבקה כן מסרה קובץ — הגיליון נסגר, כמו קודם */
const goodPaste = await page.evaluate(async () => {
  location.hash = '#/entities';
  await window.App.render();
  window.App.staged = [];
  window.Screens.pasteSheet();
  await new Promise(r => setTimeout(r, 200));
  const target = document.querySelector('.paste-target');
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([37, 80, 68, 70])], 'ok.pdf', { type: 'application/pdf' }));
  target.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dt, bubbles: true, cancelable: true
  }));
  await new Promise(r => setTimeout(r, 600));
  return { closed: !document.querySelector('.paste-target'), staged: window.App.staged.length };
});
t('הדבקה שכן מסרה קובץ סוגרת וממשיכה',
  goodPaste.closed === true && goodPaste.staged === 1, JSON.stringify(goodPaste));

const nameFor = await page.evaluate(() => [
  window.Files.nameFor('application/pdf'),
  window.Files.nameFor('image/png'),
  window.Files.nameFor('image/jpeg')
].join('|'));
t('לקובץ מהלוח יש שם עם סיומת', nameFor === 'הדבקה.pdf|הדבקה.png|הדבקה.jpg', nameFor);

await page.goto(BASE + '#/entities');
await page.waitForSelector('.scr');
await page.evaluate(() => window.Screens.pasteSheet());
await page.waitForSelector('.paste-target');
t('ליעד ההדבקה יש גם מסלול בחירת קובץ',
  (await page.locator('.sheet .btn', { hasText: 'בחירת קובץ מהמכשיר' }).count()) === 1);
await page.click('.sheet-h .iconbtn');
await page.waitForSelector('.backdrop', { state: 'detached' });

/* ---------- 10 · העוזר ---------- */
console.log('\n— העוזר —');
await page.goto(BASE + '#/chat');
await page.waitForSelector('.scr');
t('בלי מפתח, העוזר מסביר ומפנה להגדרות', await page.isVisible('.empty .btn'));

await page.evaluate(async () => {
  const S = window.Settings, C = window.CONFIG;
  await S.set(C.K.geminiKey, 'k');
  await S.set(C.K.geminiConsentChat, true);
});
/* אותה כתובת בדיוק אינה טוענת מחדש — ניווט לאותו fragment הוא no-op */
await page.evaluate(() => window.App.render());
await page.waitForSelector('.chat-bar');
t('עם מפתח והסכמה נפתחת שיחה', await page.isVisible('.chat-in'));

const consent = await page.evaluate(async () => {
  const S = window.Settings, C = window.CONFIG;
  await S.set(C.K.geminiConsentChat, false);
  const off = window.Chat.ready();
  await S.set(C.K.geminiConsentChat, true);
  return { off, on: window.Chat.ready(), textOnly: window.Gemini.consented('text') };
});
t('הסכמת השיחה נפרדת משתי האחרות', consent.off === false && consent.on === true);
t('והסכמת טקסט אינה מתירה אותה', consent.textOnly === false);

const context = await page.evaluate(async () => {
  const DB = window.DB;
  const pass = {
    id: 'p-1', entityId: 'e-itamar', typeKey: 'passport', title: 'דרכון',
    fields: [{ key: 'passportNumber', label: 'מספר דרכון', value: 'M4821639', kind: 'passport', sensitive: true, verified: true }],
    issueDate: null, expiryDate: '2030-01-01', files: [], source: 'upload', notes: 'פרטי',
    supersededBy: null, deleted: 0
  };
  await DB.saveDoc(pass, []);
  await window.Screens.reload();
  const S = window.Screens.state;
  const ctx = window.Chat.context(S.entities, S.docs);
  const json = JSON.stringify(ctx);
  return {
    hasOld: json.indexOf('v-old') !== -1,
    hasNew: json.indexOf('v-new') !== -1,
    passportNumber: json.indexOf('M4821639') !== -1,
    passportListed: ctx.docs.some(d => d.id === 'p-1'),
    today: ctx.today
  };
});
t('הקשר השיחה אינו כולל גרסאות שנדחקו', context.hasOld === false);
t('וכולל את העדכנית', context.hasNew === true);
t('מספר הדרכון אינו עוזב את המכשיר גם כאן', context.passportNumber === false);
t('אבל הדרכון עצמו מופיע, בלי שדותיו', context.passportListed === true);
t('והתאריך של היום נשלח', /^\d{4}-\d{2}-\d{2}$/.test(context.today), context.today);

const prompt = await page.evaluate(() => {
  const S = window.Screens.state;
  const p = window.Chat.prompt(window.Chat.context(S.entities, S.docs));
  const keys = window.DOC_TYPES.all().map(t => t.key);
  return { missing: keys.filter(k => p.indexOf(k) === -1), hasOps: p.indexOf('setField') !== -1 };
});
t('הפרומפט נבנה מהטבלה וכולל את כל הסוגים', prompt.missing.length === 0, prompt.missing.join(','));
t('ומכיל את הפעולות', prompt.hasOps === true);

const compiled = await page.evaluate(() => {
  const S = window.Screens.state;
  const st = { entities: S.entities, docs: S.live };
  return {
    good: window.Chat.compile([
      { op: 'setField', docId: 'f-1', key: 'issuer', value: 'משרד הפנים' }
    ], st),
    badKey: window.Chat.compile([
      { op: 'setField', docId: 'f-1', key: 'notAField', value: 'x' }
    ], st),
    badDoc: window.Chat.compile([
      { op: 'setField', docId: 'nope', key: 'issuer', value: 'x' }
    ], st),
    badDate: window.Chat.compile([
      { op: 'setDate', docId: 'f-1', which: 'expiryDate', value: '2026-02-30' }
    ], st),
    badOp: window.Chat.compile([{ op: 'deleteEverything' }], st),
    mismatch: window.Chat.compile([
      { op: 'createDoc', entityId: 'e-itamar', typeKey: 'vehicle_test', fields: { plate: '8452103' }, expiryDate: '2027-01-01' }
    ], st),
    unverified: window.Chat.compile([
      { op: 'setField', docId: 'f-1', key: 'reference', value: 'abc' }
    ], st)
  };
});
t('פעולה תקינה מתקמפלת לשינוי אחד', compiled.good.ops.length === 1 && !compiled.good.errors.length);
t('ויש לה תיאור בעברית', /גורם מנפיק/.test(compiled.good.ops[0].text), compiled.good.ops[0].text);
t('שדה שאינו בטבלה נפסל', compiled.badKey.ops.length === 0 && compiled.badKey.errors.length === 1,
  compiled.badKey.errors.join(','));
t('מזהה מומצא נפסל', compiled.badDoc.ops.length === 0 && compiled.badDoc.errors.length === 1);
t('תאריך שאינו קיים נפסל', compiled.badDate.ops.length === 0, compiled.badDate.errors.join(','));
t('פעולה לא מוכרת נפסלת', compiled.badOp.ops.length === 0 && compiled.badOp.errors.length === 1);
t('סוג שאינו מתאים לישות נפסל', compiled.mismatch.ops.length === 0, compiled.mismatch.errors.join(','));
t('ערך שנכשל בוולידטור נשמר מסומן ולא נזרק',
  compiled.unverified.ops.length === 1 && compiled.unverified.ops[0].field.verified === true,
  JSON.stringify(compiled.unverified.ops[0] && compiled.unverified.ops[0].field));

const applied = await page.evaluate(async () => {
  const S = window.Screens.state;
  const out = window.Chat.compile([
    { op: 'setField', docId: 'f-1', key: 'issuer', value: 'משרד הפנים' },
    { op: 'setNotes', docId: 'f-1', value: 'נבדק' }
  ], { entities: S.entities, docs: S.live });
  const beforeDoc = await window.DB.get('docs', 'f-1');
  const untouched = !(beforeDoc.fields || []).some(f => f.key === 'issuer');
  await window.Chat.apply(out.ops);
  const after = await window.DB.get('docs', 'f-1');
  return {
    untouched,
    issuer: (after.fields || []).filter(f => f.key === 'issuer')[0],
    notes: after.notes
  };
});
/* ---------- מה שהתקבל מנאביגו ---------- */
const navigo = await page.evaluate(async () => {
  await window.Screens.reload();
  const S = window.Screens.state;
  const st = { entities: S.entities, docs: S.live };
  const out = window.Chat.compile([
    { op: 'setField', docId: 'f-1', key: 'issuer', value: 'משרד התחבורה' },
    { op: 'clearField', docId: 'f-1', key: 'reference' },
    { op: 'moveDoc', docId: 'f-1', entityId: 'e-dana' }
  ], st);
  return {
    safe: out.ops.map(o => o.op + ':' + o.safe),
    beforeText: out.ops[0].beforeText,
    outcome: window.Chat.outcomeText([out.ops[0]], [out.ops[2]])
  };
});
t('פעולות בטוחות מסומנות וכל השאר לא',
  navigo.safe.join(',') === 'setField:true,clearField:false,moveDoc:false',
  navigo.safe.join(','));
t('והכרטיס יודע מה הערך הקודם', navigo.beforeText === 'משרד הפנים', navigo.beforeText);
t('התוצאה שחוזרת למודל כוללת גם את מה שנדחה',
  /הוחל:/.test(navigo.outcome) && /נדחה על ידי המשתמש:/.test(navigo.outcome),
  navigo.outcome);

const ctxShape = await page.evaluate(async () => {
  const DB = window.DB;
  await DB.saveDoc({
    id: 'stale-1', entityId: 'e-car', typeKey: 'vehicle_test', title: 'טסט עתיק',
    fields: [{ key: 'plate', label: 'מספר רישוי', value: '9998887', kind: 'plate', sensitive: false, verified: true }],
    issueDate: null, expiryDate: '2019-01-01', files: [], source: 'upload', notes: 'סודי',
    supersededBy: null, deleted: 0
  }, []);
  await window.Screens.reload();
  const S = window.Screens.state;
  const ctx = window.Chat.context(S.entities, S.docs);
  const stale = ctx.docs.filter(d => d.id === 'stale-1')[0];
  const fresh = ctx.docs.filter(d => d.expiryDate && !d.stale)[0];
  return {
    stale: stale, hasFields: !!(stale && stale.fields), counts: ctx.counts,
    freshDays: fresh ? ('daysLeft' in fresh) : 'no-doc-with-expiry',
    size: window.Chat.contextSize(ctx)
  };
});
t('מסמך שפג מזמן מצטמצם לשורה', ctxShape.stale && ctxShape.stale.stale === true);
t('ושדותיו והערותיו אינם נשלחים כלל', ctxShape.hasFields === false);
t('אבל התפוגה שלו כן, כדי שאפשר יהיה לשאול עליו',
  ctxShape.stale.expiryDate === '2019-01-01', String(ctxShape.stale.expiryDate));
t('ההקשר נושא ספירה לפי סוג', ctxShape.counts && ctxShape.counts.vehicle_test >= 1,
  JSON.stringify(ctxShape.counts));
t('וימים עד תפוגה מחושבים מראש', ctxShape.freshDays === true, String(ctxShape.freshDays));
t('וגודל ההקשר ניתן למדידה', ctxShape.size > 0, String(ctxShape.size));

const rules = await page.evaluate(() => {
  const S = window.Screens.state;
  return window.Chat.prompt(window.Chat.context(S.entities, S.docs));
});
t('הפרומפט אוסר להמציא מבנה בשדה טקסט חופשי', /אל תמציא מבנה בשדה טקסט חופשי/.test(rules));
t('ואומר שהאימות אינו בידי המודל', /אינך קובע אם ערך מאומת/.test(rules));
t('ושלא לחשב ימים בעצמו', /daysLeft כבר מחושב/.test(rules));

t('קימפול לבדו אינו כותב כלום', applied.untouched === true);
t('ורק ההחלה כותבת', applied.issuer && applied.issuer.value === 'משרד הפנים',
  JSON.stringify(applied.issuer));
t('גם הערות', applied.notes === 'נבדק', applied.notes);

/* ---------- אין תלות ברשת ---------- */
console.log('\n— אין תלות ברשת —');
/* blob: הוא זיכרון מקומי, לא דומיין. `Share.download` והאווטאר מייצרים
   כאלה, והם נספרים כבקשות — אבל אינם עוזבים את המכשיר. */
const external = reqs.filter(u => !u.startsWith('http://127.0.0.1:8777') &&
  !u.startsWith('data:') && !u.startsWith('blob:'));
t('אפס בקשות לדומיין חיצוני', external.length === 0, external.join(' | '));

const purity = await page.evaluate(() =>
  Promise.all(['/js/screens.js', '/js/forms.js'].map(f =>
    fetch(f).then(r => r.text()).then(src =>
      window.DOC_TYPES.all().map(t => t.key)
        .filter(k => new RegExp("['\"]" + k + "['\"]").test(src))))));
t('screens.js עדיין אינו מזכיר מפתח סוג', purity[0].length === 0, purity[0].join(','));
t('forms.js עדיין אינו מזכיר מפתח סוג', purity[1].length === 0, purity[1].join(','));

t('אפס שגיאות', errs.length === 0, errs.slice(0, 3).join(' | '));

/* ---------- 3 · אותו באג, דרך הטופס ----------
   הבדיקות למעלה קוראות ל-`Versions` ישירות. זו עוברת במסלול שהמשתמש
   עובר בפועל: כספת נקייה, טופס, שמירה — ובודקת מה נשאר על המסך. */
console.log('\n— מסמך מעודכן דרך הטופס —');
const ctx2 = await browser.newContext({ viewport: { width: 420, height: 920 }, locale: 'he-IL' });
const p2 = await ctx2.newPage();
const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
p2.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
await p2.goto(BASE);
await p2.waitForSelector('.scr-title');
await p2.evaluate(async () => {
  await window.DB.saveEntity({
    id: 'car', type: 'vehicle', name: 'מאזדה', color: '#4B6B7A', avatar: 'מ', sortOrder: 1
  });
  await window.App.render();
});

async function newDoc(typeLabel, plate, expiry) {
  await p2.click('.fab');
  await p2.waitForSelector('.routes');
  await p2.click('.routes .route:has-text("הזנה ידנית")');
  await p2.waitForSelector('#d-type');
  await p2.selectOption('#d-type', { label: typeLabel });
  await p2.waitForSelector('#f-plate');
  await p2.fill('#f-plate', plate);
  await p2.fill('#d-expiry', expiry);
  await p2.click('#doc-save');
  await p2.waitForSelector('.doc-head');
}

await newDoc('טסט', '8452103', '2025-03-01');
await newDoc('טסט', '8452103', '2027-03-01');
t('אחרי השמירה, המסך מציג גרסאות קודמות',
  (await p2.locator('.files-h', { hasText: 'גרסאות קודמות' }).count()) === 1);

await p2.goto(BASE + '#/entity/car');
await p2.waitForSelector('.scr');
const liveCards = await p2.evaluate(() =>
  [...document.querySelectorAll('.card-t')].map(x => x.textContent));
t('במסך הישות נשאר כרטיס אחד', liveCards.length === 1, liveCards.join(','));
t('והישן מקופל ולא נמחק',
  (await p2.locator('.fold', { hasText: 'גרסאות קודמות' }).count()) === 1);

await p2.goto(BASE + '#/quick');
await p2.waitForSelector('.search-i');
await p2.fill('.search-i', '8452103');
await p2.waitForTimeout(250);
const quickRows = await p2.locator('.row').count();
t('וההעתקה המהירה מחזירה שורה אחת, מהעדכני', quickRows === 1, String(quickRows));

const expiries = await p2.evaluate(() => {
  const g = window.Expiry.group(window.Screens.state.live);
  return { ok: g.ok.length, past: g.past.length };
});
t('מנוע התפוגה רואה רק את העדכני', expiries.ok === 1 && expiries.past === 0,
  JSON.stringify(expiries));
t('אפס שגיאות במסלול הטופס', errs2.length === 0, errs2.slice(0, 3).join(' | '));

/* ---------- תעודה שאין לה שורה בטבלה, דרך הטופס ----------
   הדיווח: "הפרסינג לא עובד כראוי אם מדובר בתעודה לא מוכרת". הסוג הפתוח
   קלט אותה, אבל כל מה שנקרא ממנה מעבר לשלוש העמודות שלו נזרק בדרך —
   ולכן המשתמש ראה טופס כמעט ריק וקרא לזה "לא עובד". */
console.log('\n— תעודה לא מוכרת דרך הטופס —');

await p2.click('.fab');
await p2.waitForSelector('.routes');
await p2.click('.routes .route:has-text("הזנה ידנית")');
await p2.waitForSelector('#d-type');
await p2.selectOption('#d-type', { label: 'מסמך כללי' });
await p2.waitForSelector('#f-title');

t('לסוג פתוח יש דרך להוסיף שדה ביד',
  (await p2.locator('button:has-text("הוספת שדה")').count()) === 1);

await p2.selectOption('#d-type', { label: 'טסט' });
await p2.waitForSelector('#f-plate');
t('ולסוג סגור אין',
  (await p2.locator('button:has-text("הוספת שדה")').count()) === 0);

await p2.selectOption('#d-type', { label: 'מסמך כללי' });
await p2.waitForSelector('#f-title');
await p2.fill('#f-title', 'אישור ניהול חשבון');

await p2.click('button:has-text("הוספת שדה")');
await p2.waitForSelector('#x-l-0');
await p2.fill('#x-l-0', 'מספר חשבון');
await p2.fill('#x-v-0', '12-345-678901');

/* שורה שנפתחה ולא מולאה — לא אמורה להישמר בכלל */
await p2.click('button:has-text("הוספת שדה")');
await p2.waitForSelector('#x-l-1');
await p2.fill('#x-l-1', 'סניף');

await p2.click('#doc-save');
await p2.waitForSelector('.doc-head');

const openDoc = await p2.evaluate(() => {
  const d = window.Screens.state.docs.filter(x => x.typeKey === 'generic')[0];
  return { fields: d.fields.map(f => f.key + '=' + f.label + '=' + f.value), id: d.id };
});
t('השדה שנוסף ביד נשמר על המסמך',
  openDoc.fields.some(f => /מספר חשבון=12-345-678901$/.test(f)), openDoc.fields.join(' | '));
t('ושורה חצי-ריקה אינה הופכת לשדה',
  !openDoc.fields.some(f => /סניף/.test(f)), openDoc.fields.join(' | '));

const shownRows = await p2.evaluate(() =>
  [...document.querySelectorAll('.row-l')].map(x => x.textContent));
t('ומסך המסמך מציג אותו כמו כל שדה אחר',
  shownRows.indexOf('מספר חשבון') !== -1, shownRows.join(','));

await p2.goto(BASE + '#/doc/' + openDoc.id + '/edit');
await p2.waitForSelector('#x-l-0');
t('ועריכה חוזרת טוענת אותו ולא מוחקת אותו',
  (await p2.inputValue('#x-l-0')) === 'מספר חשבון' &&
  (await p2.inputValue('#x-v-0')) === '12-345-678901');

/* הסרה, ואז שמירה: השדה יורד מהמסמך */
await p2.click('.f-x-h .iconbtn');
await p2.click('#doc-save');
await p2.waitForSelector('.doc-head');
t('והסרה מורידה אותו',
  (await p2.evaluate(id => window.Screens.state.docs.filter(x => x.id === id)[0]
    .fields.every(f => f.label !== 'מספר חשבון'), openDoc.id)) === true);

/* אותו מסלול, אבל מפרסינג: ההצעה נכנסת לטופס בלי שהמשתמש יקליד */
const proposed = await p2.evaluate(async () => {
  window.App.proposal = Object.assign(window.Parse.empty('generic'), {
    values: { title: 'תעודת הסמכה' },
    extra: [
      { key: 'x_מספר_רישום', label: 'מספר רישום', value: '55-9931' },
      { key: 'idNumber', label: 'מספר תעודת זהות', value: '123456782' }
    ],
    notice: { level: 'ok', text: 'שדות מולאו' }
  });
  window.App.pendingEntityId = 'car';
  location.hash = '#/doc/new';
  await window.App.render();
  return [...document.querySelectorAll('.f-x-l')].map(x => x.value);
});
t('הצעת פרסינג מציירת את השדות הפתוחים בטופס',
  proposed.join(',') === 'מספר רישום,מספר תעודת זהות', proposed.join(','));

await p2.fill('#d-expiry', '2030-01-01');
await p2.click('#doc-save');
await p2.waitForSelector('.doc-head');
const parsedRows = await p2.evaluate(() =>
  [...document.querySelectorAll('.row-l')].map(x => x.textContent));
t('והשמירה מעבירה אותם למסמך',
  parsedRows.indexOf('מספר רישום') !== -1 && parsedRows.indexOf('מספר תעודת זהות') !== -1,
  parsedRows.join(','));

/* ---------- מה שמסך ההגדרות אומר על הדרייב ----------
   הדיווח: "בכרטיסיה האחרונה כתוב שהמידע לא נשמר לדרייב, וזה לא נכון".
   השורה נכתבה לפני שהיה גיבוי ונשארה אחריו. */
console.log('\n— מסך ההגדרות אינו מכחיש את עצמו —');
await p2.goto(BASE + '#/settings');
await p2.waitForSelector('.sect');
const aboutText = await p2.evaluate(() =>
  [...document.querySelectorAll('.sect')].pop().textContent);
t('אין יותר טענה שגיבוי לדרייב לא קיים',
  !/עדיין לא קיים/.test(aboutText), aboutText);
t('ומי שאינו מחובר מופנה להגדרה שקיימת',
  /גיבוי לדרייב קיים ואינו מחובר/.test(aboutText), aboutText);
t('המסך עצמו עדיין מציע גיבוי לדרייב',
  (await p2.locator('.sect-h', { hasText: 'גיבוי לדרייב' }).count()) === 1);
t('אפס שגיאות בשני המסלולים החדשים', errs2.length === 0, errs2.slice(0, 3).join(' | '));

/* ---------- מסמך רב-עמודים ---------- */
console.log('\n— מסמך רב-עמודים —');
/* הדיווח: "רואים חלקית". שתי סיבות נפרדות היו לזה — תקרה של 20 עמודים,
   ומשטח שאי אפשר היה לגלול בו באצבע כשאינו מוגדל. הבדיקה תופסת את שתיהן. */

/* PDF אמיתי, נבנה כאן ולא נשמר כקובץ: בדיקה שתלויה בפיקסצ׳ר שאבד היא
   בדיקה שלא רצה, וזה כבר קרה בסוויטה הזאת. */
function makePdf(n) {
  const objs = [];
  const kids = Array.from({ length: n }, (_, i) => `${3 + 2 * i} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  for (let i = 0; i < n; i++) {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${3 + 2 * n} 0 R >> >> /Contents ${4 + 2 * i} 0 R >>`);
    const st = `BT /F1 48 Tf 60 700 Td (Page ${i + 1}) Tj ET`;
    objs.push(`<< /Length ${st.length} >>\nstream\n${st}\nendstream`);
  }
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((body, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach(o => { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const PAGES = 7;
await page.evaluate(src => { window.__pdf = src; }, makePdf(PAGES));
await page.evaluate(() => {
  const bytes = new Uint8Array(window.__pdf.length);
  for (let i = 0; i < window.__pdf.length; i++) bytes[i] = window.__pdf.charCodeAt(i);
  window.__blob = new Blob([bytes], { type: 'application/pdf' });
  window.UI.viewer({ mime: 'application/pdf', data: window.__blob }, 'multi.pdf');
});
await page.waitForFunction(() => document.querySelectorAll('.pdf-page').length > 1, null, { timeout: 15000 });
await page.waitForTimeout(900);

const shape = await page.evaluate(() => {
  const st = document.querySelector('.zoom-stage');
  return {
    slots: document.querySelectorAll('.pdf-page').length,
    drawn: document.querySelectorAll('.pdf-page canvas').length,
    ratio: document.querySelector('.pdf-page').style.aspectRatio,
    hint: document.querySelector('.viewer-hint').textContent,
    over: st.scrollHeight - st.clientHeight
  };
});
t('כל העמודים קיימים, בלי תקרה', shape.slots === PAGES, JSON.stringify(shape));
t('אבל לא כולם מצוירים בבת אחת', shape.drawn > 0 && shape.drawn < PAGES, String(shape.drawn));
t('לכל עמוד שמור מקום במידות האמיתיות שלו', shape.ratio === '595 / 842', shape.ratio);
t('המונה אומר כמה עמודים יש', /1 מתוך 7/.test(shape.hint), shape.hint);
t('והמסמך ארוך מהמשטח — כלומר יש מה לגלול', shape.over > 500, String(shape.over));

/* גרירה באצבע אחת, בקנה מידה 1. זה מה שלא עבד: `touch-action: none`
   מבטל את הגלילה של הדפדפן, והקוד גלל רק כשהיה מוגדל. */
const stBox = await page.locator('.zoom-stage').boundingBox();
const cx = stBox.x + stBox.width / 2, cy = stBox.y + stBox.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(cx, cy - i * 28);
await page.mouse.up();
await page.waitForTimeout(300);
const scrolled = await page.evaluate(() => Math.round(document.querySelector('.zoom-stage').scrollTop));
t('גרירה באצבע אחת גוללת גם בלי להגדיל', scrolled > 100, String(scrolled));

const deep = await page.evaluate(async () => {
  const st = document.querySelector('.zoom-stage');
  st.scrollTop = st.scrollHeight;
  await new Promise(r => setTimeout(r, 900));
  return {
    hint: document.querySelector('.viewer-hint').textContent,
    last: !!document.querySelector('.pdf-page[data-page="7"] canvas'),
    drawn: document.querySelectorAll('.pdf-page canvas').length
  };
});
t('העמוד האחרון מצויר כשמגיעים אליו', deep.last, JSON.stringify(deep));
t('והמונה עוקב אחרי המיקום', /מתוך 7/.test(deep.hint) && !/^עמוד 1 /.test(deep.hint), deep.hint);
t('ומספר העמודים החיים נשאר חסום', deep.drawn <= 6, String(deep.drawn));

await page.evaluate(() => { document.querySelector('.backdrop').remove(); });

/* ---------- הכפתור "חזור" אחרי שמירה ----------
   הדיווח: "אחרי שמירה, חזור מחזיר אותי לטופס. אבל פלואו השמירה נגמר —
   הוא אמור להחזיר אותי לרשימת מסמכי הישות."
   נכון. הטופס נשאר רשומה בהיסטוריה אחרי שסיים את תפקידו. */
console.log('\n— חזור אחרי שמירה —');

async function backBtn(pg) {
  await pg.locator('.scr-head .iconbtn').first().click();
  await pg.waitForTimeout(350);
  return pg.evaluate(() => location.hash);
}

await p2.goto(BASE + '#/entity/car');
await p2.waitForSelector('.scr');
await p2.click('.fab');
await p2.waitForSelector('.routes');
await p2.click('.routes .route:has-text("הזנה ידנית")');
await p2.waitForSelector('#d-type');

const stampOnForm = await p2.evaluate(() => history.state);
t('לכל רשומת היסטוריה יש חותמת עומק ומקור',
  stampOnForm && typeof stampOnForm.d === 'number' && stampOnForm.from === '#/entity/car',
  JSON.stringify(stampOnForm));

await p2.selectOption('#d-type', { label: 'טסט' });
await p2.waitForSelector('#f-plate');
await p2.fill('#f-plate', '7778889');
await p2.fill('#d-expiry', '2029-05-05');
await p2.click('#doc-save');
await p2.waitForSelector('.doc-head');

const savedHash = await p2.evaluate(() => location.hash);
t('השמירה מגיעה למסמך שנשמר', /^#\/doc\//.test(savedHash), savedHash);
t('והטופס ירד מההיסטוריה במקום להישאר בה',
  (await p2.evaluate(() => history.state.from)) === '#/entity/car',
  await p2.evaluate(() => JSON.stringify(history.state)));

t('לחיצה אחת על חזור מחזירה לרשימת מסמכי הישות, ולא לטופס',
  (await backBtn(p2)) === '#/entity/car');

/* עריכה: אותו כלל, אבל היעד כבר יושב מאחורינו — ולכן חוזרים אליו
   במקום לדחוף עותק שני שלו שייראה כאילו "חזור" לא עשה כלום. */
const editId = await p2.evaluate(() =>
  window.Screens.state.docs.filter(d => d.fields.some(f => f.value === '7778889'))[0].id);
await p2.evaluate(id => { location.hash = '#/doc/' + id; }, editId);
await p2.waitForSelector('.doc-head');
await p2.evaluate(id => { location.hash = '#/doc/' + id + '/edit'; }, editId);
await p2.waitForSelector('#f-plate');
await p2.fill('#f-plate', '7778880');
await p2.click('#doc-save');
await p2.waitForSelector('.doc-head');
t('שמירת עריכה נוחתת על המסמך',
  (await p2.evaluate(() => location.hash)) === '#/doc/' + editId,
  await p2.evaluate(() => location.hash));
t('וחזור ממנו יוצא מהמסמך ולא נתקע על עותק כפול שלו',
  (await backBtn(p2)) === '#/entity/car');

/* קישור שנפתח ישירות: אין מאחוריו שום רשומה שלנו, ולכן "חזור" חייב
   ליפול להורה הלוגי במקום להוציא מהאפליקציה. */
const fresh = await ctx2.newPage();
await fresh.goto(BASE + '#/doc/' + editId);
await fresh.waitForSelector('.doc-head');
t('בקישור שנפתח ישירות אין עומק היסטוריה',
  (await fresh.evaluate(() => history.state.d)) === 0,
  await fresh.evaluate(() => JSON.stringify(history.state)));
t('וחזור לוקח להורה הלוגי במקום לצאת מהאפליקציה',
  (await backBtn(fresh)) === '#/entity/car');
await fresh.close();

/* מסמך מחוק אינו יעד לחזרה */
await p2.evaluate(id => { location.hash = '#/doc/' + id; }, editId);
await p2.waitForSelector('.doc-head');
await p2.click('.scr-body .btn.danger');
await p2.waitForSelector('.sheet .btn.danger, .confirm .btn.danger, .backdrop');
await p2.locator('.btn.danger', { hasText: 'מחיקה' }).last().click();
await p2.waitForTimeout(400);
t('מחיקת מסמך נוחתת על הישות',
  (await p2.evaluate(() => location.hash)) === '#/entity/car',
  await p2.evaluate(() => location.hash));
t('ולא משאירה את המסמך המחוק מאחור',
  (await p2.evaluate(() => history.state.from)) !== '#/doc/' + editId,
  await p2.evaluate(() => JSON.stringify(history.state)));

/* ---------- המשוב בגרירה ----------
   הדיווח: "הגרירה עובדת אבל לא חלק. הפידבק לא מספיק טוב."
   שלושה חוסרים, וכולם במשוב: אין סימן שהלחיצה הארוכה מתקדמת, הכרטיס
   אינו הולך אחרי האצבע אלא קופץ משבצת לשבצת, והשכנים נעים בבת אחת. */
console.log('\n— המשוב בגרירה —');
await page.goto(BASE + '#/entities');
await page.waitForSelector('.egroup');

/* DEC-39: הרצועה אופקית, ולכן המחווה נבדקת בציר X. ב-RTL "קדימה" הוא
   ימינה, ולכן גרירה שמאלה מזיזה את הכרטיס אחורה בסדר. */
const feel = await page.evaluate(async () => {
  const box = document.querySelector('.egroup.rail');
  const cards = [...box.querySelectorAll('.ecard')];
  if (cards.length < 2) return { skip: true };
  const first = cards[0];
  const r0 = first.getBoundingClientRect(), r1 = cards[1].getBoundingClientRect();
  const y = r0.top + r0.height / 2;
  const ev = (type, x) => new PointerEvent(type, {
    pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true, clientX: x, clientY: y
  });
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const startX = r0.left + r0.width / 2;

  /* 1 — ההמתנה נראית */
  first.dispatchEvent(ev('pointerdown', startX));
  await sleep(80);
  const pressing = first.classList.contains('pressing');
  const pressScale = getComputedStyle(first).transform;

  /* 2 — הכרטיס נישא, ואז הולך אחרי האצבע */
  await sleep(400);
  const lifted = first.classList.contains('dragging');
  const atRest = first.style.transform;
  const step = (r0.left - r1.left) || (r0.width + 10);
  box.dispatchEvent(ev('pointermove', startX - step * 1.25));
  const following = first.style.transform;

  /* 3 — FLIP: השכן שנדחק ננעל למקומו הישן ומשם מונפש */
  const sibs = [...box.querySelectorAll('.ecard')].filter(c => c !== first);
  const sibFlip = sibs.map(c => c.style.transform).filter(Boolean)[0] || '';
  const sibLocked = sibs.map(c => getComputedStyle(c).transitionDuration);
  await sleep(50);
  const sibMoving = sibs.map(c => getComputedStyle(c).transform).filter(v => v !== 'none')[0] || '';
  const swapped = [...box.querySelectorAll('.ecard')][0] !== first;

  /* 4 — נחיתה, וניקוי מלא */
  box.dispatchEvent(ev('pointerup', startX - step * 1.25));
  const landing = first.classList.contains('landing');
  await sleep(500);
  const clean = !first.classList.contains('dragging') &&
                !first.classList.contains('landing') &&
                !first.style.transform && !first.style.transition;
  return { pressing, pressScale, lifted, atRest, following, sibFlip, sibLocked,
           sibMoving, swapped, landing, clean };
});

t('הלחיצה הארוכה מסומנת על הכרטיס מהרגע הראשון', feel.pressing === true);
t('והיא מתקדמת ולא קופצת — הכרטיס כבר מכווץ באמצע ההמתנה',
  /matrix\(0\.9/.test(feel.pressScale), feel.pressScale);
t('הכרטיס הנישא מתחיל בלי הזזה', /translate\(0px, ?0px\)/.test(feel.atRest), feel.atRest);
t('ומאותו רגע הוא הולך אחרי האצבע בציר הרצועה',
  /translate\(-\d/.test(feel.following), feel.following);
t('וגרירה ברוחב אריח מחליפה מקום', feel.swapped === true);
t('השכן שנדחק ננעל ויזואלית למקומו הישן',
  /translate\(-?\d/.test(feel.sibFlip), feel.sibFlip);
t('ובלי מעבר, אחרת הנעילה עצמה הייתה מונפשת',
  feel.sibLocked.indexOf('0s') !== -1, feel.sibLocked.join(','));
t('ומשם הוא מחליק אל מקומו החדש', feel.sibMoving !== '', feel.sibMoving);
t('ההרפיה מנחיתה את הכרטיס במקום לתלוש אותו', feel.landing === true);
t('ואחרי הנחיתה לא נשאר עליו שום סגנון inline', feel.clean === true);

const sibTrans = await page.evaluate(() => fetch('/style.css').then(r => r.text()));
t('לשכנים יש משך מעבר מוגדר, ולא ברירת מחדל של הדפדפן',
  /\.egroup\.reordering \.card,[\s\S]{0,60}transition: transform/.test(sibTrans));
t('והכיווץ של :active מנוטרל באמצע גרירה',
  /\.egroup\.reordering \.card:active[\s\S]{0,80}transform: none/.test(sibTrans));

/* כרטיס שהורם והונח במקומו לא שינה כלום, ו"הסדר נשמר" עליו הוא הודעה
   על משהו שלא קרה. */
const quietDrop = await page.evaluate(async () => {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const box = document.querySelector('.egroup[data-type="person"]');
  const first = box.querySelector('.ecard');
  const rect = first.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const ev = (type, y) => new PointerEvent(type, {
    pointerId: 2, pointerType: 'touch', bubbles: true, cancelable: true, clientX: x, clientY: y
  });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  first.dispatchEvent(ev('pointerdown', rect.top + 20));
  await sleep(420);
  box.dispatchEvent(ev('pointerup', rect.top + 20));
  await sleep(450);
  return document.querySelectorAll('.toast').length;
});
t('הנחה במקום אינה מכריזה שהסדר נשמר', quietDrop === 0, String(quietDrop));

/* ---------- מסך הבית נגזר מהתמונה ----------
   DEC-39. העיגול נושא `avatarImage`, ולכן הוא זה שקובע את הפריסה: פנים
   בעיגול של 64, רכב ובית בפס רחב. */
console.log('\n— מסך הבית נגזר מהתמונה —');

const homeScreen = await page.evaluate(async () => {
  const DB = window.DB;
  const ymd = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  /* פיקסל אמיתי — כדי שהעיגול ייבדק עם תמונה ולא עם אות */
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC' +
              'AAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  await DB.saveEntity({ id: 'h-p', type: 'person', name: 'רותם', color: '#4B6B7A',
    avatar: 'ר', avatarImage: png, avatarFocus: { x: 50, y: 20 }, sortOrder: 1 });
  await DB.saveEntity({ id: 'h-q', type: 'person', name: 'יעל', color: '#7A5B7E',
    avatar: 'י', sortOrder: 2 });
  await DB.saveEntity({ id: 'h-v', type: 'vehicle', name: 'סובארו', color: '#8B6F47',
    avatar: 'ס', sortOrder: 1 });

  const mk = (id, e, title, exp) => DB.saveDoc({
    id, entityId: e, typeKey: 'generic', title,
    fields: [{ key: 'title', label: 'כותרת', value: title, kind: 'text', sensitive: false, verified: true }],
    issueDate: null, expiryDate: exp, files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0
  }, []);
  await mk('h-d1', 'h-p', 'ויזה', ymd(12));
  await mk('h-d2', 'h-p', 'חוזה', ymd(400));
  await mk('h-d3', 'h-q', 'אישור', ymd(500));
  await mk('h-d4', 'h-v', 'רישוי', ymd(600));

  location.hash = '#/entities';
  await window.App.render();

  /* המסגרת מצוירת כשהתמונה נטענת, ולכן מדידה מיד אחרי render הייתה
     תופסת את הפריים שלפניה. */
  await new Promise(res => {
    const img = document.querySelector('.ecard .av img');
    if (!img || (img.complete && img.naturalWidth)) return res();
    img.addEventListener('load', res, { once: true });
    setTimeout(res, 1000);
  });
  await new Promise(res => requestAnimationFrame(res));

  const q = sel => document.querySelector(sel);
  const tile = id => q('.egroup .ecard[data-id="' + id + '"]');

  const urgent = tile('h-p'), calm = tile('h-q'), asset = tile('h-v');
  const img = urgent.querySelector('.av img');

  return {
    railLayout: urgent.closest('.egroup').dataset.layout,
    boardLayout: asset.closest('.egroup').dataset.layout,
    hasImg: !!img,
    /* התמונה כאן היא פיקסל בודד — ריבוע בעיגול, בלי סרך בשום ציר,
       ולכן אין גאומטריה למדוד. מה שנבדק הוא שהמסגרת הגיעה לתמונה. */
    focus: img ? img.style.objectPosition : '',
    avSize: Math.round(urgent.querySelector('.av').getBoundingClientRect().width),
    ring: urgent.querySelector('.av').className,
    chip: (urgent.querySelector('.card-s .chip') || {}).textContent || '',
    calmRing: calm.querySelector('.av').className,
    calmChip: !!calm.querySelector('.card-s .chip'),
    calmText: calm.querySelector('.card-s').textContent,
    band: !!asset.querySelector('.atile-img'),
    bandBlank: !!asset.querySelector('.atile-img .av-blank'),
    kind: (asset.querySelector('.atile-k') || {}).textContent || '',
    assetChip: !!asset.querySelector('.atile-c'),
    mark: !!q('.mast-tile'),
    field: !!q('.home-field'),
    navPill: !!q('.nav-i.on i')
  };
});

t('אנשים יושבים ברצועה', homeScreen.railLayout === 'rail', homeScreen.railLayout);
t('ורכב ובית בלוח', homeScreen.boardLayout === 'board', homeScreen.boardLayout);
t('התמונה של הישות ממלאת את העיגול', homeScreen.hasImg === true);
t('והמסגרת שנבחרה נשמרת', homeScreen.focus === '50% 20%', homeScreen.focus);
t('העיגול הוא 64 ולא 40', homeScreen.avSize === 64, String(homeScreen.avSize));
t('ישות שדורשת מבט נושאת טבעת בצבע הדלי',
  /ring-d30/.test(homeScreen.ring), homeScreen.ring);
t('והצ׳יפ אומר כמה נשאר', /\d+ ימים|מחר/.test(homeScreen.chip), homeScreen.chip);
t('ישות רגועה נשארת בלי טבעת — DEC-05', !/ring-/.test(homeScreen.calmRing), homeScreen.calmRing);
t('ובלי צ׳יפ', homeScreen.calmChip === false);
t('היא פשוט אומרת שהכל בתוקף', homeScreen.calmText === 'הכל בתוקף', homeScreen.calmText);
t('לאריח הנכס יש פס תמונה', homeScreen.band === true);
t('ובלי תמונה יורד עליו אייקון הסוג', homeScreen.bandBlank === true);
t('והתווית על הפס היא שם הסוג', homeScreen.kind === 'רכב', homeScreen.kind);
t('נכס רגוע אינו מקבל צ׳יפ על התמונה', homeScreen.assetChip === false);
t('הסימן יושב בראש המסך', homeScreen.mark === true);
t('ומאחוריו שדה אחד', homeScreen.field === true);
t('ולטאב הפעיל יש כרית', homeScreen.navPill === true);

/* התפוגה הקרובה, ותווית שנכנסת לאריח בן 106 פיקסלים */
const nextApi = await page.evaluate(() => {
  const E = window.Expiry;
  const docs = [
    { id: 'x1', expiryDate: '2030-01-01' },
    { id: 'x2', expiryDate: '2027-01-01' },
    { id: 'x3', expiryDate: null }
  ];
  const t0 = new Date(2026, 0, 1);
  return {
    pick: E.next(docs, t0).doc.id,
    none: E.next([{ id: 'y', expiryDate: null }], t0),
    empty: E.next([], t0),
    short: [E.shortLabel(-4), E.shortLabel(0), E.shortLabel(1), E.shortLabel(12), E.shortLabel(null)]
  };
});
t('E.next בוחרת את הקרובה ביותר', nextApi.pick === 'x2', nextApi.pick);
t('מסמך בלי תאריך אינו משתתף', nextApi.none === null);
t('ורשימה ריקה מחזירה null', nextApi.empty === null);
t('התווית הקצרה נכנסת לאריח',
  nextApi.short.join('|') === 'פג|פג|מחר|12 ימים|', nextApi.short.join('|'));

/* גרירה בלוח — שני צירים, ולא רק מעלה ומטה */
const board = await page.evaluate(async () => {
  const DB = window.DB;
  await DB.saveEntity({ id: 'h-h', type: 'home', name: 'הדירה', color: '#5B6480',
    avatar: 'ה', sortOrder: 2 });
  location.hash = '#/entities';
  await window.App.render();

  const box = document.querySelector('.egroup.board');
  const cards = [...box.querySelectorAll('.ecard')];
  if (cards.length < 2) return { skip: true };

  const r0 = cards[0].getBoundingClientRect(), r1 = cards[1].getBoundingClientRect();
  const ev = (type, x, y) => new PointerEvent(type, {
    pointerId: 3, pointerType: 'touch', bubbles: true, cancelable: true, clientX: x, clientY: y
  });
  const sleep = ms => new Promise(res => setTimeout(res, ms));

  const before = [...box.querySelectorAll('.card-t')].map(x => x.textContent);
  /* הראשון ב-RTL הוא הימני. גוררים אותו שמאלה, אל מעבר למרכז השני. */
  const sx = r0.left + r0.width / 2, sy = r0.top + r0.height / 2;
  cards[0].dispatchEvent(ev('pointerdown', sx, sy));
  await sleep(420);
  box.dispatchEvent(ev('pointermove', r1.left + r1.width / 2 - 12, sy));
  await sleep(60);
  const mid = [...box.querySelectorAll('.card-t')].map(x => x.textContent);
  box.dispatchEvent(ev('pointerup', r1.left + r1.width / 2 - 12, sy));
  await sleep(500);
  const rows = await DB.listEntities();
  return {
    before, mid,
    saved: rows.filter(r => r.type !== 'person').sort((a, b) => a.sortOrder - b.sortOrder)
      .map(r => r.name)
  };
});
t('גרירה אופקית בלוח מחליפה מקום',
  board.mid[0] !== board.before[0], board.before.join(',') + ' → ' + board.mid.join(','));
t('והסדר החדש נשמר', board.saved.join(',') === board.mid.join(','),
  board.saved.join(',') + ' vs ' + board.mid.join(','));

/* ---------- השיוך של מסמך חדש ----------
   הדיווח: "אני מעלה מסמך מתוך הישות, והוא נשמר על הישות הראשונה ברשימה".
   מסך ישות שיש בו מסמכים אינו מציג כפתור הוספה משלו — המשתמש מוסיף
   דרך ה-FAB הגלובלי, וזה לא ידע מאיזה מסך נלחץ. אותו חור קיים בגרירה
   ובהדבקה, שאינן עוברות דרך גיליון ההוספה בכלל. */
console.log('\n— השיוך נגזר מהמסך שממנו הוסיפו —');
const ctx3 = await browser.newContext({ viewport: { width: 420, height: 920 }, locale: 'he-IL' });
const p3 = await ctx3.newPage();
const errs3 = []; p3.on('pageerror', e => errs3.push(e.message));
p3.on('console', m => { if (m.type() === 'error') errs3.push(m.text()); });
await p3.goto(BASE);
await p3.waitForSelector('.scr-title');
await p3.evaluate(async () => {
  await window.DB.saveEntity({ id: 'a-person', type: 'person', name: 'ראשון',
    color: '#4B6B7A', avatar: 'ר', sortOrder: 1 });
  await window.DB.saveEntity({ id: 'b-car', type: 'vehicle', name: 'מאזדה',
    color: '#8B6F47', avatar: 'מ', sortOrder: 2 });
  await window.App.render();
});

const firstEntity = await p3.evaluate(() => window.Screens.state.entities[0].id);
t('הישות הראשונה ברשימה אינה הישות שנבדקת', firstEntity === 'a-person', firstEntity);

async function fabForm(hash) {
  await p3.goto(BASE + hash);
  await p3.waitForSelector('.fab');
  await p3.click('.fab');
  await p3.waitForSelector('.routes');
  await p3.click('.routes .route:has-text("הזנה ידנית")');
  await p3.waitForSelector('#d-entity');
  return p3.inputValue('#d-entity');
}

t('ה-FAB במסך ישות פותח טופס משויך לאותה ישות',
  (await fabForm('#/entity/b-car')) === 'b-car');

await p3.selectOption('#d-type', { label: 'טסט' });
await p3.waitForSelector('#f-plate');
await p3.fill('#f-plate', '8452103');
await p3.fill('#d-expiry', '2030-03-01');
await p3.click('#doc-save');
await p3.waitForSelector('.doc-head');
t('והמסמך נשמר על הישות הזאת ולא על הראשונה',
  (await p3.evaluate(() => window.Screens.state.docs.slice(-1)[0].entityId)) === 'b-car',
  await p3.evaluate(() => window.Screens.state.docs.slice(-1)[0].entityId));

/* המסך שבו הבאג התגלה: ישות שכבר יש בה מסמך, ולכן אין בה מצב ריק
   ואין בה כפתור הוספה משלה. */
t('גם כשלישות כבר יש מסמכים, ואין בה מצב ריק',
  (await fabForm('#/entity/b-car')) === 'b-car');

t('ובמסך הבית אין הקשר, ולכן נשארת ברירת המחדל',
  (await fabForm('#/entities')) === 'a-person');

/* גרירה והדבקה אינן עוברות דרך גיליון ההוספה, ולכן הן היו מאבדות את
   הישות גם אילו ה-FAB היה מתוקן לבדו. */
await p3.goto(BASE + '#/entity/b-car');
await p3.waitForSelector('.scr');
await p3.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([1, 2, 3])], 'd.pdf', { type: 'application/pdf' }));
  document.body.dispatchEvent(new DragEvent('drop', {
    dataTransfer: dt, bubbles: true, cancelable: true
  }));
});
await p3.waitForSelector('#d-entity');
t('קובץ שנגרר למסך ישות מגיע לטופס משויך אליה',
  (await p3.inputValue('#d-entity')) === 'b-car');

/* טופס פתוח הוא היוצא מן הכלל: החלפת הקובץ בתוכו אינה מאפסת שיוך
   שכבר נבחר בו, מפני שהמסלול `#/doc/new` אינו מסך ישות. */
await p3.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([4, 5, 6])], 'e.pdf', { type: 'application/pdf' }));
  document.body.dispatchEvent(new DragEvent('drop', {
    dataTransfer: dt, bubbles: true, cancelable: true
  }));
});
await p3.waitForTimeout(400);
t('והחלפת הקובץ בטופס פתוח אינה מאפסת את השיוך שנבחר בו',
  (await p3.inputValue('#d-entity')) === 'b-car');

t('אפס שגיאות קונסול במסלול הזה', errs3.length === 0, errs3.join(' | '));

/* מכאן והלאה ה-500 מכוון, ולכן מונה שגיאות הקונסול נסגר מעליו. */
/* הדיווח החוזר: "גם כשהפרסינג נכשל, הברירה צריכה להישאר הישות שממנה
   לחצתי". המסלול הזה — בורר קבצים אמיתי ופרסינג שנכשל — לא היה מכוסה:
   הבדיקות שלמעלה עוברות בהזנה ידנית ובגרירה, ושתיהן לא נוגעות בצינור. */
await p3.route('**://generativelanguage.googleapis.com/**', r =>
  r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"message":"boom"}}' }));
await p3.evaluate(async () => {
  await window.Settings.set(window.CONFIG.K.geminiKey, 'FAKE');
  await window.Settings.set(window.CONFIG.K.geminiConsentImage, true);
});

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

async function viaPicker(routeLabel) {
  await p3.goto(BASE + '#/entity/b-car');
  await p3.waitForSelector('.fab');
  await p3.click('.fab');
  await p3.waitForSelector('.routes');
  const [chooser] = await Promise.all([
    p3.waitForEvent('filechooser'),
    p3.click('.routes .route:has-text("' + routeLabel + '")')
  ]);
  await chooser.setFiles({ name: 'policy.pdf', mimeType: 'application/pdf', buffer: PDF });
  await p3.waitForSelector('#d-entity', { timeout: 15000 });
  return p3.inputValue('#d-entity');
}

t('בורר קבצים מתוך ישות, כשהפרסינג נכשל, נשאר על אותה ישות',
  (await viaPicker('בחירת קובץ')) === 'b-car');
t('וגם מסלול הצילום', (await viaPicker('צילום')) === 'b-car');

await ctx3.close();

await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
