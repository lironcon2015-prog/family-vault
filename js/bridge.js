/* bridge.js — תחבורת גיבוי דרך Apps Script. SPEC §12.7.

   החלופה ל-OAuth, והיא קיימת בגלל דבר אחד: **אין התחברות.** הגשר רץ בחשבון
   הגוגל של המשתמש, ולכן הדפדפן אינו צריך טוקן — לא בפעם הראשונה ולא אחריה.
   מדביקים כתובת וסוד פעם אחת, ומאז הסנכרון פשוט עובד. הדפוס מנאביגו (Q7).

   מממש בדיוק את חוזה `Sync.transport`, ולכן ההחלפה בין השניים היא שורה
   אחת ב-`app.js` ולא שינוי בצינור:
     connected · getDb · putDb · uploadBlob · downloadBlob

   **בלי כותרות ב-fetch.** גוף מחרוזת בלי `Content-Type` מפורש נשלח כ-
   `text/plain`, שהוא ערך מותר ב-CORS ולכן הבקשה "פשוטה" ואין preflight.
   הוספת `Content-Type: application/json` תפעיל OPTIONS, ו-Apps Script
   אינו עונה עליו — הבקשה תיכשל בלי הודעה מובנת. זו אזהרה מפורשת מנאביגו,
   והיא הדבר היחיד בקובץ שנראה שרירותי ואינו. */
(function () {
  'use strict';

  var C = window.CONFIG, S = window.Settings;

  var B = {};

  function url() { return String(S.get(C.K.bridgeUrl) || '').trim(); }
  function secret() { return String(S.get(C.K.bridgeToken) || '').trim(); }

  /* אין סשן שפג, ולכן "מחובר" פירושו "מוגדר". זה כל ההבדל מול OAuth. */
  B.connected = function () { return !!url() && !!secret(); };

  B.call = function (action, params) {
    if (!B.connected()) {
      return Promise.reject(new Error('הגשר לא הוגדר — הדבק כתובת וסוד בהגדרות'));
    }
    /* נעצר כאן ולא אחרי סיבוב לגשר: התשובה תהיה אותה תשובה, והמשתמש
       שהגדיר סוד קצר צריך לדעת שהמספר הוא הבעיה ולא הכתובת. */
    if (secret().length < C.BRIDGE_MIN_SECRET) {
      return Promise.reject(new Error(
        'הסוד קצר מדי — ' + secret().length + ' תווים, נדרשים ' +
        C.BRIDGE_MIN_SECRET + ' לפחות. שנה אותו גם בגשר וגם כאן.'));
    }
    var body = { token: secret(), action: action };
    Object.keys(params || {}).forEach(function (k) { body[k] = params[k]; });

    /* `linkManifest` איטי בגלל הצד של גוגל ולא בגלל הרשת: הגשר קורא ומפרסר
       את כל הגיבוי של התקציב. 30 שניות לא הספיקו בסלולר. */
    var slow = action === 'upload' || action === 'download' ||
               action === 'linkDownload' || action === 'linkManifest';
    return window.U.fetchT(url(), { method: 'POST', body: JSON.stringify(body) },
      slow ? C.NET_BLOB_TIMEOUT_MS : C.NET_TIMEOUT_MS,
      'הגשר לא ענה בזמן — בדוק את הכתובת ואת הרשת')
      .then(function (r) {
        /* 404 אינו תשובה של הגשר — הגשר עונה 200 גם על סוד שגוי. זו גוגל
           שלא מצאה פריסה פעילה בכתובת: רגעית בזמן פריסה, או קבועה אם
           הכתובת שייכת לפריסה שהועברה לארכיון. */
        if (r.status === 404) {
          throw new Error('גוגל לא מצאה את הגשר בכתובת הזו (404). אם פרסת עכשיו גרסה חדשה — ' +
            'נסה שוב בעוד רגע. אחרת ודא שהכתובת בהגדרות היא של הפריסה הפעילה.');
        }
        if (!r.ok) throw new Error('הגשר החזיר שגיאה (' + r.status + ')');
        return r.text();
      }, function (e) {
        /* תקרת הזמן כבר ניסחה הודעה משלה, ואסור להחליף אותה ב"אין חיבור" —
           גשר שעונה לאט אינו גשר שאינו קיים. */
        if (e && /לא ענה בזמן/.test(e.message || '')) throw e;
        throw new Error('אין חיבור לגשר — בדוק את הכתובת ואת הרשת');
      })
      .then(function (text) {
        var j;
        try { j = JSON.parse(text); } catch (e) { j = null; }
        /* תשובה שאינה JSON היא כמעט תמיד דף HTML של גוגל — כלומר כתובת
           שאינה ה-Web app, או פריסה שלא אושרה. ההודעה אומרת את זה. */
        if (!j) throw new Error('תשובה לא תקינה — ודא שהכתובת מסתיימת ב-‎/exec ושהפריסה אושרה');
        if (!j.ok) throw new Error(j.error || 'שגיאת גשר');
        return j.result;
      });
  };

  /* בדיקת חיבור. מחזירה את שם התיקייה, כדי שההודעה תגיד מה נמצא ולא
     רק "הצליח" — משתמש שהדביק כתובת של פריסה אחרת רוצה לדעת. */
  B.connect = function () {
    return B.call('ping', {}).then(function (r) { return (r && r.name) || 'DocVault'; });
  };

  B.disconnect = function () {
    return S.set(C.K.bridgeToken, '').then(function () {
      return S.set(C.K.bridgeUrl, '');
    });
  };

  /* ---------- db.json ---------- */

  B.getDb = function () {
    return B.call('getDb', {}).then(function (r) { return (r && r.db) || null; });
  };

  B.putDb = function (db) {
    return B.call('putDb', { db: db }).then(function (r) { return r && r.id; });
  };

  /* ---------- blobs ---------- */

  function toB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(new Error('קריאת הקובץ נכשלה')); };
      r.readAsDataURL(blob);
    });
  }

  function fromB64(data, mime) {
    var bin = atob(String(data || ''));
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'application/octet-stream' });
  }

  B.uploadBlob = function (docId, name, mime, blob) {
    /* base64 מנפח בשליש, ולתשובת Apps Script יש תקרה. קובץ שחורג ייכשל
       בצד גוגל בהודעה שאינה אומרת דבר — לכן הוא נעצר כאן, עם המספר. */
    if (blob.size > C.BRIDGE_MAX_BYTES) {
      return Promise.reject(new Error(
        'הקובץ גדול מדי לגשר (' + window.U.bytes(blob.size) + '). ' +
        'התקרה היא ' + window.U.bytes(C.BRIDGE_MAX_BYTES) + '.'));
    }
    return toB64(blob).then(function (data) {
      return B.call('upload', {
        docId: docId, name: name,
        mime: mime || 'application/octet-stream', data: data
      });
    }).then(function (r) { return r && r.fileId; });
  };

  B.downloadBlob = function (fileId) {
    return B.call('download', { fileId: fileId }).then(function (r) {
      return fromB64(r && r.data, r && r.mime);
    });
  };

  /* ---------- מסמכים מקושרים — DEC-47 ----------
     קריאה בלבד. הדפדפן שולח מפתח מקור, ושמות הקבצים בדרייב יושבים בגשר.
     רק התחבורה הזו מממשת את שתי הפעולות: `drive.file` של OAuth רואה רק
     קבצים שהכספת עצמה יצרה, ולכן הוא אינו יכול לקרוא את קבצי התקציב. */

  /* גשר שנפרס לפני DEC-47 עונה "פעולה לא מוכרת". זה לא באג אצל המשתמש —
     זו פריסה ישנה, וההודעה אומרת מה לעשות. */
  function linkCall(action, params) {
    return B.call(action, params).catch(function (e) {
      if (/פעולה לא מוכרת/.test((e && e.message) || '')) {
        throw new Error('הגשר צריך עדכון — הדבק את bridge.gs החדש ופרוס גרסה חדשה');
      }
      throw e;
    });
  }

  B.canLink = true;

  B.linkManifest = function (source, since) {
    return linkCall('linkManifest', { source: source, since: since || 0 });
  };

  B.linkDownload = function (source, fileId) {
    return linkCall('linkDownload', { source: source, fileId: fileId }).then(function (r) {
      return fromB64(r && r.data, r && r.mime);
    });
  };

  /* תמונות ממוזערות של קבצי המקור — DEC-50. מחזיר מפה מזהה → Blob או
     null (אין תמונה, או שהקובץ אינו של המקור). */
  B.linkThumbs = function (source, fileIds) {
    return linkCall('linkThumbs', { source: source, fileIds: fileIds }).then(function (r) {
      var out = {};
      var map = (r && r.thumbs) || {};
      Object.keys(map).forEach(function (id) {
        out[id] = map[id] ? fromB64(map[id].data, map[id].mime) : null;
      });
      return out;
    });
  };

  window.Bridge = B;
})();
