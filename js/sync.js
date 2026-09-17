/* sync.js — מיזוג וסנכרון. ported from Navigo: js/db.js:mergeSync ו-js/google.js:Sync.
   מה שונה בהתאמה:
     1. אין `shared settings` — `settings` אצלנו מקומי לחלוטין ולא מסתנכרן.
     2. `files[]` ממוזג לפי `driveFileId` ולא נדרס. אצל נאביגו ה-blob יושב
        על הרשומה ויש לו חריג בשורה אחת; אצלנו הוא בחנות נפרדת, והדריסה
        הייתה מנתקת מסמך מהקובץ ששוכב אצלו בדיסק.
     3. `DB.forSync` מרוקן שדות של סוג עם `syncFields:false` (DEC-13).
     4. התחבורה מוזרקת (`Sync.transport`), כדי שכל המחזור ייבדק בלי רשת. */
(function () {
  'use strict';

  var C = window.CONFIG, U = window.U, DB = window.DB, S = window.Settings, DT = window.DOC_TYPES;

  var STORES = ['entities', 'docs'];
  var DEBOUNCE_MS = 4000;

  var _syncing = false;
  var _timer = null;

  var Sync = {};

  Sync.STORES = STORES;
  Sync.DEBOUNCE_MS = DEBOUNCE_MS;

  /* התחבורה מסופקת ע"י drive.js. בלעדיה הכל עובד חוץ מ-run(). */
  Sync.transport = null;

  /* ---------- ייצוא ---------- */

  /* `blobId` הוא מזהה מקומי ונחתך כאן, בגבול. זה מה שהופך את כלל
     "אסור לו לחצות את המיזוג" לדבר שאי אפשר לשכוח בהמשך. */
  function stripLocal(doc) {
    var out = DB.forSync(doc);
    var copy = {};
    Object.keys(out).forEach(function (k) { copy[k] = out[k]; });
    copy.files = (out.files || []).map(function (f) {
      /* המסגרת נוסעת — שלושת המספרים. היא בחירה של המשתמש ולא ערך נגזר,
         ומכשיר שני שמציג את אותו מסמך במסגרת אחרת נראה כמו באג. `focusZ`
         ברירת מחדל 1 ולא 0, אחרת מסמך ישן היה חוזר בהגדלה אפס. */
      return {
        driveFileId: f.driveFileId || null, mime: f.mime,
        name: f.name, size: f.size,
        focusX: typeof f.focusX === 'number' ? f.focusX : 50,
        focusY: f.focusY || 0,
        focusZ: typeof f.focusZ === 'number' ? f.focusZ : 1
      };
    });
    return copy;
  }

  Sync.exportDb = function () {
    return Promise.all([DB.all('entities'), DB.all('docs')]).then(function (r) {
      return {
        version: 1,
        exported: U.now(),
        entities: r[0],
        docs: r[1].map(stripLocal)
      };
    });
  };

  /* ---------- מיזוג ---------- */

  /* קובץ שהועלה מזוהה לפי driveFileId, וה-blobId המקומי שלו נשמר.
     קובץ מקומי שטרם עלה אינו קיים בצד המרוחק — ואסור שייעלם, אחרת
     סנכרון שרץ לפני ההעלאה מוחק את הקובץ מהמסמך. */
  function mergeFiles(localDoc, remoteDoc) {
    var byDrive = {};
    ((localDoc && localDoc.files) || []).forEach(function (f) {
      if (f.driveFileId) byDrive[f.driveFileId] = f;
    });

    var out = (remoteDoc.files || []).map(function (rf) {
      var lf = rf.driveFileId ? byDrive[rf.driveFileId] : null;
      return {
        blobId: lf ? lf.blobId : null,
        driveFileId: rf.driveFileId || null,
        mime: rf.mime, name: rf.name, size: rf.size,
        focusX: typeof rf.focusX === 'number' ? rf.focusX : 50,
        focusY: rf.focusY || 0,
        focusZ: typeof rf.focusZ === 'number' ? rf.focusZ : 1
      };
    });

    ((localDoc && localDoc.files) || []).forEach(function (f) {
      if (!f.driveFileId) out.push(f);
    });

    return out;
  }

  /* טהורה. מחזירה מה לכתוב ומה חסר בצד המרוחק, בלי לגעת ב-DB. */
  Sync.mergeRecords = function (store, remoteRecs, localRecs) {
    var writes = [], needUpload = false;
    var localMap = {};
    (localRecs || []).forEach(function (r) { localMap[r.id] = r; });
    var remoteIds = {};

    (remoteRecs || []).forEach(function (rr) {
      remoteIds[rr.id] = 1;
      var lr = localMap[rr.id];
      var rt = rr.updatedAt || 0, lt = (lr && lr.updatedAt) || 0;

      if (!lr || rt > lt) {
        var merged = {};
        Object.keys(rr).forEach(function (k) { merged[k] = rr[k]; });
        if (store === 'docs') merged.files = mergeFiles(lr, rr);
        writes.push(merged);
      } else if (lt > rt) {
        needUpload = true;
      }
      /* תיקו: המקומי מנצח בשקט ואין שדה שובר-תיקו. שני מכשירים שערכו
         את אותה רשומה באותה מילישנייה יישארו חלוקים עד העריכה הבאה. */
    });

    (localRecs || []).forEach(function (lr) {
      if (!remoteIds[lr.id]) needUpload = true;
    });

    return { writes: writes, needUpload: needUpload };
  };

  Sync.merge = function (remote) {
    if (!remote) return Promise.resolve({ needUpload: true, localChanged: false });

    var needUpload = false, localChanged = false;

    return STORES.reduce(function (chain, store) {
      return chain.then(function () {
        return DB.all(store).then(function (localRecs) {
          var r = Sync.mergeRecords(store, remote[store] || [], localRecs);
          if (r.needUpload) needUpload = true;
          if (!r.writes.length) return null;
          localChanged = true;
          return r.writes.reduce(function (c, rec) {
            return c.then(function () { return DB.put(store, rec); });
          }, Promise.resolve());
        });
      });
    }, Promise.resolve()).then(function () {
      return { needUpload: needUpload, localChanged: localChanged };
    });
  };

  /* ---------- תור ---------- */

  /* התור אינו מקור האמת — ה-DB המקומי הוא. כל הרצה מגלה מחדש מה חסר,
     ולכן סגירת האפליקציה לפני שהטיימר רץ דוחה את הדחיפה ולא מאבדת אותה.
     ported from Navigo: js/google.js:Sync.queue */
  Sync.queue = function () {
    clearTimeout(_timer);
    _timer = setTimeout(function () { Sync.run({ silent: true }); }, DEBOUNCE_MS);
  };

  Sync.pending = function () { return _timer != null; };

  Sync.cancelQueue = function () { clearTimeout(_timer); _timer = null; };

  Sync.busy = function () { return _syncing; };

  /* ---------- מחזור מלא ---------- */

  function emit(state, detail) {
    document.dispatchEvent(new CustomEvent('fv-sync', { detail: { state: state, info: detail } }));
  }

  Sync.ready = function () {
    return !!(Sync.transport && Sync.transport.connected && Sync.transport.connected());
  };

  Sync.run = function (opts) {
    opts = opts || {};

    /* בלי המנעול הזה, שתי הרצות במקביל עושות קריאה וכתיבה בסדר משתנה
       ואחת דורסת את השנייה. נאביגו סימנה את זה כתקלה שכבר קרתה להם. */
    if (_syncing) return Promise.resolve({ skipped: 'busy' });
    if (!Sync.ready()) return Promise.resolve({ skipped: 'not-connected' });

    _syncing = true;
    _timer = null;
    emit('start');

    var T = Sync.transport;

    return T.getDb()
      .then(function (remote) { return Sync.merge(remote).then(function (m) {
        return { remote: remote, m: m };
      }); })
      .then(function (ctx) {
        return pushBlobs().then(function (pushed) {
          return { ctx: ctx, pushed: pushed };
        });
      })
      .then(function (x) {
        return pullBlobs().then(function () { return x; });
      })
      .then(function (x) {
        if (x.ctx.m.needUpload || x.pushed || !x.ctx.remote) {
          return Sync.exportDb().then(function (db) { return T.putDb(db); }).then(function () { return x; });
        }
        return x;
      })
      .then(function (x) {
        return S.set(C.K.lastSync, U.now()).then(function () {
          emit('done');
          if (x.ctx.m.localChanged) document.dispatchEvent(new CustomEvent('fv-data'));
          return { ok: true, localChanged: x.ctx.m.localChanged };
        });
      })
      .catch(function (e) {
        emit('error', e && e.message);
        return { error: (e && e.message) || String(e) };
      })
      .then(function (r) { _syncing = false; return r; });
  };

  /* קבצים מקומיים שטרם עלו. מסמך מסוג שאינו שומר קבצים לא מגיע לכאן
     ממילא, כי אין לו files[]. */
  function pushBlobs() {
    var T = Sync.transport;
    return DB.all('docs').then(function (docs) {
      var pending = [];
      docs.forEach(function (d) {
        if (d.deleted) return;
        (d.files || []).forEach(function (f) {
          if (f.blobId && !f.driveFileId) pending.push({ doc: d, file: f });
        });
      });
      if (!pending.length) return false;

      return pending.reduce(function (chain, item) {
        return chain.then(function () {
          return DB.blob(item.file.blobId).then(function (rec) {
            if (!rec) return null;
            return T.uploadBlob(item.doc.id, item.file.name, rec.mime, rec.data)
              .then(function (driveFileId) {
                item.file.driveFileId = driveFileId;
                /* חותמת חדשה, כדי שהמכשיר השני ילמד את ה-driveFileId */
                return DB.saveDoc(item.doc, []);
              });
          });
        });
      }, Promise.resolve()).then(function () { return true; });
    });
  }

  /* קבצים שקיימים בדרייב ואין לנו מקומית — מורדים לקאש כדי שיהיו אופליין. */
  function pullBlobs() {
    var T = Sync.transport;
    return DB.all('docs').then(function (docs) {
      var missing = [];
      docs.forEach(function (d) {
        if (d.deleted) return;
        (d.files || []).forEach(function (f) {
          if (!f.blobId && f.driveFileId) missing.push({ doc: d, file: f });
        });
      });
      return missing.reduce(function (chain, item) {
        return chain.then(function () {
          return T.downloadBlob(item.file.driveFileId).then(function (blob) {
            var id = U.id();
            item.file.blobId = id;
            return DB.saveDoc(item.doc, [{
              id: id, docId: item.doc.id, data: blob,
              mime: item.file.mime, size: blob.size
            }]);
          }).catch(function () { return null; });
        });
      }, Promise.resolve());
    });
  }

  window.Sync = Sync;
})();
