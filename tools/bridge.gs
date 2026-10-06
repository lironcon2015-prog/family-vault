/**
 * bridge.gs — גשר Apps Script ל"התיק המשפחתי".
 *
 * למה הוא קיים: OAuth בדפדפן מחייב טוקן שפג, ולכן התחברות חוזרת. הגשר רץ
 * **בחשבון הגוגל שלך** ואינו צריך טוקן מהדפדפן כלל — מדביקים כתובת וסוד
 * פעם אחת, ומאז אין פופאפ ואין התחברות. הדפוס הגיע מנאביגו (Q7).
 *
 * מה שונה כאן מנאביגו, ובכוונה:
 *
 *   1. **הגשר נוגע בתיקייה אחת בלבד.** אצל נאביגו `download` מקבל מזהה
 *      קובץ ומחזיר אותו — כלומר מי שמחזיק את הכתובת והסוד יכול לקרוא
 *      **כל** קובץ בדרייב. כאן כל קריאה מאמתת שהקובץ יושב בתוך `DocVault`,
 *      ומחוצה לה הגשר מסרב. זה מצמצם את הנזק מדליפת הסוד מ"כל הדרייב"
 *      ל"התיקייה של האפליקציה".
 *   2. **אין יצירת קבצים מחוץ לתיקייה**, ואין מחיקה בכלל.
 *   3. **מסמכים מקושרים (DEC-47) — קריאה בלבד, ממקור שמוגדר כאן.** הכספת
 *      יכולה להציג מסמכים שאפליקציה אחרת כבר העלתה (התקציב), בלי להעלות
 *      אותם שוב. שמות הקבצים בדרייב יושבים ב-`SOURCES` למטה ולא מגיעים
 *      מהדפדפן: הדפדפן שולח מפתח מקור בלבד. מקובץ הגיבוי של המקור יוצאת
 *      **רק** רשימת המסמכים — לא עסקאות, לא חשבונות ולא שום מפתח אחר —
 *      והורדה מאומתת מול תיקיית המסמכים של המקור.
 *
 * ⚠️ הכתובת והסוד הם **צמד גישה**. מי שמחזיק את שניהם יכול לקרוא ולכתוב
 *    בתיקיית DocVault שלך. אל תשלח אותם בערוץ פתוח, ואם דלפו — שנה את
 *    SECRET ב-Script properties (זה מבטל את הישן מיידית, בלי פריסה).
 *
 * **הסוד אינו כתוב בקובץ הזה** (DEC-48). הוא יושב ב-Script properties של
 * הפרויקט, ולכן עדכון הקוד הוא הדבקה ופריסה — בלי להעתיק את הסוד הצידה
 * ולהחזיר אותו, ובלי סוד שנשכח בתוך עותק של הקובץ. כך זה עובד גם בגשר של
 * גבעתיים.
 *
 * ---------- התקנה, פעם אחת ----------
 *
 *   1. script.google.com → New project → הדבק את הקובץ הזה במקום התוכן.
 *   2. Project Settings (גלגל שיניים) → Script properties → Add property:
 *        Property: SECRET
 *        Value:    מחרוזת אקראית משלך — 16 תווים לפחות, ורצוי 32.
 *      הכתובת חשופה ("Anyone"), ולכן הסוד הוא כל ההגנה. סוד קצר נשבר
 *      בניחוש, ולכן הגשר מסרב לרוץ איתו.
 *   3. Deploy → New deployment → סוג: Web app.
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      ("Anyone" נדרש כדי שהדפדפן יוכל לפנות בלי התחברות — הסוד הוא מה
 *       שמגן, ולכן הוא חייב להיות אקראי ולא לנחש.)
 *   4. אשר את ההרשאות במסך שגוגל מציג.
 *   5. העתק את כתובת ה-Web app (מסתיימת ב-/exec) ואת הסוד להגדרות
 *      האפליקציה, תחת "גיבוי לדרייב".
 *
 * אחרי כל שינוי בקובץ: Deploy → Manage deployments → עריכה → New version.
 * (לא New deployment — זו כתובת חדשה, והכתובת השמורה באפליקציה תפסיק לעבוד.)
 * שינוי של הסוד עצמו אינו שינוי בקובץ: משנים את SECRET ב-Script properties,
 * וזה תופס מיד, בלי פריסה.
 *
 * ---------- מעבר מגשר שהסוד שלו כתוב בקובץ ----------
 *
 * גרסאות קודמות החזיקו `var SECRET = '...'` בראש הקובץ. לפני שמדביקים את
 * הגרסה הזאת: העתק את הערך משם ל-Script properties → SECRET. אחר כך הדבק,
 * ופרוס New version. האפליקציה לא צריכה שום שינוי — הסוד נשאר אותו סוד.
 *
 * ---------- אם הפריסה נכשלת ----------
 *
 * דף "מצטערים, לא ניתן לפתוח את הקובץ כרגע" עם `authuser=<מספר>` בכתובת
 * פירושו **כמה חשבונות גוגל מחוברים באותו דפדפן**. Apps Script פונה לחשבון
 * הלא נכון, וזה אינו קשור לסקריפט ואינו נפתר בפריסה חוזרת. הפתרון: חלון
 * פרטי עם חשבון אחד בלבד, או החלפת `authuser=3` ב-`authuser=0` בכתובת.
 *
 * בחשבון Workspace ייתכן שמדיניות המנהל חוסמת "Who has access: Anyone" —
 * אז יש להקים את הגשר בחשבון פרטי. והכתובת חייבת להסתיים ב-/exec; כתובת
 * /dev היא הפריסה הזמנית, והיא דורשת התחברות.
 */

var ROOT_NAME = 'DocVault';
var FILES_NAME = 'files';
var DB_NAME = 'docvault-db.json';
var MARKER = 'family-vault-root';
var MIN_SECRET = 16;

/* מקורות של מסמכים מקושרים. מקור נוסף הוא שורה כאן ושורה ב-
   CONFIG.LINK_SOURCES. `backup` הוא קובץ הגיבוי שבו יושבת רשימת המסמכים,
   `folder` היא התיקייה שבה יושבים הקבצים עצמם. */
var SOURCES = {
  homebudget: { backup: 'finance-app-backup.json', folder: 'HomeBudget מסמכים' }
};
var LINK_TEXT_MAX = 1200;
var LINK_THUMBS_MAX = 12;

/* ---------- הכניסה ---------- */

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    /* שתי הודעות ולא אחת: "לא הוגדר" ו"קצר מדי" הן תקלות שונות, והודעה
       אחת לשתיהן שולחת את מי שהגדיר סוד קצר לחפש במקום הלא נכון. */
    var secret = _secret();
    if (!secret) {
      throw new Error('הסוד לא הוגדר בגשר — Project Settings → Script properties → SECRET');
    }
    if (secret.length < MIN_SECRET) {
      throw new Error('הסוד בגשר קצר מדי — ' + secret.length + ' תווים, ' +
                      'נדרשים ' + MIN_SECRET + ' לפחות');
    }
    if (!_same(String(req.token || ''), secret)) throw new Error('סוד שגוי');
    return _json({ ok: true, result: _handle(req) });
  } catch (err) {
    return _json({ ok: false, error: String((err && err.message) || err) });
  }
}

/* הסוד מ-Script properties ולא מהקובץ — DEC-48. רווח נגרר שנדבק עם הערך
   הוא הסיבה הנפוצה ל"סוד שגוי", ולכן הוא נחתך כאן ולא נשאר לניחוש. */
function _secret() {
  return String(PropertiesService.getScriptProperties().getProperty('SECRET') || '').trim();
}

/* השוואה בזמן קבוע, כדי שזמן התגובה לא ילמד כמה תווים מהסוד נוחשו נכון. */
function _same(a, b) {
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function _handle(req) {
  switch (req.action) {
    case 'ping':     return { name: _root().getName() };
    case 'getDb':    return _getDb();
    case 'putDb':    return _putDb(req);
    case 'upload':   return _upload(req);
    case 'download': return _download(req);
    case 'linkManifest': return _linkManifest(req);
    case 'linkDownload': return _linkDownload(req);
    case 'linkThumbs':   return _linkThumbs(req);
    default: throw new Error('פעולה לא מוכרת: ' + req.action);
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- התיקייה ----------
   מסומנת ב-description, ולכן היא נמצאת מחדש גם אם שום מזהה לא נשמר.
   זה הרעיון שנאביגו המליצה עליו: אל תסמוך על id שמור, סמן את התיקייה. */

function _root() {
  var it = DriveApp.getFoldersByName(ROOT_NAME);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed() && f.getDescription() === MARKER) return f;
  }
  var created = DriveApp.createFolder(ROOT_NAME);
  created.setDescription(MARKER);
  return created;
}

function _filesFolder() {
  var root = _root();
  var it = root.getFoldersByName(FILES_NAME);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return root.createFolder(FILES_NAME);
}

/* קובץ נחשב שלנו רק אם הוא יושב בתוך DocVault או בתת-התיקייה שלה.
   בלי הבדיקה הזאת, מזהה קובץ שרירותי היה הופך את הסוד למפתח לכל הדרייב. */
function _inVault(file) {
  var rootId = _root().getId();
  var parents = file.getParents();
  while (parents.hasNext()) {
    var p = parents.next();
    if (p.getId() === rootId) return true;
    var gp = p.getParents();
    while (gp.hasNext()) {
      if (gp.next().getId() === rootId) return true;
    }
  }
  return false;
}

/* ---------- db.json ---------- */

function _dbFile() {
  var it = _root().getFilesByName(DB_NAME);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return null;
}

function _getDb() {
  var f = _dbFile();
  if (!f) return { db: null };
  return { db: JSON.parse(f.getBlob().getDataAsString('UTF-8')) };
}

function _putDb(req) {
  var text = JSON.stringify(req.db || {});
  var f = _dbFile();
  if (f) {
    f.setContent(text);
    return { id: f.getId() };
  }
  var made = _root().createFile(DB_NAME, text, 'application/json');
  return { id: made.getId() };
}

/* ---------- blobs ---------- */

function _upload(req) {
  var name = String(req.docId || 'doc') + '__' + String(req.name || 'file');
  var blob = Utilities.newBlob(
    Utilities.base64Decode(String(req.data || '')),
    String(req.mime || 'application/octet-stream'),
    name);
  var file = _filesFolder().createFile(blob);
  return { fileId: file.getId() };
}

function _download(req) {
  var file = DriveApp.getFileById(String(req.fileId || ''));
  if (!_inVault(file)) throw new Error('הקובץ אינו בתיקיית DocVault');
  var blob = file.getBlob();
  return {
    name: file.getName(),
    mime: blob.getContentType(),
    data: Utilities.base64Encode(blob.getBytes())
  };
}

/* ---------- מסמכים מקושרים — קריאה בלבד ---------- */

function _source(req) {
  var src = SOURCES[String(req.source || '')];
  if (!src) throw new Error('מקור לא מוכר: ' + req.source);
  return src;
}

/* הגיבוי העדכני ביותר. אפליקציה שמגבה לדרייב עלולה להשאיר שני עותקים
   (מכשיר שני שיצר קובץ לפני שמצא את הראשון), והעדכני הוא האמת שלה. */
function _latestByName(name) {
  var it = DriveApp.getFilesByName(name), best = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    if (!best || f.getLastUpdated().getTime() > best.getLastUpdated().getTime()) best = f;
  }
  return best;
}

function _str(v, max) {
  var s = v == null ? '' : String(v);
  return max && s.length > max ? s.slice(0, max) : s;
}

/* ההטלה היא כל ההגנה על שאר הקובץ: מה שאינו נכתב כאן אינו עוזב את גוגל.
   קובץ הגיבוי של התקציב מחזיק את כל העסקאות; לכספת מגיעה רשימת המסמכים. */
function _linkManifest(req) {
  var src = _source(req);
  var f = _latestByName(src.backup);
  if (!f) return { found: false };
  /* הגיבוי של התקציב מחזיק את כל העסקאות, ולקרוא ולפרסר אותו זה החלק
     היקר — מספיק כדי לחרוג מתקרת הזמן ברשת סלולרית. הדפדפן שולח את
     חותמת הזמן של מה שכבר יש לו, ואם הקובץ לא השתנה מאז, לא קוראים כלום. */
  var modified = f.getLastUpdated().getTime();
  if (req.since && Number(req.since) === modified) {
    return { found: true, unchanged: true, modified: modified };
  }
  var data = JSON.parse(f.getBlob().getDataAsString('UTF-8'));

  var payNo = {};
  (data.propertyPayments || []).forEach(function (p) {
    if (p && p.id) payNo[p.id] = p.paymentNumber || null;
  });

  var docs = (data.propertyDocs || []).filter(function (d) { return d && d.id; })
    .map(function (d) {
      return {
        id: _str(d.id), title: _str(d.title || d.name, 200), name: _str(d.name, 200),
        mime: _str(d.mime, 100), size: Number(d.size) || 0,
        cat: _str(d.docType), date: _str(d.docDate, 10),
        amount: Number(d.amount) || 0, summary: _str(d.summary, 400),
        text: _str(d.text, LINK_TEXT_MAX), fileId: _str(d.driveFileId),
        payment: d.linkedPaymentId ? (payNo[d.linkedPaymentId] || null) : null,
        created: _str(d.createdAt, 30)
      };
    });

  var cats = (data.propertyDocCats || []).filter(function (c) { return c && c.id; })
    .map(function (c) { return { id: _str(c.id), label: _str(c.label, 60) }; });

  return {
    found: true,
    title: _str((data.property && data.property.name) || '', 80),
    docs: docs, cats: cats,
    exported: _str(data.exportedAt, 30),
    modified: modified
  };
}

/* קובץ של מקור נקרא רק אם הוא יושב בתיקיית המסמכים של אותו מקור. */
function _inSource(file, src) {
  var parents = file.getParents();
  while (parents.hasNext()) {
    var p = parents.next();
    if (!p.isTrashed() && p.getName() === src.folder) return true;
  }
  return false;
}

function _linkDownload(req) {
  var src = _source(req);
  var file = DriveApp.getFileById(String(req.fileId || ''));
  if (file.isTrashed() || !_inSource(file, src)) {
    throw new Error('הקובץ אינו בתיקיית ' + src.folder);
  }
  var blob = file.getBlob();
  return {
    name: file.getName(),
    mime: blob.getContentType(),
    data: Utilities.base64Encode(blob.getBytes())
  };
}

/* תמונות ממוזערות לרשימה (DEC-50). גוגל כבר מייצרת אחת לכל קובץ בדרייב,
   כך שקבוצה של שנים-עשר מסמכים עולה כמה עשרות קילובייט ולא שנים-עשר
   קבצים מלאים. אותה בדיקת תיקייה כמו בהורדה; קובץ שאין לו תמונה, או
   שאינו של המקור, חוזר ריק — רשימה שלמה לא נופלת בגלל קובץ אחד. */
function _linkThumbs(req) {
  var src = _source(req);
  var ids = (req.fileIds || []).slice(0, LINK_THUMBS_MAX);
  var out = {};
  ids.forEach(function (id) {
    id = String(id || '');
    out[id] = null;
    try {
      var file = DriveApp.getFileById(id);
      if (file.isTrashed() || !_inSource(file, src)) return;
      var t = file.getThumbnail();
      if (!t) return;
      out[id] = { mime: t.getContentType() || 'image/png', data: Utilities.base64Encode(t.getBytes()) };
    } catch (e) {
      out[id] = null;
    }
  });
  return { thumbs: out };
}
