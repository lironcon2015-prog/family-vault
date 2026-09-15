/* app.js — אתחול, ניתוב, מסלולי הקלט הגלובליים. */
(function () {
  'use strict';

  var U = window.U, UI = window.UI, DB = window.DB, S = window.Settings,
      C = window.CONFIG, Vault = window.Vault, Screens = window.Screens,
      Files = window.Files;

  var App = {
    staged: [],
    proposal: null,
    pendingEntityId: null,
    pendingSource: 'upload',
    pendingMode: 'plain'
  };

  var root, nav, fileInput, locked = false;

  /* הפריט הימני ביותר הוא מסך הבית — לשם מגיע האגודל הימני.
     "העתקה מהירה" נשארת צמודה ל-FAB: היא הפעולה השנייה בתדירותה. */
  var TABS = [
    { hash: '#/entities', icon: 'i-users',    label: 'ישויות' },
    { hash: '#/quick',    icon: 'i-search',   label: 'העתקה' },
    { hash: null,         gap: true },
    { hash: '#/expiries', icon: 'i-calendar', label: 'תפוגות' },
    { hash: '#/settings', icon: 'i-settings', label: 'הגדרות' }
  ];

  /* ---------- ניתוב ---------- */

  function parse() {
    var h = (location.hash || '#/' + C.HOME).replace(/^#\/?/, '');
    return h.split('/').filter(Boolean);
  }

  /* ---------- הקשר השיוך ----------
     מסמך חדש נתלה על הישות שממסכה הוא נוסף, ולא על הראשונה ברשימה.
     ההקשר נגזר מהמסלול, מפני שכל מסלולי ההוספה — ה-FAB, גרירה, הדבקה —
     נכנסים מנקודות שונות ואין אחת מהן שיודעת לבדה מי הישות. מסך שאינו
     מסך ישות אינו הקשר, ולכן הוא מנקה שיוך ישן במקום לגרור אותו הלאה;
     טופס פתוח הוא היוצא מן הכלל — השיוך שכבר נבחר בו שורד החלפת קובץ. */
  App.entityContext = function () {
    var parts = parse();
    if (parts[0] === 'entity' && parts[1]) return parts[1];
    if (parts[0] === 'doc' && parts[1] === 'new') return App.pendingEntityId;
    return null;
  };

  /* ---------- היסטוריה ----------
     לא כל מסך הוא יעד. מסך טופס הוא צעד בדרך: ברגע שהשמירה הסתיימה
     הוא סיים את תפקידו, ולחיצה על "חזור" צריכה להוביל למי ששלח אליו —
     רשימת המסמכים של הישות — ולא להחזיר אותו ריק למסך.

     ההבחנה נשענת על חותמת שמוטבעת על כל רשומת היסטוריה: `d` הוא העומק
     בתוך האפליקציה, ו-`from` הוא ההאש שממנו הגענו. שניהם נשמרים ב-
     `history.state` ולכן שורדים רענון — ופתיחה ישירה של קישור, שאין
     מאחוריה שום רשומה שלנו, מזוהה כ-`d === 0` ואינה מוציאה מהאפליקציה. */
  var lastHash = null, lastDepth = -1, swapMark = null;

  App.at = function () { return location.hash || '#/' + C.HOME; };

  function stamp() {
    var st = history.state;
    if (st && typeof st.d === 'number') {
      /* רשומה שכבר ביקרנו בה — חזור או קדימה. החותמת שלה היא האמת. */
      lastDepth = st.d;
      lastHash = App.at();
      return;
    }
    var mark = swapMark || (lastDepth < 0
      ? { d: 0, from: null }
      : { d: lastDepth + 1, from: lastHash });
    swapMark = null;
    history.replaceState(mark, '');
    lastDepth = mark.d;
    lastHash = App.at();
  }

  /* מחליף את הרשומה הנוכחית במקום לדחוף אחת חדשה. העומק והמקור נשמרים,
     מפני שמבחינת ההיסטוריה זו אותה עמדה — רק התוכן שלה השתנה. */
  App.swap = function (hash) {
    if (App.at() === hash) return App.render();
    var st = history.state;
    swapMark = {
      d: (st && typeof st.d === 'number') ? st.d : 0,
      from: st ? st.from : null
    };
    location.replace(location.pathname + location.search + hash);
  };

  /* יציאה ממסך שאינו יעד. אם המסך שמאחורינו הוא בדיוק היעד — חוזרים
     אליו במקום לדחוף עותק שני שלו, שאחרת לחיצה אחת על "חזור" הייתה
     נראית כאילו לא קרה כלום. */
  App.leave = function (hash) {
    var st = history.state;
    if (st && st.d > 0 && st.from === hash) { history.back(); return; }
    App.swap(hash);
  };

  /* "חזור". `fallback` הוא ההורה הלוגי של המסך, ומשמש כשאין מאחורינו
     רשומה משלנו — קישור שנפתח ישירות, או טאב חדש. */
  App.back = function (fallback) {
    var st = history.state;
    if (st && st.d > 0) { history.back(); return; }
    App.swap(fallback || '#/' + C.HOME);
  };

  function screenFor(parts) {
    switch (parts[0]) {
      case 'quick':    return Screens.quick();
      case 'entities': return Screens.entities();
      case 'expiries': return Screens.expiries();
      case 'entity':   return Screens.entity(parts[1]);
      case 'settings': return Screens.settings();
      case 'chat':     return Screens.chat();
      case 'doc':
        if (parts[1] === 'new') return Screens.docForm(null);
        if (parts[2] === 'edit') return Screens.docForm(parts[1]);
        return Screens.doc(parts[1]);
      default:         return Screens[C.HOME]();
    }
  }

  /* התחבורה הפעילה. נקראת גם אחרי שינוי בהגדרות, כדי שהחלפה לא תדרוש
     רענון — הצינור קורא את `Sync.transport` בכל הרצה. */
  App.transport = function () {
    return S.get(C.K.backupMode) === 'oauth' ? window.Drive : window.Bridge;
  };

  App.render = function () {
    return Screens.reload().then(function () {
      var parts = parse();
      U.clear(root).appendChild(screenFor(parts));
      paintNav(parts);
      root.scrollTop = 0;
    });
  };

  /* מחוון סנכרון. שקט כשהכל בסדר — נקודה מופיעה רק כשיש מה לומר. */
  var syncDot = null;

  function paintSync(state) {
    if (!syncDot) return;
    syncDot.className = 'syncdot ' + state;
    syncDot.setAttribute('aria-label',
      state === 'start' ? 'מסנכרן' : state === 'error' ? 'הסנכרון נכשל' : 'מסונכרן');
    if (state === 'done') setTimeout(function () {
      if (syncDot.classList.contains('done')) syncDot.className = 'syncdot';
    }, 1800);
  }

  /* ---------- סרגל ---------- */

  function paintNav(parts) {
    var active = '#/' + (parts[0] || C.HOME);
    /* מסך פנימי משאיר את הלשון הראשית מודגשת */
    if (['entity', 'doc', 'chat'].indexOf(parts[0]) !== -1) active = '#/entities';
    nav.querySelectorAll('.nav-i').forEach(function (b) {
      b.classList.toggle('on', b.dataset.hash === active);
    });
  }

  function buildNav() {
    nav = U.el('div', { class: 'nav', role: 'navigation' });
    TABS.forEach(function (t) {
      if (t.gap) { nav.appendChild(U.el('span', { class: 'nav-gap' })); return; }
      var b = U.el('button', {
        class: 'nav-i', type: 'button', dataset: { hash: t.hash }
        /* האייקון עטוף, כדי שלטאב הפעיל תהיה כרית ולא רק צבע */
      }, [U.el('i', {}, U.icon(t.icon, 22)), U.el('span', { text: t.label })]);
      b.addEventListener('click', function () { location.hash = t.hash; });
      nav.appendChild(b);
    });

    var fab = U.el('button', {
      class: 'fab', type: 'button', 'aria-label': 'הוספת מסמך'
    }, U.icon('i-plus', 28));
    fab.addEventListener('click', function () { Screens.addSheet(); });

    syncDot = U.el('span', { class: 'syncdot', role: 'status' });
    document.body.appendChild(syncDot);
    document.body.appendChild(nav);
    document.body.appendChild(fab);
  }

  /* ---------- מסלולי הקלט ---------- */

  App.pickFiles = function (existingDoc, useCamera, mode) {
    fileInput.value = '';
    if (useCamera) fileInput.setAttribute('capture', 'environment');
    else fileInput.removeAttribute('capture');
    fileInput.dataset.docId = existingDoc ? existingDoc.id : '';
    App.pendingMode = mode || 'plain';
    fileInput.click();
  };

  function ingest(fileList, source, existingDocId) {
    if (!fileList || !fileList.length) return;
    App.pendingSource = source;
    var mode = App.pendingMode;
    App.pendingMode = 'plain';

    Files.normalizeAll(fileList).then(function (r) {
      if (r.errors.length) UI.toast(r.errors[0]);
      if (!r.files.length) return;

      if (existingDocId) return attachTo(existingDocId, r.files);

      App.staged = r.files;
      App.proposal = null;
      App.pendingEntityId = App.entityContext();
      var converted = r.files.filter(function (f) { return f.converted; })[0];
      if (converted) UI.toast('הומר · ' + Files.label(converted));

      /* MRZ צריך תמונה; ג׳מיני מקבל גם PDF */
      var image = r.files.filter(function (f) { return f.mime !== 'application/pdf'; })[0];
      if (mode === 'mrz') {
        if (!image) return openForm();
        return runMrz(image).then(openForm);
      }
      var any = r.files[0];
      if (any && window.Gemini.ready('image')) {
        return runGemini({ blob: any.blob, mime: any.mime }).then(openForm);
      }
      return openForm();
    });
  }

  function openForm() {
    if (location.hash === '#/doc/new') App.render();
    else location.hash = '#/doc/new';
  }

  /* ---------- גיליון ההמתנה של הפרסינג — DEC-43 ----------
     שני המסלולים, על המכשיר ובענן, מציגים את אותו גיליון ולכן גם את
     אותו **דלג**. דילוג אינו כישלון ואינו ביטול של ההוספה: המסמך ממשיך
     למסך ההוספה בדיוק כמו פרסינג שלא מצא דבר, והשדות ממולאים ביד.

     **סגירת הגיליון היא דילוג**, ולא רק הכפתור. גיליון שנעלם בהקשה על
     הרקע בזמן שהצינור ממשיך לרוץ ואז קופץ בחזרה עם תוצאה הוא בדיוק
     המסך שמלמד לא לסמוך על מה שרואים. */
  function waitSheet(opts) {
    var W = { skipped: false };
    var over = false;

    var status = U.el('p', { class: 'sheet-p', text: opts.status });
    var sheet = UI.sheet('קריאת המסמך', [
      status,
      U.el('p', { class: 'muted small', text: opts.note }),
      U.el('button', {
        class: 'btn ghost wide', type: 'button',
        onClick: function () { W.skip(); }
      }, 'דלג'),
      U.el('p', { class: 'muted small', text:
        'דילוג פותח את מסך המסמך מיד, והשדות נשארים להזנה ידנית.' })
    ], { onClose: function () { W.skip(); } });

    function finish(skipped) {
      if (over) return;
      over = true;
      W.skipped = skipped;
      sheet.close();
      if (skipped && opts.onSkip) opts.onSkip();
    }

    W.say = function (text) { if (!over) status.textContent = text; };
    W.done = function () { finish(false); };
    W.skip = function () { finish(true); };
    return W;
  }

  /* קריאת MRZ אורכת שניות ומורידה נכסים בפעם הראשונה — מסך שקוף על זה
     ולא ספינר אילם, כי המשתמש צריך לדעת שהוא מחכה להורדה חד-פעמית. */
  function runMrz(image) {
    var settle;
    var out = new Promise(function (res) { settle = res; });

    var w = waitSheet({
      status: 'מכין את הקריאה…',
      note: 'הקריאה מתבצעת על המכשיר. שום דבר לא נשלח לשום מקום.',
      /* ה-OCR עצמו אינו ניתן לקטיעה באמצע ריצה, ולכן הדילוג פותח את
         הטופס מיד ומה שממשיך ברקע כבר אינו נוגע במסך. */
      onSkip: function () { settle(); }
    });

    var LABEL = {
      'loading tesseract core': 'טוען את רכיב הקריאה…',
      'initializing tesseract': 'מאתחל…',
      'loading language traineddata': 'מוריד את מודל הקריאה — פעם אחת בלבד…',
      'initializing api': 'מאתחל…',
      'recognizing text': 'קורא את המסמך…'
    };

    window.Parse.fromMrz(image.blob, {
      onProgress: function (m) {
        if (m && LABEL[m.status]) w.say(LABEL[m.status]);
      }
    }).then(function (proposal) {
      /* קריאה שהסתיימה אחרי שדילגו אינה מציבה הצעה ואינה נוגעת בקבצים:
         `dropFiles` היה מוחק את הצילום מתחת לטופס שכבר פתוח. */
      if (w.skipped) return;
      w.done();
      App.proposal = proposal;
      if (proposal.dropFiles) App.staged = [];
    }, function () {
      if (!w.skipped) w.done();
    }).then(function () { settle(); });

    return out;
  }

  function attachTo(docId, files) {
    return DB.get('docs', docId).then(function (doc) {
      if (!doc) return;
      var blobs = files.map(function (f) {
        return { id: U.id(), docId: doc.id, data: f.blob, mime: f.mime, size: f.size };
      });
      doc.files = (doc.files || []).concat(blobs.map(function (b, i) {
        return { blobId: b.id, driveFileId: null, mime: b.mime, name: files[i].name, size: b.size };
      }));
      return DB.saveDoc(doc, blobs).then(function () {
        UI.toast(U.count(files.length, 'קובץ נוסף', 'קבצים נוספו'));
        App.render();
      });
    });
  }

  function buildFileInput() {
    fileInput = U.el('input', {
      type: 'file', accept: 'image/*,application/pdf', multiple: true,
      class: 'hidden-input', 'aria-hidden': 'true', tabindex: '-1'
    });
    fileInput.addEventListener('change', function () {
      var docId = fileInput.dataset.docId || '';
      var source = fileInput.hasAttribute('capture') ? 'camera' : 'upload';
      ingest(fileInput.files, source, docId);
    });
    document.body.appendChild(fileInput);
  }

  /* הדבקה — שני מסלולי משנה. SPEC §7.1.
     שלושת הדרכים להגיע לכאן — Ctrl+V גלובלי, כפתור בגיליון ההוספה, ויעד
     ההדבקה — נשפכות לפונקציה אחת, כדי שלא יתפצלו בהתנהגות. */
  /* מחזירה true רק כשמשהו באמת נקלט. הקורא **חייב** את זה: יעד ההדבקה
     סגר את עצמו לפני שידע אם הגיע קובץ, וכשלא הגיע — וזה המצב הרגיל
     ב-iOS, שאינו מדביק קבצים לתוך contenteditable — המשתמש נזרק מהזרימה
     בלי מילה. גיליון שנסגר על כלום הוא הכישלון הגרוע ביותר: הוא נראה
     כאילו הפעולה הצליחה. */
  App.ingestPaste = function (dt, opts) {
    var files = Files.fromDataTransfer(dt);
    if (files.length) { ingest(files, 'paste', ''); return true; }

    var text = dt && dt.getData && dt.getData('text/plain');
    return App.ingestText(text, opts);
  };

  /* מחזירה true רק כשהיא באמת עשתה משהו. טקסט שאי אפשר לפרסר אינו
     "טופל" — הקורא צריך לדעת את זה כדי להציע מסלול אחר, ולא לבלוע. */
  App.ingestText = function (text, opts) {
    if (!text || !text.trim()) return false;
    if (!window.Gemini.ready('text')) {
      if (!(opts && opts.quiet)) UI.toast('כדי לפרסר טקסט, הפעל את זה בהגדרות');
      return false;
    }
    App.staged = [];
    App.proposal = null;
    App.pendingEntityId = App.entityContext();
    runGemini({ text: text.trim() }).then(openForm);
    return true;
  };

  /* קריאת הלוח ביוזמת המשתמש. דורשת מחווה, ולכן היא נקראת מתוך לחיצה.

     **מה שה-API הזה לא יודע לעשות:** הוא מוסר רשימת טיפוסים מסוננת —
     `text/plain`, `text/html`, `image/png`. **`application/pdf` אינו
     ברשימה ולעולם לא יחזור ממנו**, ולא משנה מה יש בלוח בפועל; אפילו
     `clipboard.write` דוחה אותו במפורש. קובץ מגיע רק דרך אירוע `paste`
     אמיתי, שנושא `DataTransfer.files` — או דרך גרירה ובחירת קובץ.

     לכן כשאין כאן תמונה או טקסט בר-פרסינג, המסלול אינו מסתיים בהודעה
     אלא **ביעד ההדבקה**, שהוא המקום היחיד שבו הדבקת PDF באמת עובדת. */
  /* שתי נסיבות שונות, ושתיהן נגמרות באותו מקום — אבל לא באותו הסבר.
     "הדפדפן חסם" ו"הלוח לא הכיל קובץ" מובילים את המשתמש לשני דברים
     שונים לנסות, ולכן הודעה אחת לשניהם הייתה מדויקת פחות משתיהן. */
  var WHERE = ' הדבק כאן במסגרת — שם זה כן עובד — או בחר את הקובץ מהמכשיר.';
  var NO_FILE = 'הדפדפן אינו מוסר קבצים מהלוח לקוד.' + WHERE;
  var BLOCKED = 'הדפדפן לא נתן לקרוא את הלוח.' + WHERE;

  App.pasteRoute = function () {
    var nav = navigator.clipboard;
    if (!nav || !nav.read) {
      Screens.pasteSheet();
      return;
    }
    nav.read().then(function (items) {
      for (var i = 0; i < items.length; i++) {
        /* כל טיפוס שאינו טקסט הוא קובץ בעינינו — תמונה או PDF. הגבלה
           ל-`image/` בלבד הפכה הדבקה של PDF ל"אין תמונה או טקסט בלוח",
           שזאת הודעה שקרית על לוח שיש בו בדיוק את מה שביקשו. */
        var fileType = items[i].types.filter(function (t) {
          return t.indexOf('text/') !== 0;
        })[0];
        if (fileType) {
          return items[i].getType(fileType).then(function (blob) {
            ingest([new File([blob], Files.nameFor(blob.type), { type: blob.type })], 'paste', '');
          });
        }
      }
      return (nav.readText ? nav.readText() : Promise.resolve('')).then(function (txt) {
        if (!App.ingestText(txt, { quiet: true })) Screens.pasteSheet(NO_FILE);
      });
    }).catch(function () {
      Screens.pasteSheet(BLOCKED);
    });
  };

  function bindPaste() {
    document.addEventListener('paste', function (e) {
      if (locked) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.target.isContentEditable) return;
      if (App.ingestPaste(e.clipboardData)) e.preventDefault();
    });
  }

  function bindDrop() {
    var shell = document.body;
    var depth = 0;

    shell.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    shell.addEventListener('dragenter', function (e) {
      e.preventDefault();
      if (++depth === 1) shell.classList.add('dragging');
    });
    shell.addEventListener('dragleave', function () {
      if (--depth <= 0) { depth = 0; shell.classList.remove('dragging'); }
    });
    shell.addEventListener('drop', function (e) {
      e.preventDefault();
      depth = 0;
      shell.classList.remove('dragging');
      if (locked) return;
      ingest(Files.fromDataTransfer(e.dataTransfer), 'drop', '');
    });
  }

  /* פרסינג בענן. רץ רק כששניהם קיימים — מפתח והסכמה — ולכן הוא אופציונלי
     בפועל ולא רק בהצהרה. */
  /* מחזירה את ההצעה. מי שקרא מחליט מה לעשות בה — הצינור מציב אותה
     ופותח טופס, והכפתור שבטופס מזרים אותה לשדות שכבר על המסך. */
  App.runGemini = function (input) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var settle;
    var out = new Promise(function (res) { settle = res; });

    var w = waitSheet({
      status: 'שולח לפרסינג…',
      note: input.blob ? 'הקובץ נשלח לגוגל לצורך הפרסינג.'
                       : 'הטקסט נשלח לגוגל לצורך הפרסינג.',
      /* כאן הדילוג קוטע באמת: הבקשה נופלת, והתשובה — אם היא בדרך —
         אינה מגיעה לשום מקום. */
      onSkip: function () {
        if (ctrl) ctrl.abort();
        settle(null);
      }
    });

    /* המפל אינו סוד. מודל שלא ענה ומודל הבא בתור הם ההסבר להמתנה
       שממשיכה, ובלעדיו הגיליון נראה תקוע. */
    window.Parse.fromGemini(input, function (model, n) {
      w.say(n > 1 ? 'המודל לא ענה — מנסה את הבא…' : 'קורא…');
    }, ctrl && ctrl.signal)
      .then(function (proposal) {
        if (w.skipped) return;
        w.done();
        settle(proposal);
      }, function () {
        /* `Parse.fromGemini` הופך כשל להצעה שנושאת הודעה, ולכן דחייה
           כאן היא דילוג בלבד — והגיליון כבר נסגר עם הלחיצה. */
        if (w.skipped) return;
        w.done();
        settle(null);
      });

    return out;
  };

  function runGemini(input) {
    return App.runGemini(input).then(function (p) { App.proposal = p; });
  }

  /* ---------- קנה מידה קבוע ----------
     האפליקציה נועלת את הזום שלה. הסיבה אינה אסתטית: מסך שגדל וקטן בטעות
     בזמן שגוררים ישות או לוחצים על שורה הופך כל מחווה למפוקפקת, והמשתמש
     מפסיק לסמוך על מה שהאצבע שלו עושה.

     מה שכן מתקרב ומתרחק הוא **המסמך**, בצופה, עם משטח משלו (`UI.zoomable`).
     ה-`meta` לבדו אינו מספיק — iOS Safari מתעלם מ-`user-scalable=no` מאז
     iOS 10 — ולכן שלוש המחוות נחסמות בקוד, וכולן נעצרות בגבול `.zoom-stage`.

     בחזרה לאפליקציה קנה המידה נאכף מחדש: כתיבה מחדש של ה-meta היא הדרך
     היחידה לבקש מהדפדפן לאפס זום שנתפס איכשהו. */
  var Zoom = {
    meta: null,
    VIEW: 'width=device-width, initial-scale=1, maximum-scale=1, ' +
          'minimum-scale=1, user-scalable=no, viewport-fit=cover',

    inViewer: function (el) {
      return !!(el && el.closest && el.closest('.zoom-stage'));
    },

    boot: function () {
      Zoom.meta = document.querySelector('meta[name="viewport"]');

      ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
        document.addEventListener(name, function (e) {
          if (Zoom.inViewer(e.target)) return;
          e.preventDefault();
        }, { passive: false });
      });

      document.addEventListener('wheel', function (e) {
        if (!e.ctrlKey || Zoom.inViewer(e.target)) return;
        e.preventDefault();
      }, { passive: false });

      /* הקשה כפולה מגדילה בספארי גם כשה-meta אוסר. שתי הקשות בתוך 320ms
         באותו אזור — הראשונה עוברת, השנייה נבלעת. */
      var last = 0;
      document.addEventListener('touchend', function (e) {
        if (Zoom.inViewer(e.target)) return;
        var now = Date.now();
        if (now - last < 320) e.preventDefault();
        last = now;
      }, { passive: false });

      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') Zoom.reset();
      });
      window.addEventListener('pageshow', Zoom.reset);
    },

    reset: function () {
      if (!Zoom.meta) return;
      Zoom.meta.setAttribute('content', Zoom.VIEW + ', maximum-scale=1.0001');
      requestAnimationFrame(function () { Zoom.meta.setAttribute('content', Zoom.VIEW); });
    }
  };

  App.Zoom = Zoom;

  /* ---------- נעילה ---------- */

  function showLock() {
    locked = true;
    document.body.classList.add('locked');
    U.clear(root).appendChild(Screens.lock(function () {
      locked = false;
      document.body.classList.remove('locked');
      App.render();
    }));
  }

  /* ---------- עדכוני גרסה ----------
     ported from Navigo: js/app.js:Updater. שלוש שכבות, וכולן נכתבו נגד באגים
     אמיתיים של ספארי מול GitHub Pages — ואנחנו מוגשים מאותו מקום:
       1. רישום עם updateViaCache:'none' — בלי HTTP cache לסקריפט ה-SW עצמו.
       2. version.json (network-first) הוא מקור האמת. אם הוא חדש וה-SW לא
          מתעדכן — רישום מחדש עם ./sw.js?v=<גרסה>, כתובת חדשה ששום קאש לא
          יכול להגיש ממנה עותק ישן.
       3. עדכון כפוי: ניקוי caches, רישום מחדש, טעינה.
     הנתונים ב-IndexedDB לא נמחקים באף אחת מהן. */
  var Updater = {
    reg: null,
    remote: '',
    registered: '',

    boot: function () {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then(function (reg) {
          Updater.reg = reg;
          reg.addEventListener('updatefound', function () {
            var sw = reg.installing;
            if (!sw) return;
            sw.addEventListener('statechange', function () {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) Updater.offer();
            });
          });
        })
        .catch(function () { /* דפדפן בלי SW — האפליקציה עובדת בלעדיו */ });

      /* בטעינה הראשונה אין controller, וה-SW תופס שליטה מיד — רענון שם הוא
         הבהוב מיותר בפתיחה הראשונה של האפליקציה. מרעננים רק כשהוחלף
         controller שכבר היה, כלומר עדכון אמיתי. */
      var hadController = !!navigator.serviceWorker.controller;
      var reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController || reloading) { hadController = true; return; }
        reloading = true;
        Updater.reload();
      });

      Updater.check();
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') Updater.check();
      });
    },

    /* בולם רענון.

       השילוב שמייצר לולאה: `version.json` מכריז גרסה שאינה `_BUNDLE_VERSION`
       — פריסה חלקית, או CDN שמגיש index.html ישן לצד version.json טרי.
       אז כל בדיקה רושמת מחדש SW בכתובת אחרת, `skipWaiting` מפעיל
       `controllerchange`, זה מרענן, ואחרי הרענון אי-ההתאמה עדיין שם. הדף
       מהבהב בלי סוף.

       הבולם: רענון אחד לכל צמד גרסאות, נזכר ב-sessionStorage. אם הרענון
       לא סגר את הפער — הפער אינו ניתן לסגירה מהדפדפן, ובמקום עוד סיבוב
       מוצג הפס עם כפתור. עדיף עדכון שדורש נגיעה על מסך שאי אפשר לקרוא. */
    /* ההחלטה לחוד מהפעולה, כדי שאפשר יהיה לבדוק אותה בלי לרענן דף. */
    shouldReload: function () {
      var tag = (Updater.remote || '?') + '|' + (window._BUNDLE_VERSION || '?');
      var prev = '';
      try { prev = sessionStorage.getItem('fv-reload') || ''; } catch (e) { /* מצב פרטי */ }
      if (prev === tag) return false;
      try { sessionStorage.setItem('fv-reload', tag); } catch (e) { /* מצב פרטי */ }
      return true;
    },

    reload: function () {
      if (!Updater.shouldReload()) { Updater.offer(); return false; }
      location.reload();
      return true;
    },

    check: function () {
      if (Updater.reg) { try { Updater.reg.update(); } catch (e) { /* לא חוסם */ } }
      fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var remote = j && j.version;
          var current = window._BUNDLE_VERSION || '';
          if (!remote || remote === current) return;
          Updater.remote = remote;
          var reg = Updater.reg;
          if (reg && !reg.waiting && !reg.installing && Updater.registered !== remote) {
            /* השרת חדש אבל שום התקנה לא בדרך — כתובת ייחודית עוקפת כל קאש.
               פעם אחת לגרסה: רישום חוזר בכתובת מתחלפת הוא בעצמו משאבה
               שמייצרת controllerchange, וזה הצד השני של אותה לולאה. */
            Updater.registered = remote;
            navigator.serviceWorker
              .register('sw.js?v=' + encodeURIComponent(remote), { updateViaCache: 'none' })
              .then(function (r2) { Updater.reg = r2; })
              .catch(function () { /* לא חוסם */ });
          }
          if (reg && reg.waiting) Updater.offer();
        })
        .catch(function () { /* אופליין — אין מה לבדוק */ });
    },

    offer: function () {
      if (document.querySelector('.update-bar')) return;
      var bar = U.el('div', { class: 'update-bar', role: 'status' }, [
        U.el('span', { text: 'יש גרסה חדשה' }),
        U.el('button', { class: 'btn', type: 'button', onClick: function () {
          var w = Updater.reg && Updater.reg.waiting;
          if (w) w.postMessage('skip-waiting');
          else location.reload();
        } }, 'רענון')
      ]);
      document.body.appendChild(bar);
    }
  };

  /* ---------- אתחול ---------- */

  function boot() {
    root = document.getElementById('app');
    buildNav();
    buildFileInput();
    bindPaste();
    bindDrop();
    Zoom.boot();

    window.addEventListener('hashchange', function () {
      stamp();
      if (locked) return;
      App.render();
    });

    Vault.watch(showLock);
    Updater.boot();

    /* ---- סנכרון ----
       שתי תחבורות מממשות את אותו חוזה, והבחירה היא שורה אחת. `bridge`
       הוא ברירת המחדל מפני שאין בו התחברות חוזרת (DEC-31); `oauth`
       נשאר למי שמעדיף את ההרשאות המצומצמות של `drive.file`. */
    window.Sync.transport = App.transport();
    DB.onWrite = function () { window.Sync.queue(); };

    /* שלושה טריגרים: עלייה, חזרה לפוקוס, וחזרת רשת. האחרון הוא שורה אחת
       שנאביגו ממליצה עליה ואין לה — visibilitychange מכסה את רוב המקרים
       בנייד, אבל לא את מי שהאפליקציה פתוחה אצלו כשהרשת חוזרת. */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') window.Sync.run({ silent: true });
    });
    window.addEventListener('online', function () { window.Sync.run({ silent: true }); });
    document.addEventListener('fv-data', function () { App.render(); });
    document.addEventListener('fv-sync', function (e) { paintSync(e.detail.state); });

    DB.open()
      .then(function () { return S.load(); })
      .then(function () {
        if (!location.hash) location.hash = '#/' + C.HOME;
        stamp();
        if (Vault.enabled() && Vault.hasPin() && !Vault.isUnlocked()) {
          showLock();
        } else {
          App.render();
          window.Sync.run({ silent: true });
        }
      })
      .catch(function (e) {
        U.clear(root).appendChild(U.el('div', { class: 'scr' }, [
          U.el('h1', { class: 'scr-title', text: 'האחסון לא נפתח' }),
          U.el('p', { class: 'muted', text:
            'הדפדפן חסם את IndexedDB. גלישה פרטית או חסימת אחסון אתרים מונעות מהאפליקציה לעבוד.' }),
          U.el('p', { class: 'muted small', text: String(e && e.message || e) })
        ]));
      });
  }

  /* חשוף כדי שהבולם יהיה בר-בדיקה. אין לו קורא אחר. */
  App.Updater = Updater;

  window.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
