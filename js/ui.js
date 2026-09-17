/* ui.js — toast, גיליונות, שורת שדה, צופה. */
(function () {
  'use strict';

  var U = window.U, KINDS = window.KINDS, C = window.CONFIG;
  var toastEl = null, toastTimer = null;

  var UI = {};

  /* ---------- toast ---------- */
  /* "הועתק" בלבד. "מספר תעודת הזהות הועתק" מכריז בקול את מה שמיסכת. */
  UI.toast = function (msg) {
    if (!toastEl) {
      toastEl = U.el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' },
        U.el('span'));
      document.body.appendChild(toastEl);
    }
    toastEl.firstChild.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  };

  /* ---------- לוח ---------- */
  /* חייב לרוץ בתוך ה-gesture — iOS Safari מסרב אחרת */
  UI.copy = function (text) {
    var s = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).catch(function () { legacy(s); });
    } else {
      legacy(s);
    }
    function legacy(v) {
      var ta = U.el('textarea', { readonly: true });
      ta.value = v;
      ta.style.cssText = 'position:fixed;top:0;inset-inline-start:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* אין מסלול שלישי */ }
      document.body.removeChild(ta);
    }
  };

  /* ---------- שורת שדה — הרכיב החשוב באפליקציה ---------- */
  /* כל השורה היא יעד המגע. אין כפתור "העתק" נפרד.
     העתקה עובדת גם במצב ממוסך ומעתיקה את הערך המלא. */
  UI.fieldRow = function (field, opts) {
    opts = opts || {};
    var shown = KINDS.display(field);
    var sensitive = KINDS.isSensitive(field);
    var revealed = false;

    var valueBox = U.el('span', { class: 'row-v' });

    function paint() {
      U.clear(valueBox);
      var txt = (sensitive && !revealed) ? KINDS.mask(shown) : shown;
      valueBox.appendChild(U.bidi(txt, sensitive ? 'sens' : null));
    }
    paint();

    var labelBox = U.el('span', { class: 'row-l' }, [
      U.el('span', { text: field.label })
    ]);
    if (field.verified === false) {
      labelBox.appendChild(U.el('span', { class: 'chip verify', text: 'לאימות' }));
    }

    var body = U.el('span', { class: 'row-b' }, [labelBox, valueBox]);
    if (opts.sub) body.appendChild(U.el('span', { class: 'row-sub', text: opts.sub }));

    var row = U.el('div', {
      class: 'row' + (field.multiline ? ' row-multi' : ''),
      role: 'button',
      tabindex: '0',
      'aria-label': 'העתקת ' + field.label
    }, body);

    if (sensitive) {
      var eye = U.el('button', {
        class: 'eye', type: 'button',
        'aria-label': 'הצג ערך', 'aria-pressed': 'false'
      }, U.icon('i-eye'));
      eye.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        revealed = !revealed;
        paint();
        U.clear(eye).appendChild(U.icon(revealed ? 'i-eye-off' : 'i-eye'));
        eye.setAttribute('aria-label', revealed ? 'הסתר ערך' : 'הצג ערך');
        eye.setAttribute('aria-pressed', String(revealed));
      });
      row.appendChild(eye);
    }

    function doCopy() {
      UI.copy(KINDS.copyValue(field));
      UI.toast('הועתק');
      if (opts.onCopy) opts.onCopy();
    }

    row.addEventListener('click', doCopy);
    row.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); doCopy(); }
    });

    return row;
  };

  UI.rowsCard = function (rows) {
    return U.el('div', { class: 'rows' }, rows);
  };

  /* ---------- צ׳יפ תפוגה ---------- */
  /* צבע לעולם לא לבדו — הצ׳יפ נושא גם טקסט */
  /* התמונה של הישות בפס רחב, לאריחי הלוח. אותו `avatarImage` ואותה
     מסגרת שנבחרה — רק חלון אחר. בלי תמונה יורד אייקון הסוג על משטח
     בגוון הישות, כדי שהאריח לא ייראה שבור. */
  UI.avatarImage = function (entity) {
    var e = entity || {};
    if (e.avatarImage) {
      var img = U.el('img', { src: e.avatarImage, alt: '' });
      UI.applyFocus(img, e.avatarFocus);
      return img;
    }
    var meta = (window.CONFIG.ENTITY_TYPES.filter(function (t) {
      return t.key === e.type;
    })[0] || {});
    return U.el('span', {
      class: 'av-blank',
      style: 'background:' + (e.color || '#8D929B')
    }, U.icon(meta.icon || 'i-doc', 30));
  };

  UI.chip = function (bucket, text) {
    return U.el('span', { class: 'chip ' + bucket, text: text });
  };

  /* אווטאר: תמונה אם יש, ואות אם אין. התמונה היא data URL על הרשומה
     ולכן היא נצבעת בפריים הראשון — בלי קריאה אסינכרונית ובלי הבהוב. */
  /* `ring` הוא מפתח דלי תפוגה, ואז האווטאר נושא טבעת בצבע הדלי. זה
     המקום היחיד במסך הבית שבו הקשת החמה נוגעת בישות עצמה. */
  UI.avatar = function (entity, size, ring) {
    var e = entity || { name: '?', color: '#8D929B' };
    var style = 'background:' + (e.color || '#8D929B');
    if (size) style += ';width:' + size + 'px;height:' + size + 'px;font-size:' +
                       Math.round(size * 0.38) + 'px';
    var box = U.el('span', {
      class: 'av' + (e.avatarImage ? ' av-img' : '') + (ring ? ' ring-' + ring : ''),
      style: style
    });
    if (e.avatarImage) {
      var img = U.el('img', { src: e.avatarImage, alt: '' });
      /* המסגרת שנבחרה. ברירת המחדל היא מרכז — וזה בדיוק מה שאווטאר
         שנשמר לפני שהבורר היה קיים כבר נראה, ולכן הוא אינו משתנה. */
      UI.applyFocus(img, e.avatarFocus);
      box.appendChild(img);
    } else {
      box.appendChild(U.el('span', { text: (e.avatar || (e.name || '?').trim()[0] || '?') }));
    }
    return box;
  };

  /* מסגרת היא שלושה מספרים — שני צירים והגדלה — ולא שניים. `z` חסר
     פירושו 1, ולכן כל אווטאר וכל מסמך שנשמרו לפני שההגדלה הייתה קיימת
     נראים בדיוק כפי שנראו. */
  UI.focusOf = function (focus, def) {
    var d = def || { x: 50, y: 50 };
    var f = focus || {};
    function num(v, dv) { var n = Number(v); return isNaN(n) ? dv : n; }
    return {
      x: Math.max(0, Math.min(100, num(f.x, d.x))),
      y: Math.max(0, Math.min(100, num(f.y, d.y))),
      z: Math.max(1, Math.min(window.CONFIG.CROP_MAX_ZOOM, num(f.z, 1)))
    };
  };

  UI.focusCss = function (focus, def) {
    var f = UI.focusOf(focus, def);
    return f.x + '% ' + f.y + '%';
  };

  /* שלוש התכונות יוצאות יחד מפונקציה אחת בכוונה. `transform-origin`
     שזהה ל-`object-position` הוא מה שמקבע את הנקודה שנבחרה בזמן
     ההגדלה — התמונה גדלה סביבה במקום להחליק ממנה. שתי הצהרות נפרדות
     באתרי הציור היו נפרדות ביום שמישהו יעדכן רק אחת מהן.

     המסגרת חייבת אב שחותך: `transform` גולש מעבר לגבול האלמנט, ו-
     `overflow: hidden` על התמונה עצמה אינו עושה דבר. */
  UI.applyFocus = function (img, focus, def) {
    var f = UI.focusOf(focus, def);
    var pos = f.x + '% ' + f.y + '%';
    img.style.objectPosition = pos;
    img.style.transformOrigin = pos;
    img.style.transform = f.z > 1 ? 'scale(' + f.z + ')' : '';
    return f;
  };

  /* ---------- מצב ריק — הפעולה בתוך המסגרת ----------
     ported from Navigo: js/app.js:renderHero — **כל המסגרת היא <button> אחד**,
     לא div עם כפתור בתוכו. זה מה שנותן ל"הפעולה בתוך המסגרת" משמעות אמיתית:
     כל השטח לחיץ, ו-scale(.97) מגיב על המסגרת כולה ולא על הפיל הפנימי. */
  UI.empty = function (o) {
    var kids = [
      U.icon(o.icon || 'i-file', 48),
      U.el('div', { class: 'empty-t', text: o.title }),
      o.sub ? U.el('div', { class: 'empty-s', text: o.sub }) : null
    ];
    if (!o.action) return U.el('div', { class: 'empty' }, kids);

    kids.push(U.el('span', { class: 'btn', text: o.action }));
    return U.el('button', {
      class: 'empty empty-act', type: 'button', onClick: o.onAction
    }, kids);
  };

  /* ---------- גיליון תחתון ---------- */
  UI.sheet = function (title, content, opts) {
    opts = opts || {};
    var panel = U.el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      U.el('div', { class: 'sheet-h' }, [
        U.el('h2', { text: title }),
        U.el('button', {
          class: 'iconbtn', type: 'button', 'aria-label': 'סגירה',
          onClick: function () { close(); }
        }, U.icon('i-x', 22))
      ]),
      U.el('div', { class: 'sheet-b' }, content)
    ]);
    var back = U.el('div', { class: 'backdrop' }, panel);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('in'); });

    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    function close() {
      document.removeEventListener('keydown', onKey);
      back.classList.remove('in');
      setTimeout(function () { back.remove(); }, 200);
      if (opts.onClose) opts.onClose();
    }
    return { close: close, panel: panel };
  };

  /* גיליון עם שדה טקסט אחד. מחזיר את הערך, או `null` בביטול —
     ביטול וערך ריק אינם אותו דבר, ולכן `null` ולא מחרוזת ריקה. */
  UI.prompt = function (o) {
    return new Promise(function (res) {
      var settled = false;
      function finish(v) { if (!settled) { settled = true; res(v); } }

      var input = U.el('input', {
        class: 'f-i', type: 'text', id: 'p-in', value: o.value || '',
        placeholder: o.placeholder || '', autocomplete: 'off', maxlength: '80'
      });
      var err = U.el('div', { class: 'f-err' });

      function submit() {
        var v = input.value.trim();
        if (!v) { err.textContent = o.empty || 'צריך ערך'; return; }
        finish(v);
        s.close();
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });

      var s = UI.sheet(o.title, [
        o.body ? U.el('p', { class: 'sheet-p', text: o.body }) : null,
        U.el('div', { class: 'f-g' }, [
          o.label ? U.el('label', { class: 'f-l', for: 'p-in', text: o.label }) : null,
          input, err
        ]),
        U.el('div', { class: 'sheet-actions' }, [
          U.el('button', { class: 'btn', type: 'button', onClick: submit }, o.ok || 'שמירה'),
          U.el('button', {
            class: 'btn ghost', type: 'button',
            onClick: function () { finish(null); s.close(); }
          }, 'ביטול')
        ])
      ], { onClose: function () { finish(null); } });

      setTimeout(function () { input.focus(); input.select(); }, 80);
    });
  };

  UI.confirm = function (o) {
    return new Promise(function (res) {
      var settled = false;
      function finish(v) { if (!settled) { settled = true; res(v); } }
      var s = UI.sheet(o.title, [
        U.el('p', { class: 'sheet-p', text: o.body }),
        U.el('div', { class: 'sheet-actions' }, [
          U.el('button', {
            class: 'btn' + (o.danger ? ' danger' : ''), type: 'button',
            onClick: function () { finish(true); s.close(); }
          }, o.ok || 'אישור'),
          U.el('button', {
            class: 'btn ghost', type: 'button',
            onClick: function () { finish(false); s.close(); }
          }, 'ביטול')
        ])
      ], { onClose: function () { finish(false); } });
    });
  };

  /* ---------- גרירה לסידור ----------
     לחיצה ארוכה מפעילה, כדי שגלילה של רשימה לא תיהפך בטעות לגרירה.

     שלושה דברים שנדרשו כדי שזה יעבוד **בנייד**, ובלעדיהם הגרירה גללה
     את הדף במקום להזיז את הכרטיס:

     1. **`touch-action` נקבע בתחילת המחווה, לא באמצעה.** הוספת המחלקה
        `.reordering` אחרי 320ms מגיעה מאוחר מדי — הדפדפן כבר החליט
        שהמגע הזה עשוי לגלול. מה שכן עוצר אותו הוא `touchmove` **לא
        פסיבי** עם `preventDefault`, וזה עובד כאן דווקא מפני שהלחיצה
        הארוכה קודמת: בזמן ההמתנה האצבע לא זזה, גלילה עוד לא התחילה,
        והביטול הראשון מונע אותה מלהתחיל.
     2. **iOS מקפיץ בועת בחירה על לחיצה ארוכה** ומבטל את רצף המצביע.
        `-webkit-touch-callout` ו-`user-select` ב-CSS סוגרים את זה.
     3. **גלילה אוטומטית בקצוות.** בלעדיה אי אפשר לגרור אל מחוץ למסך,
        וברשימה ארוכה מהמסך זה חצי מהמקרים.

     אחרי הגרירה נבלע קליק אחד — אחרת שחרור על כרטיס היה מנווט אליו. */
  /* ---------- סידור מחדש בגרירה ----------
     הלוגיקה עבדה; מה שלא עבד הוא המשוב, ובמחווה שנמשכת שנייה שלמה
     המשוב **הוא** התכונה. שלושה דברים תוקנו, וכולם על מה שהעין רואה:

     1. **הכרטיס הולך אחרי האצבע.** קודם הוא נשאר בזרימה וקפץ משבצת
        לשבצת ברגע שחצה אמצע של שכן — כלומר האצבע זזה והכרטיס עמד, ואז
        קפץ. עכשיו הוא נישא ב-`translateY`, ומקומו בזרימה נמדד מחדש
        אחרי כל החלפה כדי שיישאר בדיוק תחת הנקודה שנתפסה בו.

     2. **השכנים מחליקים.** FLIP: מודדים לפני ההזזה, מזיזים ב-DOM,
        ואז מחזירים אותם ויזואלית למקום הישן — ומשם CSS מנפיש אותם אל
        החדש. הפער נפתח במקום להיפתח בבת אחת.

     3. **ללחיצה הארוכה יש התקדמות.** 320ms של שום דבר ואז קפיצה
        נקראים כתקלה. `.pressing` מכווץ את הכרטיס לאורך ההמתנה, ולכן
        האצבע מקבלת תשובה עוד לפני שהגרירה התחילה.

     המדידה נשארת `getBoundingClientRect` בכל פריים ולא מטמון: גלילה
     אוטומטית מזיזה את כולם, ומטמון היה נכון רק עד לגלילה הראשונה. */
  UI.reorder = function (container, opts) {
    var HOLD_MS = 320, SLOP = 10, EDGE = 76, MAX_STEP = 14, LAND_MS = 200;
    var timer = null, active = null, startX = 0, startY = 0, dragged = false;
    var pointerX = 0, pointerY = 0, raf = null, pressing = null;
    var grabDX = 0, grabDY = 0, homeLeft = 0, homeTop = 0;

    /* ---------- הציר ----------
       'y' רשימה, 'x' רצועה אופקית, 'grid' לוח דו-טורי. הציר מגיע מהקורא
       ולא נגזר מה-DOM, מפני שאותו מיכל יכול להיראות אחרת בשתי רזולוציות
       והמחווה חייבת להיות יציבה. DEC-39 */
    var axis = opts.axis || 'y';
    var movesX = axis !== 'y', movesY = axis !== 'x';
    function rtl() { return getComputedStyle(container).direction === 'rtl'; }

    function items() {
      return Array.prototype.slice.call(container.querySelectorAll(opts.itemSelector));
    }

    /* מי גולל בפועל — האב הקרוב שאפשר לגלול בו, או החלון.
       ברצועה אופקית זה המיכל עצמו, ולכן הוא נבדק ראשון. */
    function scroller() {
      if (movesX && container.scrollWidth > container.clientWidth) return container;
      var el = container.parentNode;
      while (el && el.nodeType === 1) {
        var st = getComputedStyle(el);
        if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight) return el;
        el = el.parentNode;
      }
      return null;
    }

    function scrollBy(d) {
      var el = scroller();
      if (movesX && el === container) { container.scrollLeft += (rtl() ? -d : d); return; }
      if (el) el.scrollTop += d;
      else window.scrollBy(0, d);
    }

    /* המקום שהכרטיס תופס בזרימה, בלי ההזזה שרוכבת עליו. המדידה מנטרלת
       את ה-transform ומחזירה אותו באותו פריים, ולכן אין הבהוב. */
    function measureHome() {
      if (!active) return;
      var t = active.style.transform;
      active.style.transform = 'none';
      var r = active.getBoundingClientRect();
      homeLeft = r.left; homeTop = r.top;
      active.style.transform = t;
    }

    /* ההזזה שמשאירה את הכרטיס תחת האצבע. רק בציר שהמחווה נעה בו — כרטיס
       ברשימה אנכית שנגרר גם הצידה נראה כאילו הוא נשמט מהיד. */
    function lift() {
      if (!active) return;
      var dx = movesX ? (pointerX - grabDX) - homeLeft : 0;
      var dy = movesY ? (pointerY - grabDY) - homeTop : 0;
      active.style.transform =
        'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(1.03)';
    }

    function tick() {
      if (!active) { raf = null; return; }

      /* גלילה אוטומטית בקצה. ברצועה אופקית הקצוות הם של המיכל, וברשימה
         הם של החלון — האצבע מגיעה לשוליים במקום אחר לגמרי. */
      var lead, trail;
      if (movesX && scroller() === container) {
        var cr = container.getBoundingClientRect();
        lead = pointerX - (cr.left + EDGE / 2);
        trail = (cr.right - EDGE / 2) - pointerX;
        if (rtl()) { var t = lead; lead = trail; trail = t; }
      } else {
        lead = pointerY - EDGE;
        trail = (window.innerHeight - EDGE) - pointerY;
      }
      if (lead < 0) scrollBy(-Math.min(MAX_STEP, Math.ceil(-lead / 4)));
      else if (trail < 0) scrollBy(Math.min(MAX_STEP, Math.ceil(-trail / 4)));

      measureHome();
      place(pointerX, pointerY);
      lift();
      raf = requestAnimationFrame(tick);
    }

    function begin(el, pointerId) {
      active = el;
      dragged = true;
      unpress();
      el.classList.remove('landing');
      /* נעילת המעבר על הנגרר בלבד: הוא חייב לעקוב אחרי האצבע 1:1,
         בעוד שהשכנים דווקא צריכים את ההנפשה. */
      el.style.transition = 'none';
      el.classList.add('dragging');
      container.classList.add('reordering');
      var r = el.getBoundingClientRect();
      grabDX = pointerX - r.left; grabDY = pointerY - r.top;
      homeLeft = r.left; homeTop = r.top;
      lift();
      if (navigator.vibrate) navigator.vibrate(15);
      try { el.setPointerCapture(pointerId); } catch (err) { /* לא חוסם */ }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    /* האם השכן הזה בא **אחרי** נקודת המגע בסדר הקריאה — כלומר האם
       הנגרר צריך להישתל לפניו.
       ב-RTL סדר הקריאה הוא מימין לשמאל, ולכן "מוקדם יותר" הוא X גדול
       יותר. בלוח דו-טורי השורה גוברת על הטור. */
    function isAfter(x, y, r) {
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (axis === 'y') return y < cy;
      if (axis === 'grid' && Math.abs(cy - y) > r.height * 0.6) return y < cy;
      return rtl() ? x > cx : x < cx;
    }

    function place(x, y) {
      if (!active) return;
      var sibs = items().filter(function (s) { return s !== active; });
      var rects = sibs.map(function (s) { return s.getBoundingClientRect(); });

      var before = null;
      for (var i = 0; i < sibs.length; i++) {
        if (isAfter(x, y, rects[i])) { before = sibs[i]; break; }
      }
      /* המיכל רשאי להחזיק ילדים שאינם פריטים — ברצועה יושב בסופה כפתור
         "ישות חדשה". `appendChild` היה משתיל את הנגרר **אחריו**, ולכן
         הסוף נמדד מול הפריט האחרון ולא מול הילד האחרון. */
      var last = sibs[sibs.length - 1];
      var needed = before
        ? before.previousElementSibling !== active
        : (last ? last.nextElementSibling !== active : false);
      if (!needed) return;

      if (before) container.insertBefore(active, before);
      else container.insertBefore(active, last.nextSibling);

      /* FLIP. ההפרש נמדד מול המקום שבו השכן **נראה** רגע קודם — כולל
         באמצע הנפשה קודמת — ולכן החלפה רודפת החלפה ממשיכה ברצף במקום
         להתחיל מחדש מקפיצה. */
      sibs.forEach(function (s, i) {
        var now = s.getBoundingClientRect();
        var dx = rects[i].left - now.left, dy = rects[i].top - now.top;
        if (!dx && !dy) return;
        s.style.transition = 'none';
        s.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      });
      requestAnimationFrame(function () {
        sibs.forEach(function (s) { s.style.transition = ''; s.style.transform = ''; });
      });

      measureHome();
    }

    function unpress() {
      if (!pressing) return;
      pressing.classList.remove('pressing');
      pressing = null;
    }

    container.addEventListener('pointerdown', function (e) {
      var el = e.target.closest ? e.target.closest(opts.itemSelector) : null;
      if (!el || !container.contains(el)) return;
      startX = e.clientX; startY = e.clientY;
      pointerX = e.clientX; pointerY = e.clientY;
      dragged = false;
      clearTimeout(timer);
      unpress();
      pressing = el;
      el.classList.add('pressing');
      var id = e.pointerId;
      timer = setTimeout(function () { begin(el, id); }, HOLD_MS);
    });

    container.addEventListener('pointermove', function (e) {
      pointerX = e.clientX; pointerY = e.clientY;
      if (!active) {
        /* תנועה לפני שההמתנה הבשילה היא גלילה, לא גרירה — ולכן נמדדת
           על שני הצירים: ברצועה אופקית הגלילה היא בדיוק בציר הגרירה. */
        var moved = Math.max(Math.abs(e.clientX - startX), Math.abs(e.clientY - startY));
        if (timer && moved > SLOP) { clearTimeout(timer); timer = null; unpress(); }
        return;
      }
      e.preventDefault();
      measureHome();
      place(e.clientX, e.clientY);
      lift();
    });

    /* הבלם על הגלילה. חייב להיות לא-פסיבי, אחרת `preventDefault` מתעלם. */
    container.addEventListener('touchmove', function (e) {
      if (!active) return;
      e.preventDefault();
    }, { passive: false });

    function end() {
      clearTimeout(timer); timer = null;
      unpress();
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (!active) return;

      var el = active;
      active = null;
      container.classList.remove('reordering');

      /* נחיתה. הנעילה שהגרירה שמה משתחררת קודם, אחרת `transform: ''`
         היה מתלישׁ את הכרטיס למקומו בלי מעבר. */
      el.style.transition = '';
      el.classList.add('landing');
      el.style.transform = '';

      var settled = false;
      function settle() {
        if (settled) return;
        settled = true;
        el.classList.remove('dragging', 'landing');
        el.style.transform = '';
        el.removeEventListener('transitionend', settle);
      }
      el.addEventListener('transitionend', settle);
      /* בלי מעבר — `prefers-reduced-motion` — אין `transitionend`,
         והכרטיס היה נשאר מורם לנצח. */
      setTimeout(settle, LAND_MS + 60);

      if (opts.onDrop) opts.onDrop(items());
    }

    container.addEventListener('pointerup', end);
    container.addEventListener('pointercancel', end);

    /* שלב הלכידה — הכרטיס עצמו מאזין לקליק, וצריך לעצור אותו לפניו */
    container.addEventListener('click', function (e) {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    /* ובנייד לא תמיד מגיע קליק אחרי גרירה, ולכן הדגל מתאפס גם בהרפיה —
       אחרת הנגיעה הבאה על כרטיס נבלעת בלי סיבה. */
    container.addEventListener('pointerup', function () {
      setTimeout(function () { dragged = false; }, 350);
    });
  };

  /* ---------- בורר מסגרת ----------
     מסגרת היא חלון לתוך תמונה שאינה בצורתה: 16:10 לעוגן המסמך, עיגול
     לאווטאר של ישות. באיזה חלק של התמונה החלון יושב אינו דבר שקוד יכול
     לנחש נכון — ראש התמונה שגוי בצילום עם שוליים, והמרכז שגוי בפורטרט
     שהפנים בו למעלה. לכן זו בחירה, ולא ברירת מחדל חכמה.

     שני צירים, כי הצורה קובעת איזה מהם חי: `cover` משאיר סרך בציר אחד
     בלבד, ובעיגול הוא יכול להיות כל אחד מהם. הגרירה מומרת **לפי הסרך
     האמיתי בפיקסלים**, ולכן היא עוקבת אחרי האצבע ולא מקרבת.

     `src` הוא Blob או data URL — האווטאר כבר שמור כמחרוזת, והמסמך יושב
     בחנות ה-blobs. `URL.createObjectURL` נוצר ומבוטל רק במקרה הראשון. */
  UI.cropper = function (src, focus, opts) {
    opts = opts || {};
    var MAXZ = window.CONFIG.CROP_MAX_ZOOM;
    var def = opts.defaultFocus || { x: 50, y: 50 };
    function clamp(v, d) {
      var n = Number(v);
      return isNaN(n) ? d : Math.max(0, Math.min(100, n));
    }
    function clampZ(v) {
      var n = Number(v);
      return isNaN(n) ? 1 : Math.max(1, Math.min(MAXZ, n));
    }
    var pos = { x: clamp(focus && focus.x, def.x), y: clamp(focus && focus.y, def.y) };
    var zoom = clampZ(focus && focus.z);

    /* הסרך של `cover` בהגדלה 1, ולצדו גודל המסגרת. שניהם נחוצים כי
       הסרך בהגדלה z אינו הכפלה שלו: התמונה גדלה, אבל המסגרת לא. */
    var slack = { x: 0, y: 0 };
    var boxSize = { w: 1, h: 1 };
    var loaded = false;

    /* iw*s*z - bw, כתוב דרך הסרך שכבר חושב: (slack + box)*z - box. */
    function slackAt(axis) {
      var s0 = axis === 'x' ? slack.x : slack.y;
      var b = axis === 'x' ? boxSize.w : boxSize.h;
      return s0 * zoom + b * (zoom - 1);
    }

    var isBlob = typeof src !== 'string';
    var url = isBlob ? URL.createObjectURL(src) : src;
    var img = U.el('img', { class: 'crop-img', src: url, alt: opts.alt || 'תצוגה מקדימה' });
    var box = U.el('div', {
      class: 'crop-box' + (opts.shape === 'circle' ? ' crop-circle' : ''),
      tabindex: '0', role: 'application',
      'aria-label': opts.label || 'מיקום התצוגה המקדימה'
    }, img);

    var slider = opts.slider === false ? null : U.el('input', {
      type: 'range', min: '0', max: '100', step: '1', value: String(pos.y),
      class: 'crop-range', 'aria-label': opts.label || 'מיקום התצוגה המקדימה'
    });

    /* מחוון ההגדלה קיים גם כשמחוון המיקום כבוי. בעיגול אין ציר אחד
       שאפשר לתלות בו מחוון, אבל להגדלה יש תמיד בדיוק ציר אחד. */
    var zoomI = opts.zoom === false ? null : U.el('input', {
      type: 'range', min: '100', max: String(Math.round(MAXZ * 100)), step: '5',
      value: String(Math.round(zoom * 100)),
      class: 'crop-range', 'aria-label': 'הגדלת התצוגה'
    });
    var zoomRow = zoomI ? U.el('label', { class: 'crop-zoom' }, [
      U.el('span', { class: 'muted small', text: 'הגדלה' }), zoomI
    ]) : null;

    var hint = U.el('p', { class: 'crop-hint muted small', text: opts.hint || 'גרור כדי לבחור מה יוצג' });

    function paint() {
      UI.applyFocus(img, { x: pos.x, y: pos.y, z: zoom }, def);
      if (slider) slider.value = String(Math.round(pos.y));
      if (zoomI) zoomI.value = String(Math.round(zoom * 100));
    }

    /* מה שניתן להזזה משתנה עם ההגדלה, ולכן ההודעה והמחוונים נגזרים
       מחדש בכל שינוי ולא פעם אחת בטעינה. תמונה ריבועית בעיגול היא
       "אין מה להזיז" בהגדלה 1 — וברגע שמגדילים, יש. */
    function refresh() {
      paint();
      if (!loaded) return;
      var sx = slackAt('x'), sy = slackAt('y');
      var flat = sx <= 1 && sy <= 1;
      box.classList.toggle('crop-flat', flat);
      if (slider) slider.disabled = sy <= 1;

      if (flat) {
        hint.textContent = opts.flatHint ||
          'התמונה בדיוק בצורת המסגרת — אין מה להזיז.';
        if (zoomI) hint.textContent += ' הגדלה תפתח מקום לתזוזה.';
      } else if (sy <= 1) {
        hint.textContent = 'התמונה רחבה מהמסגרת ונחתכת לרוחב — אין מה להזיז לאורך.';
      } else {
        hint.textContent = opts.hint || 'גרור כדי לבחור מה יוצג';
      }
    }

    paint();

    img.addEventListener('load', function () {
      if (isBlob) URL.revokeObjectURL(url);
      /* הסרך בכל ציר: גודל התמונה כשהיא מכסה את המסגרת, פחות המסגרת.
         `cover` מותח לפי הציר הצר, ולכן רק אחד מהם יוצא חיובי. */
      boxSize.w = box.clientWidth || 1;
      boxSize.h = box.clientHeight || 1;
      var iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
      var scale = Math.max(boxSize.w / iw, boxSize.h / ih);
      slack.x = iw * scale - boxSize.w;
      slack.y = ih * scale - boxSize.h;
      loaded = true;
      refresh();
    });

    if (slider) {
      slider.addEventListener('input', function () {
        pos.y = Number(slider.value);
        paint();
      });
    }

    /* הגדלה סביב הנקודה שנבחרה, ולכן `pos` אינו זז איתה — מה שהיה
       במרכז המסגרת נשאר במרכז המסגרת. */
    if (zoomI) {
      zoomI.addEventListener('input', function () {
        zoom = clampZ(Number(zoomI.value) / 100);
        refresh();
      });
    }

    /* גרירה: האצבע מזיזה את **התמונה**. משיכה למעלה חושפת את מה שמתחת,
       כלומר מגדילה את האחוז. זו המוסכמה בכל בורר תמונה.

       בהגדלה z התמונה זזה על המסך פי z לכל אחוז, ולכן החלוקה היא בסרך
       המוגדל. בלי זה הגרירה הייתה מאיצה ככל שמגדילים ומאבדת את האצבע. */
    var pointers = {}, count = 0;
    var last = null, pinch = null;

    function move(dx, dy) {
      var sx = slackAt('x'), sy = slackAt('y');
      if (sx > 1) pos.x = clamp(pos.x - (dx / sx) * 100, pos.x);
      if (sy > 1) pos.y = clamp(pos.y - (dy / sy) * 100, pos.y);
      paint();
    }

    function two() {
      var ids = Object.keys(pointers);
      return ids.length >= 2 ? [pointers[ids[0]], pointers[ids[1]]] : null;
    }
    function spread(p) {
      return Math.sqrt(Math.pow(p[0].x - p[1].x, 2) + Math.pow(p[0].y - p[1].y, 2));
    }

    box.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      count++;
      box.classList.add('crop-drag');
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* לא חוסם */ }
      var p = two();
      if (p) { pinch = { d: spread(p) || 1, z: zoom }; last = null; }
      else { last = { x: e.clientX, y: e.clientY }; }
    });

    box.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      e.preventDefault();
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

      var p = two();
      if (pinch && p) {
        zoom = clampZ(pinch.z * (spread(p) / pinch.d));
        refresh();
        return;
      }
      if (!last) return;
      move(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    });

    function release(e) {
      if (!pointers[e.pointerId]) return;
      delete pointers[e.pointerId];
      count = Math.max(0, count - 1);
      if (count < 2) pinch = null;
      if (count === 0) { last = null; box.classList.remove('crop-drag'); }
      else {
        /* האצבע שנשארה ממשיכה לגרור מהמקום שבו היא נמצאת עכשיו, ולא
           מהמקום שבו הצביטה התחילה — אחרת התמונה קופצת בשחרור. */
        var ids = Object.keys(pointers);
        last = { x: pointers[ids[0]].x, y: pointers[ids[0]].y };
      }
    }
    box.addEventListener('pointerup', release);
    box.addEventListener('pointercancel', release);

    /* גלגלת במחשב — ההגדלה היחידה שיש לעכבר */
    box.addEventListener('wheel', function (e) {
      if (!zoomI) return;
      e.preventDefault();
      zoom = clampZ(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      refresh();
    }, { passive: false });

    /* מקשי החיצים — הדרך היחידה להגיע לזה בלי עכבר או מגע, ובעיגול
       גם הדרך היחידה להזיז לרוחב כשאין מחוון. פלוס ומינוס להגדלה,
       מאותה סיבה בדיוק. */
    var STEP = 4, ZSTEP = 0.1;
    box.addEventListener('keydown', function (e) {
      var dx = 0, dy = 0;
      if (e.key === 'ArrowUp') dy = -STEP;
      else if (e.key === 'ArrowDown') dy = STEP;
      else if (e.key === 'ArrowLeft') dx = -STEP;
      else if (e.key === 'ArrowRight') dx = STEP;
      else if (e.key === '+' || e.key === '=') {
        e.preventDefault(); zoom = clampZ(zoom + ZSTEP); refresh(); return;
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault(); zoom = clampZ(zoom - ZSTEP); refresh(); return;
      } else return;
      e.preventDefault();
      /* המקשים מזיזים את החלון, לא את התמונה — "למעלה" מראה מה שלמעלה */
      if (dy) pos.y = clamp(pos.y + dy, pos.y);
      if (dx) pos.x = clamp(pos.x + dx, pos.x);
      paint();
    });

    return {
      element: U.el('div', { class: 'crop' }, [box, slider, zoomRow, hint]),
      value: function () {
        return {
          x: Math.round(pos.x), y: Math.round(pos.y),
          /* שתי ספרות מספיקות למחוון בקפיצות של 5%, והן מה שנוסע
             בייצוא ובמיזוג — מספר ארוך שם הוא רעש. */
          z: Math.round(zoom * 100) / 100
        };
      }
    };
  };

  /* ---------- משטח זום ----------
     האפליקציה עצמה נעולה בקנה מידה אחד (`App.Zoom`), ולכן ההגדלה חייבת
     לחיות איפשהו — כאן, על המסמך בלבד.

     הזום משנה **רוחב** ולא `transform`. ל-transform אין השפעה על הפריסה,
     ולכן גלילה לתוך תמונה מוגדלת הייתה דורשת ריפוד מחושב; שינוי רוחב
     מגדיל את התוכן באמת, והגלילה של הדפדפן מטפלת בהזזה בחינם.

     `touch-action: none` על המשטח, ולכן שתי המחוות נכתבות כאן: אצבע
     אחת גוררת, שתיים מקרבות. הדפדפן לא ייקח אף אחת מהן לעצמו. */
  UI.zoomable = function (stage, inner) {
    var MIN = 1, MAX = 5;
    var scale = 1;
    var pts = {}, lastDist = 0, lastTap = 0, moved = 0;

    function apply(next, cx, cy) {
      next = Math.max(MIN, Math.min(MAX, next));
      if (Math.abs(next - scale) < 0.001) return;
      var r = stage.getBoundingClientRect();
      var px = (cx == null ? r.width / 2 : cx - r.left);
      var py = (cy == null ? r.height / 2 : cy - r.top);
      var ax = (stage.scrollLeft + px) / scale;
      var ay = (stage.scrollTop + py) / scale;

      scale = next;
      inner.style.width = (scale * 100) + '%';
      stage.classList.toggle('zoomed', scale > 1.001);

      stage.scrollLeft = ax * scale - px;
      stage.scrollTop = ay * scale - py;
    }

    function ids() { return Object.keys(pts); }
    function dist() {
      var k = ids();
      var a = pts[k[0]], b = pts[k[1]];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function mid() {
      var k = ids();
      var a = pts[k[0]], b = pts[k[1]];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    stage.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      moved = 0;
      if (ids().length === 2) lastDist = dist();
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* עכבר מחוץ למשטח */ }
    });

    stage.addEventListener('pointermove', function (e) {
      var p = pts[e.pointerId];
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);

      var n = ids().length;
      if (n >= 2) {
        var d = dist();
        if (lastDist > 0) {
          var m = mid();
          apply(scale * (d / lastDist), m.x, m.y);
        }
        lastDist = d;
        e.preventDefault();
        return;
      }
      /* גלילה באצבע אחת **בכל קנה מידה**, ולא רק כשמוגדל.

         `touch-action: none` על המשטח מבטל את הגלילה של הדפדפן, ולכן אם
         לא נגלול כאן — אף אחד לא יגלול. במסמך בן עמוד אחד זה לא נראה,
         ובמסמך רב-עמודים זה אומר שהעמוד הראשון הוא כל מה שיש. */
      var canX = stage.scrollWidth - stage.clientWidth > 1;
      var canY = stage.scrollHeight - stage.clientHeight > 1;
      if (canX || canY) {
        if (canX) stage.scrollLeft -= dx;
        if (canY) stage.scrollTop -= dy;
        e.preventDefault();
      }
    });

    function up(e) {
      delete pts[e.pointerId];
      if (ids().length < 2) lastDist = 0;
      if (ids().length) return;
      /* הקשה כפולה — שתי הקשות קצרות בלי תזוזה — מחליפה בין מלא למוגדל */
      if (moved < 10) {
        var now = Date.now();
        if (now - lastTap < 320) {
          apply(scale > 1.001 ? MIN : 2.5, e.clientX, e.clientY);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);

    stage.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      apply(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
    }, { passive: false });

    return {
      inc: function () { apply(scale * 1.4); },
      dec: function () { apply(scale / 1.4); },
      reset: function () { apply(MIN); },
      scale: function () { return scale; }
    };
  };

  /* ---------- צופה מסמכים ---------- */
  /* ported from Navigo: js/ui.js:viewer + renderPdf.
     PDF מרונדר ל-<canvas> דרך pdf.js מקומי, לא ב-iframe. `blob:` ב-iframe
     אינו אמין ב-iOS Safari, ו-<embed> מציג צופה מערכתי שאין עליו שליטה.
     canvas עובד זהה בכל פלטפורמה וגם אופליין — וזה מה שמצדיק את המשקל. */

  var PDF_OPTS = {
    standardFontDataUrl: 'lib/pdfjs/standard_fonts/',
    cMapUrl: 'lib/pdfjs/cmaps/',
    cMapPacked: true
  };

  var _pdfP = null;

  function loadPdfjs() {
    if (_pdfP) return _pdfP;
    _pdfP = new Promise(function (res, rej) {
      if (window.pdfjsLib) return res();
      var s = document.createElement('script');
      s.src = 'lib/pdfjs/pdf.min.js';
      s.onload = res;
      s.onerror = function () { rej(new Error('צופה ה-PDF לא נטען')); };
      document.head.appendChild(s);
    }).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js';
      return window.pdfjsLib;
    });
    _pdfP.catch(function () { _pdfP = null; });
    return _pdfP;
  }

  /* כמה עמודים מוחזקים מרונדרים בו-זמנית. canvas של A4 בצפיפות של טלפון
     הוא כמה מגה-בייט; מסמך של חמישים עמודים שכולם חיים מפיל את הדפדפן.
     זו הסיבה שהייתה כאן תקרה של 20 עמודים — והיא פתרה את הזיכרון על חשבון
     היכולת לראות את המסמך. */
  var PDF_LIVE = 6;

  /* מרנדר מסמך שלם, בלי תקרת עמודים.

     שני שלבים, וההפרדה ביניהם היא העיקר:
       א. לכל עמוד נוצר מקום ריק **במידות האמיתיות שלו**, מ-`getViewport`.
          בלי זה כל עמוד שמסיים רינדור משנה את גובה המסמך והגלילה קופצת
          תחת האצבע.
       ב. עמוד מרונדר רק כשהוא מתקרב למסך, ומשוחרר כשהוא מתרחק.

     `opts.root` הוא המשטח הנגלל (`.zoom-stage`) — בלעדיו ה-observer מודד
     מול חלון הדפדפן, וב-sheet שגולל בתוך עצמו זה אומר שהכל "נראה". */
  UI.renderPdf = function (blob, container, opts) {
    opts = opts || {};
    return loadPdfjs().then(function (lib) {
      return blob.arrayBuffer().then(function (data) {
        var o = { data: data };
        Object.keys(PDF_OPTS).forEach(function (k) { o[k] = PDF_OPTS[k]; });
        return lib.getDocument(o).promise;
      });
    }).then(function (pdf) {
      U.clear(container);
      var total = opts.limit ? Math.min(pdf.numPages, opts.limit) : pdf.numPages;
      var slots = new Array(total);
      var live = [], busy = {}, seen = {};

      function draw(n) {
        var el = slots[n - 1];
        if (!el || el.firstChild) return Promise.resolve();
        if (busy[n]) return busy[n];
        busy[n] = pdf.getPage(n).then(function (pg) {
          var base = pg.getViewport({ scale: 1 });
          var w = el.clientWidth || container.clientWidth || 360;
          /* צפיפות מוגבלת ל-2 גם במסך של 3x: ההבדל אינו נראה בקריאה,
             וההבדל בזיכרון הוא פי שניים ורבע לכל עמוד. */
          var vp = pg.getViewport({
            scale: (w / base.width) * Math.min(2, window.devicePixelRatio || 1)
          });
          var canvas = U.el('canvas');
          canvas.width = Math.round(vp.width);
          canvas.height = Math.round(vp.height);
          var ctx = canvas.getContext('2d');
          /* ported from Navigo — והשורה הזאת עלתה להם שעות: ההקשר יורש RTL
             מה-DOM, `fillText` מתעגן לצד ההפוך, ו-clip rects של ה-PDF חותכים
             אותיות. הסימפטום נראה כמו PDF פגום ולא כמו באג RTL. */
          ctx.direction = 'ltr';
          return pg.render({ canvasContext: ctx, viewport: vp }).promise
            .then(function () {
              U.clear(el).appendChild(canvas);
              live.push(n);
              release(n);
            });
        }).catch(function () { /* עמוד פגום לא מפיל את השאר */ })
          .then(function () { busy[n] = null; });
        return busy[n];
      }

      /* משחרר את העמוד הרחוק ביותר מזה שנצפה עכשיו. המקום נשאר, ולכן
         הגלילה אינה זזה, והעמוד יצויר שוב אם חוזרים אליו. */
      function release(near) {
        while (live.length > PDF_LIVE) {
          var far = -1, at = 0;
          live.forEach(function (n, idx) {
            var d = Math.abs(n - near);
            if (d > far) { far = d; at = idx; }
          });
          var drop = live.splice(at, 1)[0];
          if (slots[drop - 1]) U.clear(slots[drop - 1]);
        }
      }

      function report() {
        if (!opts.onPage) return;
        var vis = Object.keys(seen).filter(function (k) { return seen[k]; })
          .map(Number).sort(function (a, b) { return a - b; });
        if (vis.length) opts.onPage(vis[0], total);
      }

      /* שני משקיפים ולא אחד, כי לשתי השאלות יש תשובות שונות:

         "מה לצייר" רוצה שוליים נדיבים — עמוד שמצויר רק כשהוא כבר על המסך
         מגיע ריק תחת האצבע. "באיזה עמוד אני" רוצה בדיוק את המסך, ואותם
         שוליים היו אומרים שגם עמוד שגללנו הרחק מעליו עדיין "נראה". */
      var obs = null, eye = null;
      if (typeof IntersectionObserver === 'function') {
        obs = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            var n = Number(en.target.dataset.page);
            if (n && en.isIntersecting) draw(n);
          });
        }, { root: opts.root || null, rootMargin: '150% 0px' });

        eye = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            var n = Number(en.target.dataset.page);
            if (n) seen[n] = en.isIntersecting;
          });
          report();
        }, { root: opts.root || null });
      }

      var chain = Promise.resolve();
      for (var n = 1; n <= total; n++) chain = chain.then(place(n));

      function place(n) {
        return function () {
          return pdf.getPage(n).then(function (pg) {
            var vp = pg.getViewport({ scale: 1 });
            var el = U.el('div', { class: 'pdf-page', dataset: { page: String(n) } });
            el.style.aspectRatio = vp.width + ' / ' + vp.height;
            slots[n - 1] = el;
            container.appendChild(el);
            if (obs) { obs.observe(el); eye.observe(el); }
            /* בלי IntersectionObserver — הראשונים נצבעים מיד, וכל השאר
               נשארים כמקום שמור. עדיף מסמך שנגלל מאשר דפדפן שנופל. */
            else if (n <= PDF_LIVE) draw(n);
          });
        };
      }

      /* ההבטחה נפתרת כשיש **מה לראות**, ולא כשיש מקום שמור. עמוד ראשון
         מצויר במפורש ולא דרך המשקיף: מיכל בגובה אפס לא יפעיל אותו לעולם,
         והקורא היה מקבל מסמך ריק בלי שגיאה. */
      return chain.then(function () {
        if (opts.onPage) opts.onPage(1, total);
        return total ? draw(1) : null;
      }).then(function () { return { pages: total }; });
    }).catch(function (e) {
      U.clear(container).appendChild(UI.empty({
        icon: 'i-file', title: 'לא הצלחתי לפתוח את ה-PDF',
        sub: (e && e.message) || ''
      }));
    });
  };

  /* כל blob: URL שנוצר נרשם ומבוטל בסגירה. בנאביגו זו דליפה מוכרת —
     `close()` מנקה את ה-DOM ולא מבטל את ה-URL, והזיכרון נשאר תפוס. */
  UI.viewer = function (blobRec, name) {
    var urls = [];
    function objectUrl(b) { var u = URL.createObjectURL(b); urls.push(u); return u; }

    var inner = U.el('div', { class: 'zoom-inner' });
    var stage = U.el('div', { class: 'zoom-stage' }, inner);
    var body = U.el('div', { class: 'viewer' }, stage);

    var s = UI.sheet(name || 'מסמך', body, {
      onClose: function () {
        urls.forEach(function (u) { URL.revokeObjectURL(u); });
        urls = [];
      }
    });
    s.panel.classList.add('sheet-full');

    /* הרמז מתחלף במונה עמודים ברגע שידוע שיש יותר מאחד — באותו מקום,
       כי מסמך רב-עמודים צריך לומר קודם כל כמה עמודים יש בו. */
    var hint = U.el('span', { class: 'viewer-hint', text: 'צביטה או הקשה כפולה' });

    if (blobRec.mime === 'application/pdf') {
      inner.appendChild(U.el('p', { class: 'muted small', text: 'טוען…' }));
      UI.renderPdf(blobRec.data, inner, {
        root: stage,
        onPage: function (n, total) {
          hint.textContent = total > 1
            ? 'עמוד ' + n + ' מתוך ' + total
            : 'צביטה או הקשה כפולה';
        }
      });
    } else {
      inner.appendChild(U.el('img', {
        class: 'viewer-img', src: objectUrl(blobRec.data), alt: name || 'צילום המסמך'
      }));
    }

    var zoom = UI.zoomable(stage, inner);
    body.appendChild(U.el('div', { class: 'viewer-bar' }, [
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'הקטנה',
        onClick: function () { zoom.dec(); }
      }, U.icon('i-zoom-out', 22)),
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'הגדלה',
        onClick: function () { zoom.inc(); }
      }, U.icon('i-zoom-in', 22)),
      hint,
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'שיתוף',
        onClick: function () {
          window.Share.file(blobRec.data, name, blobRec.mime).then(function (mode) {
            if (mode === 'download') UI.toast('הקובץ הורד');
          });
        }
      }, U.icon('i-share', 22))
    ]));

    s.zoom = zoom;
    return s;
  };

  window.UI = UI;
})();
