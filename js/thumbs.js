/* thumbs.js — דף קטן של המסמך בכל שורה ברשימה. DEC-50, SPEC §18.5.

   שני מקורות, ותשובה אחת למסך:

     · **מסמך כספת** — הקובץ כבר במכשיר, ולכן התמונה נגזרת ממנו מקומית
       (`UI.thumbnail`). בלי רשת, בלי גשר ובלי גוגל, כמו שאר הכספת.
     · **מסמך במראה** — אם הקובץ המלא כבר בקאש, ממנו. אחרת מהגשר, שמחזיר את
       התמונה הממוזערת שגוגל כבר מייצרת לכל קובץ — כמה קילובייט במקום
       הקובץ כולו. בקשות שמגיעות באותו רגע נאספות לבקשה אחת.

   כל תמונה נשמרת ב-`blobs` תחת `thumb:…`, ולכן נטענת פעם אחת ומוצגת גם בלי
   רשת. של מסמך כספת — עם ה-`docId` שלו, כך שמחיקת המסמך מוחקת גם אותה.
   "אין תמונה" נשמר גם הוא (`data: null`), כדי שלא נבקש אותה שוב ושוב.

   התשובה היא תמיד אחת משלוש: `{ url }`, `{ none: true }` (אין קובץ, או אין
   ממנו תמונה), או `{ offline: true }` (יש קובץ, ואין כרגע דרך להביא אותו). */
(function () {
  'use strict';

  var DB = window.DB, UI = window.UI;

  var T = {};
  var urls = {};      // מזהה → object URL, לכל חיי הדף
  var pending = {};   // מזהה → Promise, כדי ששתי שורות לא יבקשו פעמיים

  function urlFor(id, blob) {
    if (!urls[id]) urls[id] = URL.createObjectURL(blob);
    return urls[id];
  }

  function remember(id, docId, blob) {
    var rec = { id: id, docId: docId, data: blob || null, mime: blob ? blob.type : '', size: blob ? blob.size : 0 };
    return DB.put('blobs', rec).then(function () { return rec; });
  }

  function answer(id, rec) {
    if (rec && rec.data) return { url: urlFor(id, rec.data) };
    return { none: true };
  }

  function once(id, make) {
    if (urls[id]) return Promise.resolve({ url: urls[id] });
    if (!pending[id]) {
      pending[id] = make().then(function (r) { delete pending[id]; return r; },
        function (e) { delete pending[id]; throw e; });
    }
    return pending[id];
  }

  /* ---------- מסמך כספת ---------- */

  T.forDoc = function (doc) {
    var f = (doc.files || [])[0];
    if (!f) return Promise.resolve({ none: true });
    var id = 'thumb:' + (f.blobId || (f.src ? f.src + ':' + f.driveFileId : doc.id));
    return once(id, function () {
      return DB.blob(id).then(function (hit) {
        if (hit) return answer(id, hit);
        return DB.blob(f.blobId).then(function (rec) {
          if (rec) return rec;
          /* קובץ מקושר שעוד לא ירד למכשיר הזה — ממה שהמראה כבר שמר */
          if (f.src && f.driveFileId && window.Linked) {
            return DB.blob(window.Linked.blobId(f.src, { fileId: f.driveFileId }));
          }
          return null;
        }).then(function (rec) {
          if (!rec) return { offline: true };
          return UI.thumbnail(rec.data, rec.mime || f.mime).then(function (b) {
            return remember(id, doc.id, b).then(function (r) { return answer(id, r); });
          });
        });
      });
    });
  };

  /* ---------- מסמך במראה ---------- */

  var BATCH = 12;
  var GATHER_MS = 40;
  var queue = {};     // מקור → [{ d, resolve }]
  var timer = {};

  function flush(key) {
    var items = queue[key] || [];
    queue[key] = [];
    timer[key] = null;
    for (var i = 0; i < items.length; i += BATCH) {
      (function (chunk) {
        var ids = chunk.map(function (x) { return x.d.fileId; });
        var tr = window.Sync && window.Sync.transport;
        tr.linkThumbs(key, ids).then(function (map) {
          chunk.forEach(function (x) {
            var id = T.linkedId(key, x.d);
            remember(id, 'link:' + key, map[x.d.fileId] || null)
              .then(function (r) { x.resolve(answer(id, r)); });
          });
        }, function () {
          /* תקלה ברשת אינה "אין תמונה". לא נשמר כלום, והשורה תנסה שוב. */
          chunk.forEach(function (x) { x.resolve({ offline: true }); });
        });
      })(items.slice(i, i + BATCH));
    }
  }

  T.linkedId = function (key, d) { return 'thumb:link:' + key + ':' + d.fileId; };

  T.forLinked = function (key, d) {
    var L = window.Linked;
    if (!d.fileId) return Promise.resolve({ none: true });
    var id = T.linkedId(key, d);
    return once(id, function () {
      return DB.blob(id).then(function (hit) {
        if (hit) return answer(id, hit);
        /* הקובץ המלא כבר בקאש — ממנו, בלי לשאול את גוגל */
        return DB.blob(L.blobId(key, d)).then(function (full) {
          if (full) {
            return UI.thumbnail(full.data, full.mime || d.mime).then(function (b) {
              return remember(id, 'link:' + key, b).then(function (r) { return answer(id, r); });
            });
          }
          var tr = window.Sync && window.Sync.transport;
          if (!L.ready() || !tr.linkThumbs) return { offline: true };
          return new Promise(function (resolve) {
            /* כל שורה בודקת קודם את הקאש המקומי, ולכן הן מגיעות לתור בהפרשים
               של כמה מילישניות. חלון שמתאפס בכל הצטרפות אוסף את כולן. */
            (queue[key] = queue[key] || []).push({ d: d, resolve: resolve });
            clearTimeout(timer[key]);
            timer[key] = setTimeout(function () { flush(key); }, GATHER_MS);
          });
        });
      });
    });
  };

  /* ---------- האלמנט ----------
     גודל קבוע בכל המצבים, כך שהשורה אינה קופצת כשהתמונה מגיעה. */
  T.el = function (opts) {
    var box = window.U.el('span', {
      class: 'th' + (opts.large ? ' th-l' : '') + ' th-wait', 'aria-hidden': 'true'
    });
    opts.load().then(function (r) {
      box.classList.remove('th-wait');
      if (r && r.url) {
        box.appendChild(window.U.el('img', { src: r.url, alt: '', loading: 'lazy' }));
        if (opts.mime === 'application/pdf') box.appendChild(window.U.el('span', { class: 'th-pdf', text: 'PDF' }));
        return;
      }
      box.classList.add('th-none');
      box.appendChild(window.U.icon(opts.icon || 'i-file', 18));
      if (r && r.offline) {
        box.appendChild(window.U.el('span', { class: 'th-off', title: 'עוד לא נטען — יופיע כשיש רשת' },
          window.U.icon('i-cloud', 9)));
      }
    });
    return box;
  };

  window.Thumbs = T;
})();
