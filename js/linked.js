/* linked.js — מסמכים מקושרים מאפליקציה אחרת. DEC-47, SPEC §18.

   ישות יכולה להיות **מראה** של מסמכים שאפליקציה אחרת כבר העלתה לדרייב —
   הדירה בנתניה והמסמכים שהתקציב מחזיק עליה. שום קובץ לא מועלה שוב ושום
   קובץ לא משוכפל לדרייב:

     · **הרשימה** — מסמכים, קבוצות, סכומים, תמלול — נקראת מקובץ הגיבוי של
       המקור דרך הגשר, ונשמרת כאן כקאש מקומי בלבד (`settings`, לא מסונכרן).
     · **הקובץ** יורד רק כשנוגעים בו, ונשמר ב-`blobs` תחת `link:<מקור>`,
       כך שמה שנפתח פעם אחת נפתח גם בלי רשת.
     · **המראה הוא קריאה בלבד.** לכל מסמך בעלים אחד, והמקור הוא הבעלים.

   מסמך שצריך יכולות של כספת — תפוגה, שדות שמעתיקים — נוסף אליה
   (`promote`). הוא מסמך כספת מלא לכל דבר, והקובץ שלו נשאר הקובץ של המקור:
   `files[].src`/`srcId` אומרים מאיפה להוריד אותו, ו-`driveFileId` שכבר קיים
   הוא מה שמונע מ-`Sync` להעלות אותו שוב.

   המודול אינו מכיר מסך. הוא מכיר את הטבלה (`CONFIG.LINK_SOURCES`), את
   ה-DB ואת התחבורה — ולכן כל מה שכאן נבדק בלי לפתוח מסך אחד. */
(function () {
  'use strict';

  var C = window.CONFIG, U = window.U, DB = window.DB, S = window.Settings,
      DT = window.DOC_TYPES, KINDS = window.KINDS;

  var L = {};

  /* ---------- הטבלה ---------- */

  L.sources = function () { return C.LINK_SOURCES || []; };

  L.source = function (key) {
    return L.sources().filter(function (s) { return s.key === key; })[0] || null;
  };

  /* המקור שהישות היא מראה שלו, או null */
  L.of = function (entity) {
    return (entity && entity.link && L.source(entity.link.source)) || null;
  };

  /* לכל מקור ישות אחת לכל היותר. שתי ישויות שמראות את אותם מסמכים הן
     שני מקומות שבהם מסמך אחד "נמצא", ואף אחד מהם אינו הנכון. */
  L.entityFor = function (key, entities) {
    return (entities || []).filter(function (e) {
      return !e.deleted && e.link && e.link.source === key;
    })[0] || null;
  };

  /* ---------- התחבורה ---------- */

  function transport() { return window.Sync && window.Sync.transport; }

  /* רק הגשר יודע לקרוא מקורות. `drive.file` של OAuth רואה רק קבצים
     שהכספת עצמה יצרה — זו ההרשאה המצומצמת שבגללה בוחרים בו. */
  L.supported = function () {
    var T = transport();
    return !!(T && T.canLink);
  };

  L.ready = function () {
    var T = transport();
    return !!(T && T.canLink && T.connected && T.connected());
  };

  L.whyNot = function () {
    var T = transport();
    if (!T || !T.canLink) return 'הקישור עובד דרך גשר Apps Script. בהתחברות לגוגל הכספת רואה רק קבצים שהיא עצמה יצרה.';
    if (!T.connected()) return 'הגשר לא הוגדר — הדבק כתובת וסוד בהגדרות, תחת גיבוי.';
    return '';
  };

  /* ---------- נרמול ---------- */

  function str(v) { return v == null ? '' : String(v); }

  /* הקטגוריות: המובנות של המקור בסדר שלו, ואחריהן מה שהמשתמש הוסיף שם.
     מזהה זהה למובנה הוא אותה קטגוריה, גם אם הקובץ נושא אותו. */
  L.cats = function (src, rawCats) {
    var out = src.cats.map(function (c) {
      return { id: c.id, label: c.label, icon: c.icon, custom: false };
    });
    var seen = {};
    out.forEach(function (c) { seen[c.id] = 1; });
    (rawCats || []).forEach(function (c) {
      if (!c || !c.id || seen[c.id]) return;
      seen[c.id] = 1;
      out.push({ id: str(c.id), label: str(c.label) || 'קטגוריה', icon: src.fallbackIcon, custom: true });
    });
    return out;
  };

  /* טהורה. מה שהגשר החזיר → מה שהמסכים קוראים. */
  L.normalize = function (src, raw) {
    raw = raw || {};
    var cats = L.cats(src, raw.cats);
    var known = {};
    cats.forEach(function (c) { known[c.id] = 1; });
    var docs = (raw.docs || []).filter(function (d) { return d && d.id; }).map(function (d) {
      return {
        id: str(d.id), title: str(d.title) || str(d.name) || 'מסמך', name: str(d.name),
        mime: str(d.mime), size: Number(d.size) || 0,
        /* קטגוריה שנמחקה במקור — המסמך עובר לברירת המחדל, בדיוק כמו שם */
        cat: known[d.cat] ? str(d.cat) : src.fallbackCat,
        date: U.isRealDate(str(d.date)) ? str(d.date) : '',
        amount: Number(d.amount) || 0, summary: str(d.summary), text: str(d.text),
        fileId: str(d.fileId), payment: d.payment == null ? null : d.payment,
        created: str(d.created)
      };
    });
    return {
      found: raw.found !== false,
      title: str(raw.title), docs: docs, cats: cats,
      exported: str(raw.exported), modified: Number(raw.modified) || 0
    };
  };

  L.cat = function (manifest, id) {
    var cats = (manifest && manifest.cats) || [];
    return cats.filter(function (c) { return c.id === id; })[0] || cats[cats.length - 1] || null;
  };

  L.find = function (manifest, id) {
    return ((manifest && manifest.docs) || []).filter(function (d) { return d.id === id; })[0] || null;
  };

  /* ---------- קבוצות ---------- */

  /* הסדר בתוך קבוצה הוא התאריך שהמסמך נושא, ולא מועד ההעלאה — אצווה של
     שוברים שנסרקה בערב אחד נקראת אחרת 4,1,3,2. זה הלקח של המקור עצמו. */
  L.chrono = function (d) { return d.date || str(d.created).slice(0, 10); };

  function byChronoDesc(a, b) {
    var ka = L.chrono(a), kb = L.chrono(b);
    if (ka !== kb) return ka < kb ? 1 : -1;
    return a.title.localeCompare(b.title, 'he');
  }

  L.groups = function (manifest) {
    if (!manifest) return [];
    return manifest.cats.map(function (c) {
      var docs = manifest.docs.filter(function (d) { return d.cat === c.id; }).sort(byChronoDesc);
      var dates = docs.map(L.chrono).filter(Boolean).sort();
      return { cat: c, docs: docs, from: dates[0] || '', to: dates[dates.length - 1] || '' };
    }).filter(function (g) { return g.docs.length; });
  };

  /* ---------- חיפוש ---------- */

  function fmtDate(ymd) { return ymd ? KINDS.get('date').format(ymd) : ''; }

  L.money = function (n) {
    return n ? '₪' + Math.round(n).toLocaleString('en-US') : '';
  };

  /* `U.norm` מוחק גם רווחים, ולכן אינו מתאים לחיפוש על מילים. כאן נמחקים
     רק ניקוד וסימני פיסוק, כך ש-"84,210" ו-"84210" ו-"12.08.2025" ו-
     "12/08/2025" נפגשים, והרווחים נשארים גבולות בין מילים. */
  function fold(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\u0591-\u05C7]/g, '')
      .replace(/[-.\/\\_,()\[\]]/g, '');
  }

  L.tokens = function (q) {
    return String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  };

  /* כל מה שהשורה מציגה, ועוד התמלול. הסכום בכמה צורות, כי קוראים אותו
     מעוצב ומקלידים אותו חשוף. */
  L.haystack = function (manifest, d) {
    var cat = L.cat(manifest, d.cat);
    return fold([
      d.title, d.name, cat ? cat.label : '', d.summary, d.text,
      d.date, fmtDate(d.date),
      d.amount ? String(d.amount) : '', d.amount ? String(Math.round(d.amount)) : '', L.money(d.amount),
      d.payment != null ? 'תשלום ' + d.payment : ''
    ].join(' '));
  };

  /* AND על מילים: "שובר 7" מצמצם לפי שתי עובדות בלתי תלויות */
  L.search = function (manifest, q) {
    var toks = L.tokens(q);
    if (!manifest) return [];
    if (!toks.length) return manifest.docs.slice().sort(byChronoDesc);
    var folded = toks.map(fold).filter(Boolean);
    return manifest.docs.filter(function (d) {
      var h = L.haystack(manifest, d);
      return folded.every(function (t) { return h.indexOf(t) !== -1; });
    }).sort(byChronoDesc);
  };

  /* התאמה שנמצאה רק בתוך הסריקה חייבת להיראות, אחרת התוצאה נראית כמו
     מסמך לא קשור. מחזיר קטע סביב המילה הראשונה שנמצאה בתמלול. */
  L.snippet = function (d, toks, radius) {
    var text = str(d.text);
    if (!text || !toks || !toks.length) return null;
    var low = text.toLowerCase();
    var at = -1, len = 0;
    toks.forEach(function (t) {
      var i = low.indexOf(t);
      if (i !== -1 && (at === -1 || i < at)) { at = i; len = t.length; }
    });
    if (at === -1) return null;
    var r = radius || 36;
    var s = Math.max(0, at - r), e = Math.min(text.length, at + len + r);
    return {
      before: (s > 0 ? '…' : '') + text.slice(s, at),
      hit: text.slice(at, at + len),
      after: text.slice(at + len, e) + (e < text.length ? '…' : '')
    };
  };

  /* ---------- קאש הרשימה ---------- */

  function cacheAll() {
    var c = S.get(C.K.linkCache);
    return c && typeof c === 'object' ? c : {};
  }

  L.cached = function (key) { return cacheAll()[key] || null; };

  /* קריאה מהמקור. מחזירה גם מה נוסף ומה נעלם מאז הקריאה הקודמת, כדי
     שהמסך יכריז על השינוי פעם אחת ולא ישנה רשימה בשקט. */
  L.refresh = function (key) {
    var src = L.source(key);
    if (!src) return Promise.reject(new Error('מקור לא מוכר'));
    if (!L.ready()) return Promise.reject(new Error(L.whyNot()));
    return transport().linkManifest(key).then(function (raw) {
      if (!raw || raw.found === false) {
        throw new Error('לא נמצא גיבוי של ' + src.app + ' בדרייב. ודא שהסנכרון לדרייב פעיל שם.');
      }
      var manifest = L.normalize(src, raw);
      var prev = L.cached(key);
      var before = {}, now = {};
      ((prev && prev.manifest && prev.manifest.docs) || []).forEach(function (d) { before[d.id] = 1; });
      manifest.docs.forEach(function (d) { now[d.id] = 1; });
      var added = prev ? manifest.docs.filter(function (d) { return !before[d.id]; }) : [];
      var removed = prev ? prev.manifest.docs.filter(function (d) { return !now[d.id]; }) : [];

      var all = cacheAll();
      var next = {};
      Object.keys(all).forEach(function (k) { next[k] = all[k]; });
      next[key] = { at: U.now(), manifest: manifest };
      return S.set(C.K.linkCache, next).then(function () {
        return { manifest: manifest, added: added, removed: removed, first: !prev };
      });
    });
  };

  /* ---------- קבצים ---------- */

  L.blobId = function (key, d) { return 'link:' + key + ':' + d.fileId; };

  L.isCached = function (key, d) {
    if (!d.fileId) return Promise.resolve(false);
    return DB.blob(L.blobId(key, d)).then(function (r) { return !!r; });
  };

  /* מהקאש אם יש, ואחרת מהמקור — ואז לקאש. מחזיר רשומת blob באותה צורה
     ש-`UI.viewer` מקבל. */
  L.file = function (key, d) {
    var src = L.source(key);
    if (!d.fileId) {
      return Promise.reject(new Error('הקובץ עוד לא עלה לדרייב מ' + src.app + ' — פתח אותו שם פעם אחת עם חיבור לדרייב.'));
    }
    var id = L.blobId(key, d);
    return DB.blob(id).then(function (rec) {
      if (rec) return rec;
      if (!L.ready()) throw new Error(L.whyNot());
      return transport().linkDownload(key, d.fileId).then(function (blob) {
        var out = { id: id, docId: 'link:' + key, data: blob, mime: blob.type || d.mime, size: blob.size };
        return DB.put('blobs', out);
      });
    });
  };

  /* ---------- מה שכבר בכספת ---------- */

  function linkedFile(doc, key) {
    return (doc.files || []).filter(function (f) { return f.src === key; })[0] || null;
  }

  /* מסמכי כספת שהקובץ שלהם הוא קובץ של המקור, לפי מזהה המסמך שם */
  L.promoted = function (key, docs) {
    var out = {};
    (docs || []).forEach(function (doc) {
      if (doc.deleted) return;
      var f = linkedFile(doc, key);
      if (f && f.srcId) out[f.srcId] = doc;
    });
    return out;
  };

  /* מסמך כספת שהמקור שלו נעלם — נמחק שם, או שהגיבוי שם עוד לא נכתב.
     הוא לא נמחק מכאן לבד: הכספת אחראית על התפוגה שלו. */
  L.orphans = function (key, manifest, docs) {
    if (!manifest) return [];
    var ids = {};
    manifest.docs.forEach(function (d) { ids[d.id] = 1; });
    return (docs || []).filter(function (doc) {
      if (doc.deleted) return false;
      var f = linkedFile(doc, key);
      return f && f.srcId && !ids[f.srcId];
    });
  };

  /* ---------- הוספה לכספת ---------- */

  /* ההצעה הראשונה לסוג המסמך. רק סוג שקיים ושמותר לישות כזו. */
  L.typeFor = function (src, catId, entityType) {
    var key = src.typeMap && src.typeMap[catId];
    var t = key ? DT.get(key) : null;
    if (!t || t.entityTypes.indexOf(entityType || src.entityType) === -1) return null;
    return t.key;
  };

  /* ערכים שהמקור כבר יודע. העמודה בשדה → הערך במראה. */
  var FILL = {
    amount: function (d) { return L.money(d.amount); },
    price: function (d) { return L.money(d.amount); },
    title: function (d) { return d.title; }
  };

  L.prefill = function (typeKey, d) {
    var t = DT.get(typeKey);
    if (!t) return [];
    return t.fields.map(function (f) {
      var fn = FILL[f.key];
      var value = fn ? fn(d) || '' : '';
      if (!value) return null;
      var rec = {
        key: f.key, label: f.label, value: value, kind: f.kind,
        sensitive: !!KINDS.get(f.kind).sensitive, confidence: null, verified: false,
        multiline: !!f.multiline
      };
      rec.verified = KINDS.check(rec).ok;
      return rec;
    }).filter(Boolean);
  };

  /* הקובץ מועתק **לקאש המקומי של המסמך החדש** בלבד. בדרייב הוא נשאר
     אחד: `driveFileId` הוא הקובץ של המקור, ולכן `Sync` אינו מעלה אותו. */
  L.promote = function (key, entityId, d, typeKey) {
    var t = DT.get(typeKey);
    if (!t) return Promise.reject(new Error('סוג מסמך לא מוכר'));
    return L.file(key, d).then(function (rec) {
      var docId = U.id(), blobId = U.id();
      var doc = {
        id: docId, entityId: entityId, typeKey: typeKey,
        title: d.title || t.label,
        fields: L.prefill(typeKey, d),
        issueDate: d.date || null,
        expiryDate: null,
        files: t.allowFiles ? [{
          blobId: blobId, driveFileId: d.fileId, src: key, srcId: d.id,
          mime: rec.mime || d.mime, name: d.name || d.title, size: rec.size,
          focusX: 50, focusY: 0, focusZ: 1
        }] : [],
        source: 'link',
        notes: d.summary || '',
        supersededBy: null,
        sortOrder: null
      };
      var blobs = t.allowFiles
        ? [{ id: blobId, docId: docId, data: rec.data, mime: rec.mime, size: rec.size }]
        : [];
      return DB.saveDoc(doc, blobs);
    });
  };

  /* המקור מחק את הקובץ, והמשתמש בחר לשמור אותו. זו הפעם היחידה שקובץ
     מועתק לדרייב של הכספת: בלי `driveFileId` הסנכרון הבא מעלה אותו. */
  L.keepCopy = function (doc) {
    var missing = (doc.files || []).filter(function (f) { return f.src && !f.blobId; });
    if (missing.length) {
      return Promise.reject(new Error('הקובץ לא שמור במכשיר הזה, ולכן אין ממה ליצור עותק.'));
    }
    doc.files = (doc.files || []).map(function (f) {
      if (!f.src) return f;
      var copy = {};
      Object.keys(f).forEach(function (k) { if (k !== 'src' && k !== 'srcId') copy[k] = f[k]; });
      copy.driveFileId = null;
      return copy;
    });
    return DB.saveDoc(doc, []);
  };

  /* ---------- קישור הישות ---------- */

  /* ישות אחת למקור: הקישור עובר, ולא מוכפל */
  L.link = function (key, entity, entities) {
    var prev = L.entityFor(key, entities);
    var chain = Promise.resolve();
    if (prev && prev.id !== entity.id) {
      prev.link = null;
      chain = DB.saveEntity(prev);
    }
    return chain.then(function () {
      entity.link = { source: key };
      return DB.saveEntity(entity);
    });
  };

  L.unlink = function (entity) {
    entity.link = null;
    return DB.saveEntity(entity);
  };

  window.Linked = L;
})();
