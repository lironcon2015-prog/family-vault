/* screens.js — ששת המסכים. */
(function () {
  'use strict';

  var U = window.U, UI = window.UI, DB = window.DB, DT = window.DOC_TYPES,
      KINDS = window.KINDS, E = window.Expiry, S = window.Settings,
      C = window.CONFIG, Search = window.Search, Forms = window.Forms,
      Files = window.Files, Vault = window.Vault, V = window.Versions,
      Share = window.Share;

  var Screens = {};
  /* `docs` הוא הכל, `live` הוא הגרסאות הנוכחיות בלבד. כל מסך שמציג
     נתונים או שדות קורא `live` — מסמך שנדחקה גרסתו אינו מקור לפרטים,
     אינו נספר בתפוגות ואינו מופיע בהעתקה המהירה. SPEC §6.6 */
  var state = { entities: [], docs: [], live: [], byId: {} };

  Screens.state = state;

  Screens.reload = function () {
    return Promise.all([DB.listEntities(), DB.listDocs()]).then(function (r) {
      state.entities = r[0];
      state.docs = r[1];
      state.live = V.live(r[1]);
      state.byId = {};
      state.entities.forEach(function (e) { state.byId[e.id] = e; });
      return state;
    });
  };

  function head(title, actions) {
    return U.el('div', { class: 'scr-head' }, [
      U.el('h1', { class: 'scr-title', text: title }),
      actions ? U.el('div', { class: 'scr-actions' }, actions) : null
    ]);
  }

  /* `parent` הוא ההורה הלוגי של המסך. ברוב הפעמים ההיסטוריה כבר מכילה
     אותו והכפתור פשוט חוזר; הוא נדרש כשאין היסטוריה בכלל — קישור שנפתח
     ישירות — ואז "חזור" שמוציא מהאפליקציה הוא לא מה שהמשתמש ביקש. */
  function backHead(title, actions, parent) {
    return U.el('div', { class: 'scr-head' }, [
      U.el('button', {
        class: 'iconbtn i-flip', type: 'button', 'aria-label': 'חזרה',
        onClick: function () { window.App.back(parent); }
      }, U.icon('i-back', 22)),
      U.el('h1', { class: 'scr-title', text: title }),
      actions ? U.el('div', { class: 'scr-actions' }, actions) : null
    ]);
  }

  function docSub(doc) {
    var e = state.byId[doc.entityId];
    return (e ? e.name : 'ללא ישות') + ' · ' + DT.label(doc.typeKey);
  }

  function docCard(item) {
    var doc = item.doc;
    var ent = state.byId[doc.entityId];
    var card = U.el('button', { class: 'card', type: 'button' }, [
      UI.avatar(ent),
      U.el('span', { class: 'card-b' }, [
        U.el('span', { class: 'card-t', text: doc.title }),
        U.el('span', { class: 'card-s', text: ent ? ent.name : '' })
      ]),
      UI.chip(item.bucket, E.label(item.days, doc.expiryDate))
    ]);
    card.addEventListener('click', function () { location.hash = '#/doc/' + doc.id; });
    return card;
  }

  /* ---------- מסך הבית: תפוגות ---------- */

  Screens.expiries = function () {
    var home = C.HOME === 'expiries';
    var wrap = U.el('div', { class: 'scr' }, head(home ? C.APP_NAME : 'תפוגות'));
    var grouped = E.group(state.live);
    var total = grouped.past.length + grouped.d30.length + grouped.d90.length + grouped.ok.length;

    if (home) {
      var notice = Screens.noticeBanner(grouped);
      if (notice) wrap.appendChild(notice);
    }

    if (!state.docs.length) {
      wrap.appendChild(UI.empty({
        icon: 'i-folder',
        title: 'עוד אין כאן מסמכים',
        sub: 'צלם תעודה, הדבק מהלוח, או גרור קובץ לכאן',
        action: 'הוספת מסמך',
        onAction: function () { Screens.addSheet(); }
      }));
      return wrap;
    }

    if (!total) {
      wrap.appendChild(UI.empty({
        icon: 'i-calendar',
        title: 'אין מסמכים עם תאריך תפוגה',
        sub: 'מסמך מקבל מקום כאן ברגע שיש לו תאריך',
        action: 'למסמכים',
        onAction: function () { location.hash = '#/entities'; }
      }));
      return wrap;
    }

    ['past', 'd30', 'd90'].forEach(function (key) {
      var items = grouped[key];
      if (!items.length) return;
      var meta = E.BUCKETS.filter(function (b) { return b.key === key; })[0];
      wrap.appendChild(U.el('div', { class: 'bucket-h', text: meta.label }));
      items.forEach(function (it) { wrap.appendChild(docCard(it)); });
    });

    /* "תקין" מקופל. מסך הבית מציג בעיות. DEC-05 */
    if (grouped.ok.length) {
      var open = false;
      var list = U.el('div');
      var fold = U.el('button', { class: 'fold', type: 'button', 'aria-expanded': 'false' }, [
        U.el('span', { text: 'תקין · ' + U.count(grouped.ok.length, 'מסמך אחד', 'מסמכים') }),
        U.icon('i-chevron', 18)
      ]);
      fold.addEventListener('click', function () {
        open = !open;
        fold.setAttribute('aria-expanded', String(open));
        fold.classList.toggle('open', open);
        U.clear(list);
        if (open) grouped.ok.forEach(function (it) { list.appendChild(docCard(it)); });
      });
      wrap.appendChild(fold);
      wrap.appendChild(list);
    }

    return wrap;
  };

  /* באנר פעם ביום למכשיר. אין push, ואין הבטחה שיש. SPEC §6.5

     הדחייה נזכרת לפי **מה** נדחה ולא רק לפי מתי: החתימה היא רשימת
     המסמכים הדורשים טיפול ותאריכי התפוגה שלהם. מסמך שטופל יוצא מהחתימה,
     ולכן הבאנר הבא כבר לא סופר אותו; מסמך חדש שנכנס מחזיר את הבאנר
     גם באותו יום. באנר שנשאר אחרי הטיפול הוא באנר שמאמן להתעלם ממנו.

     הבאנר עצמו לחיץ — מסמך אחד לוקח אליו, כמה לוקחים לרשימה. */
  Screens.noticeSignature = function (grouped) {
    return E.notifiable(grouped).map(function (it) {
      return it.doc.id + '@' + (it.doc.expiryDate || '');
    }).sort().join(',');
  };

  Screens.noticeBanner = function (grouped) {
    if (!E.needsNotice(grouped)) return null;
    var today = U.todayYmd();
    var sig = Screens.noticeSignature(grouped);
    if (S.get(C.K.lastNoticeDay) === today && S.get(C.K.lastNoticeSig) === sig) return null;

    var items = E.notifiable(grouped);
    var bar = U.el('div', { class: 'notice' });
    var go = U.el('button', { class: 'notice-go', type: 'button' }, [
      U.icon('i-bell', 20),
      U.el('span', { text: U.count(items.length, 'מסמך אחד דורש טיפול', 'מסמכים דורשים טיפול') })
    ]);
    go.addEventListener('click', function () {
      location.hash = items.length === 1 ? '#/doc/' + items[0].doc.id : '#/expiries';
    });
    var x = U.el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'סגירה' },
      U.icon('i-x', 18));
    x.addEventListener('click', function () {
      S.set(C.K.lastNoticeDay, today).then(function () {
        return S.set(C.K.lastNoticeSig, sig);
      });
      bar.remove();
    });
    U.add(bar, [go, x]);
    return bar;
  };

  /* ---------- העתקה מהירה ---------- */

  Screens.quick = function () {
    var wrap = U.el('div', { class: 'scr' }, head('העתקה מהירה'));
    var rows = Search.rows(state.live, state.byId);

    var input = U.el('input', {
      class: 'search-i', type: 'search', inputmode: 'search',
      placeholder: 'חיפוש בכל השדות', 'aria-label': 'חיפוש בכל השדות'
    });
    wrap.appendChild(U.el('div', { class: 'search' }, [U.icon('i-search'), input]));

    var results = U.el('div');
    wrap.appendChild(results);

    function renderRows(list, heading) {
      U.clear(results);
      if (heading) results.appendChild(U.el('div', { class: 'bucket-h', text: heading }));
      if (!list.length) {
        results.appendChild(U.el('p', { class: 'muted', text: 'אין תוצאות' }));
        return;
      }
      results.appendChild(UI.rowsCard(list.map(function (r) {
        return UI.fieldRow(r.field, {
          sub: docSub(r.doc),
          onCopy: function () { S.pushRecent(r.doc.id, r.field.key); }
        });
      })));
    }

    /* מסך ריק בפתיחה הוא כישלון — הוא נפתח כשמישהו מחכה. SPEC §8.2 */
    function showRecent() {
      var rec = Search.recent(rows, S.get(C.K.recentFields));
      if (rec.length) { renderRows(rec, 'אחרונים'); return; }
      U.clear(results);
      results.appendChild(UI.empty({
        icon: 'i-search',
        title: state.docs.length ? 'הקלד כדי לחפש' : 'עוד אין מה להעתיק',
        sub: state.docs.length
          ? 'החיפוש עובר על כל השדות של כל המסמכים'
          : 'הוסף מסמך ראשון והשדות שלו יופיעו כאן',
        action: state.docs.length ? null : 'הוספת מסמך',
        onAction: function () { Screens.addSheet(); }
      }));
    }

    showRecent();
    input.addEventListener('input', U.debounce(function () {
      var q = input.value.trim();
      if (!q) { showRecent(); return; }
      renderRows(Search.query(rows, q));
    }, 90));

    setTimeout(function () { input.focus(); }, 60);
    return wrap;
  };

  /* ---------- ישויות ---------- */

  /* ---------- מסך הבית ----------
     המסך מציג תמונות, ולכן התמונה היא שקובעת את הפריסה ולא ההפך: פנים
     מזוהות בעיגול, ורכב או דירה בפס רחב. `CONFIG.ENTITY_GROUPS` הוא
     שקובע מי מוצג איך, ואין כאן שם של סוג ישות אחד. DEC-39 */
  Screens.entities = function () {
    var home = C.HOME === 'entities';
    var wrap = U.el('div', { class: 'scr scr-home' });

    if (!state.entities.length) {
      wrap.appendChild(head(home ? C.APP_NAME : 'ישויות', [
        U.el('button', {
          class: 'iconbtn', type: 'button', 'aria-label': 'ישות חדשה',
          onClick: function () { Screens.entitySheet(null); }
        }, U.icon('i-plus', 22))
      ]));
      wrap.appendChild(UI.empty({
        icon: 'i-users',
        title: 'עוד אין ישויות',
        sub: 'ישות היא אדם, רכב או בית שהמסמכים נתלים עליו',
        action: 'יצירת ישות',
        onAction: function () { Screens.entitySheet(null); }
      }));
      return wrap;
    }

    /* ---------- המסד ----------
       הסימן הוא הפעם היחידה שהאקסנט מופיע בראש המסך, ושורת המצב מחליפה
       את הבאנר: היא אומרת את אותו דבר בשורה אחת, ולוחצים עליה. */
    var grouped = E.group(state.live);
    var flagged = E.notifiable(grouped).length;

    var status = U.el('div', { class: 'mast-s' }, [
      U.el('span', { class: 'quiet', text: U.count(state.live.length, 'מסמך אחד', 'מסמכים') })
    ]);
    if (flagged) {
      status.appendChild(U.el('span', { class: 'sep', text: '·' }));
      status.appendChild(U.el('button', {
        class: 'mast-flag', type: 'button',
        onClick: function () { location.hash = '#/expiries'; }
      }, [
        U.el('i'),
        U.el('span', { text: flagged === 1 ? 'אחד דורש טיפול' : flagged + ' דורשים טיפול' })
      ]));
    }

    wrap.appendChild(U.el('div', { class: 'mast' }, [
      U.el('span', { class: 'mast-tile' }, U.icon('i-case', 25)),
      U.el('div', { class: 'mast-b' }, [
        U.el('h1', { class: 'mast-t scr-title', text: home ? C.APP_NAME : 'ישויות' }),
        status
      ]),
      U.el('div', { class: 'scr-actions' }, [
        U.el('button', {
          class: 'iconbtn', type: 'button', 'aria-label': 'ישות חדשה',
          onClick: function () { Screens.entitySheet(null); }
        }, U.icon('i-plus', 21)),
        U.el('button', {
          class: 'iconbtn', type: 'button', 'aria-label': 'עוזר',
          onClick: function () { location.hash = '#/chat'; }
        }, U.icon('i-chat', 21))
      ])
    ]));

    /* השדה העליון. אלמנט אחד, מאחורי התוכן, ובלי שום תפקיד מלבד עומק. */
    wrap.appendChild(U.el('div', { class: 'home-field', 'aria-hidden': 'true' }));

    /* ---------- הקבוצות ----------
       הסדר בין הקבוצות ובין הסוגים בתוכן נגזר מהטבלאות. בתוך קבוצה
       הסדר הוא `sortOrder`, וגרירה כותבת אותו מחדש — בדיוק כמו קודם. */
    C.ENTITY_GROUPS.forEach(function (grp) {
      var types = C.ENTITY_TYPES.filter(function (t) { return t.group === grp.key; });
      var mine = [];
      types.forEach(function (t) {
        state.entities.filter(function (e) { return e.type === t.key; })
          .forEach(function (e) { mine.push(e); });
      });
      if (!mine.length) return;

      /* התווית נבנית מהסוגים שיש להם ישויות בפועל */
      var label = types.filter(function (t) {
        return mine.some(function (e) { return e.type === t.key; });
      }).map(function (t) { return t.label; });

      wrap.appendChild(U.el('div', { class: 'grp-h' }, [
        U.el('b', { text: label.length > 1
          ? label.slice(0, -1).join(', ') + ' ו' + label[label.length - 1]
          : label[0] }),
        U.el('em', { text: String(mine.length) })
      ]));

      var box = U.el('div', {
        class: 'egroup ' + grp.layout,
        dataset: { type: types[0].key, layout: grp.layout }
      });
      mine.forEach(function (e) { box.appendChild(Screens.entityTile(e, grp.layout)); });

      if (grp.layout === 'rail') {
        box.appendChild(U.el('button', {
          class: 'ptile-add', type: 'button', 'aria-label': 'ישות חדשה',
          onClick: function () { Screens.entitySheet(null); }
        }, U.icon('i-plus', 22)));
      }

      UI.reorder(box, {
        itemSelector: '.ecard',
        axis: grp.layout === 'rail' ? 'x' : 'grid',
        onDrop: function (els) { Screens.saveOrder(els); }
      });
      wrap.appendChild(box);
    });

    wrap.appendChild(U.el('p', { class: 'muted small', text:
      'לחיצה ארוכה על ישות וגרירה משנה את סדר התצוגה בתוך הקבוצה.' }));

    return wrap;
  };

  /* אריח ישות. שתי פריסות, ואותה רשומה מזינה את שתיהן. */
  Screens.entityTile = function (e, layout) {
    var mine = state.live.filter(function (d) { return d.entityId === e.id; });
    var next = E.next(mine);
    var urgent = next && next.bucket !== 'ok';
    var meta = U.count(mine.length, 'מסמך אחד', 'מסמכים');

    var card = U.el('button', {
      class: 'card ecard ' + (layout === 'rail' ? 'ptile' : 'atile'),
      type: 'button', dataset: { id: e.id }
    });

    if (layout === 'rail') {
      card.appendChild(UI.avatar(e, 64, urgent ? next.bucket : null));
      card.appendChild(U.el('span', { class: 'card-b' }, [
        U.el('span', { class: 'card-t', text: e.name }),
        urgent
          ? U.el('span', { class: 'card-s' },
              UI.chip(next.bucket, E.shortLabel(next.days)))
          : U.el('span', { class: 'card-s', text: next ? 'הכל בתוקף' : meta })
      ]));
      card.addEventListener('click', function () { location.hash = '#/entity/' + e.id; });
      return card;
    }

    /* לוח: התמונה היא הפנים של האריח, והצ׳יפ יושב עליה מתחת לצעיף */
    var kind = C.ENTITY_TYPES.filter(function (t) { return t.key === e.type; })[0];
    var band = U.el('span', { class: 'atile-img' }, UI.avatarImage(e));
    band.appendChild(U.el('span', { class: 'atile-k', text: kind ? kind.label : '' }));
    if (urgent) {
      band.appendChild(U.el('span', { class: 'atile-veil' }));
      band.appendChild(U.el('span', { class: 'atile-c' },
        UI.chip(next.bucket, E.shortLabel(next.days))));
    }
    card.appendChild(band);
    card.appendChild(U.el('span', { class: 'card-b' }, [
      U.el('span', { class: 'card-t', text: e.name }),
      U.el('span', { class: 'card-s', text: urgent
        ? next.doc.title + ' · ' + meta
        : meta + (next ? ' · הכל בתוקף' : '') })
    ]));
    card.addEventListener('click', function () { location.hash = '#/entity/' + e.id; });
    return card;
  };

  Screens.saveOrder = function (els) {
    var ids = els.map(function (el) { return el.dataset.id; });
    var wrote = 0;
    return Promise.all(ids.map(function (id, i) {
      var e = state.byId[id];
      if (!e || e.sortOrder === (i + 1) * 1000) return null;
      e.sortOrder = (i + 1) * 1000;
      wrote++;
      return DB.saveEntity(e);
    })).then(function () {
      if (wrote) UI.toast('הסדר נשמר');
      return Screens.reload();
    });
  };

  Screens.entity = function (id) {
    var e = state.byId[id];
    if (!e) return Screens.missing('הישות לא נמצאה');

    var wrap = U.el('div', { class: 'scr' }, backHead(e.name, [
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'עריכת ישות',
        onClick: function () { Screens.entitySheet(e); }
      }, U.icon('i-edit', 22))
    ], '#/entities'));

    var all = state.docs.filter(function (d) { return d.entityId === id; });
    if (!all.length) {
      wrap.appendChild(UI.empty({
        icon: 'i-folder',
        title: 'אין מסמכים ל' + e.name,
        sub: 'צלם תעודה, הדבק מהלוח, או גרור קובץ לכאן',
        action: 'הוספת מסמך',
        onAction: function () { Screens.addSheet(id); }
      }));
      return wrap;
    }

    var mine = state.live.filter(function (d) { return d.entityId === id; });
    var old = all.filter(function (d) { return V.isSuperseded(d, state.docs); });

    /* ברירת המחדל היא האחרון שנגעו בו קודם. גרירה כותבת `sortOrder`
       לכל הרשימה, ומאז הסדר הוא של המשתמש — אותו כלל כמו בישויות. */
    mine.sort(Screens.docOrder);
    var dbox = U.el('div', { class: 'dgroup' });
    mine.forEach(function (doc) { dbox.appendChild(Screens.docTypeCard(doc)); });
    UI.reorder(dbox, {
      itemSelector: '.dcard',
      onDrop: function (els) { Screens.saveDocOrder(els); }
    });
    wrap.appendChild(dbox);
    if (mine.length > 1) {
      wrap.appendChild(U.el('p', { class: 'muted small', text:
        'לחיצה ארוכה על מסמך וגרירה משנה את סדר התצוגה.' }));
    }

    /* גרסאות שנדחקו נשמרות ומוצגות מקופלות. "המסמך הקודם יישמר במערכת,
       אבל המסמך המוצג הוא תמיד העדכני" — שתי המחציות של אותו משפט. */
    if (old.length) {
      var open = false;
      var list = U.el('div');
      var fold = U.el('button', { class: 'fold', type: 'button', 'aria-expanded': 'false' }, [
        U.el('span', { text: 'גרסאות קודמות · ' + U.count(old.length, 'מסמך אחד', 'מסמכים') }),
        U.icon('i-chevron', 18)
      ]);
      fold.addEventListener('click', function () {
        open = !open;
        fold.setAttribute('aria-expanded', String(open));
        fold.classList.toggle('open', open);
        U.clear(list);
        if (open) old.forEach(function (d) { list.appendChild(Screens.docTypeCard(d, true)); });
      });
      wrap.appendChild(fold);
      wrap.appendChild(list);
    }

    return wrap;
  };

  /* סדר המסמכים בתוך ישות. `sortOrder` כשיש, ואחרת האחרון שנגעו בו —
       כך מי שלא גרר מעולם רואה בדיוק את מה שראה תמיד. */
  Screens.docOrder = function (a, b) {
    var sa = a.sortOrder == null ? Infinity : a.sortOrder;
    var sb = b.sortOrder == null ? Infinity : b.sortOrder;
    return (sa - sb) || ((b.updatedAt || 0) - (a.updatedAt || 0));
  };

  Screens.saveDocOrder = function (els) {
    var ids = els.map(function (el) { return el.dataset.id; });
    var wrote = 0;
    return Promise.all(ids.map(function (id, i) {
      var doc = state.docs.filter(function (d) { return d.id === id; })[0];
      if (!doc || doc.sortOrder === (i + 1) * 1000) return null;
      doc.sortOrder = (i + 1) * 1000;
      wrote++;
      return DB.saveDoc(doc, []);
    })).then(function () {
      if (wrote) UI.toast('הסדר נשמר');
      return Screens.reload();
    });
  };

  Screens.docTypeCard = function (doc, faded) {
    var days = doc.expiryDate ? E.daysLeft(doc.expiryDate) : null;
    var bucket = E.bucket(days);
    var card = U.el('button', {
      class: 'card dcard' + (faded ? ' card-old' : ''), type: 'button',
      dataset: { id: doc.id }
    }, [
      U.el('span', { class: 'card-ic' }, U.icon(DT.icon(doc.typeKey), 22)),
      U.el('span', { class: 'card-b' }, [
        U.el('span', { class: 'card-t', text: doc.title }),
        U.el('span', { class: 'card-s', text: DT.label(doc.typeKey) })
      ]),
      (bucket && !faded) ? UI.chip(bucket, E.label(days, doc.expiryDate)) : null,
      faded ? U.el('span', { class: 'chip ok', text: 'גרסה קודמת' }) : null,
      faded ? null : U.el('span', { class: 'card-grip', 'aria-hidden': 'true' }, U.icon('i-grip', 18))
    ]);
    card.addEventListener('click', function () { location.hash = '#/doc/' + doc.id; });
    return card;
  };

  /* ---------- כרטיס מסמך ---------- */

  Screens.doc = function (id) {
    var doc = state.docs.filter(function (d) { return d.id === id; })[0];
    if (!doc) return Screens.missing('המסמך לא נמצא');

    var t = DT.get(doc.typeKey);
    var wrap = U.el('div', { class: 'scr scr-flush' }, backHead(doc.title, [
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'שיתוף',
        onClick: function () { Screens.shareSheet(doc); }
      }, U.icon('i-share', 22)),
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'עריכת מסמך',
        onClick: function () { location.hash = '#/doc/' + id + '/edit'; }
      }, U.icon('i-edit', 22))
    ], '#/entity/' + doc.entityId));

    var body = U.el('div', { class: 'scr-body' });
    wrap.appendChild(body);

    /* ---------- שתי הודעות הגרסה ---------- */
    var successor = V.successor(doc, state.docs);
    if (successor) {
      var toNew = U.el('button', { class: 'notice notice-warn notice-go', type: 'button' }, [
        U.icon('i-history', 20),
        U.el('span', { text: 'זו גרסה קודמת. הגרסה העדכנית היא ' + successor.title + '.' })
      ]);
      toNew.addEventListener('click', function () { location.hash = '#/doc/' + successor.id; });
      body.appendChild(toNew);
    }
    var prev = V.previous(doc, state.docs);

    /* עוגן ויזואלי. מסמך ללא קובץ מקבל פס אקסנט-רך, לא placeholder אפור */
    var headCard = U.el('div', { class: 'doc-head' });
    body.appendChild(headCard);

    if (doc.files && doc.files.length) {
      var first = doc.files[0];
      DB.blob(first.blobId).then(function (rec) {
        if (!rec) return;
        if (rec.mime === 'application/pdf') {
          /* עמוד ראשון כתצוגה מקדימה — עוגן ויזואלי אמיתי במקום אייקון אפור */
          var box = U.el('div', { class: 'anchor anchor-pdf' });
          headCard.insertBefore(box, headCard.firstChild);
          UI.renderPdf(rec.data, box, { limit: 1 });
          box.addEventListener('click', function () { UI.viewer(rec, first.name); });
        } else {
          var url = URL.createObjectURL(rec.data);
          var img = U.el('img', { class: 'anchor', src: url, alt: 'צילום המסמך' });
          /* המסגרת שהמשתמש בחר בעריכה — מיקום והגדלה. ברירת המחדל היא
             ראש התמונה בלי הגדלה, וזה בדיוק מה שמסמך ישן כבר נראה. */
          UI.applyFocus(img, { x: first.focusX, y: first.focusY, z: first.focusZ },
            { x: 50, y: 0 });
          img.addEventListener('load', function () { URL.revokeObjectURL(url); });
          var anchorWrap = U.el('span', { class: 'anchor-wrap' }, img);
          anchorWrap.addEventListener('click', function () { UI.viewer(rec, first.name); });
          headCard.insertBefore(anchorWrap, headCard.firstChild);
        }
      });
    } else {
      headCard.appendChild(U.el('div', { class: 'anchor-none' }));
    }

    var days = doc.expiryDate ? E.daysLeft(doc.expiryDate) : null;
    headCard.appendChild(U.el('div', { class: 'doc-meta' }, [
      U.el('div', {}, [
        U.el('div', { class: 'card-t', text: DT.label(doc.typeKey) }),
        U.el('div', { class: 'card-s', text: (state.byId[doc.entityId] || {}).name || '' })
      ]),
      days != null ? UI.chip(E.bucket(days), E.label(days, doc.expiryDate)) : null
    ]));

    /* שורות שדה + שורות התאריך הסינתטיות */
    var rows = (doc.fields || []).map(function (f) {
      return UI.fieldRow(f, { onCopy: function () { S.pushRecent(doc.id, f.key); } });
    });
    if (doc.issueDate) {
      rows.push(UI.fieldRow(
        { key: '__issue', label: 'תאריך הנפקה', value: doc.issueDate, kind: 'date', verified: true },
        { onCopy: function () { S.pushRecent(doc.id, '__issue'); } }));
    }
    if (doc.expiryDate) {
      rows.push(UI.fieldRow(
        { key: '__expiry', label: 'בתוקף עד', value: doc.expiryDate, kind: 'date', verified: true },
        { onCopy: function () { S.pushRecent(doc.id, '__expiry'); } }));
    }
    if (rows.length) body.appendChild(UI.rowsCard(rows));

    if (doc.notes) {
      body.appendChild(U.el('div', { class: 'notes' }, [
        U.el('div', { class: 'notes-l', text: 'הערות' }),
        U.el('div', { text: doc.notes })
      ]));
    }

    /* קבצים */
    if (t && t.allowFiles) {
      body.appendChild(Screens.filesBlock(doc));
    } else {
      body.appendChild(U.el('p', { class: 'muted small', text:
        'לסוג הזה לא נשמרות סריקות. מקור האמת לצילום נמצא בנאביגו.' }));
    }

    if (prev.length) {
      var pbox = U.el('div', { class: 'files' },
        U.el('div', { class: 'files-h', text: 'גרסאות קודמות' }));
      prev.forEach(function (p) {
        var row = U.el('div', { class: 'file-row' }, [
          U.icon('i-history', 20),
          U.el('span', { class: 'file-n', text: p.title }),
          U.el('span', { class: 'file-s' },
            U.bidi(p.expiryDate ? KINDS.get('date').format(p.expiryDate) : ''))
        ]);
        row.addEventListener('click', function () { location.hash = '#/doc/' + p.id; });
        pbox.appendChild(row);
      });
      body.appendChild(pbox);
    }

    body.appendChild(U.el('button', {
      class: 'btn ghost danger wide', type: 'button',
      onClick: function () {
        UI.confirm({
          title: 'מחיקת מסמך',
          body: 'המסמך והקבצים שלו יימחקו. אי אפשר לבטל.',
          ok: 'מחיקה', danger: true
        }).then(function (yes) {
          if (!yes) return;
          DB.deleteDoc(doc.id).then(function () {
            UI.toast('המסמך נמחק');
            /* מסמך מחוק אינו יעד לחזרה. הרשומה שלו מוחלפת, אחרת "חזור"
               היה מציג "המסמך לא נמצא" למי שרק מחק אותו. */
            window.App.swap('#/entity/' + doc.entityId);
          });
        });
      }
    }, 'מחיקת מסמך'));

    return wrap;
  };

  Screens.filesBlock = function (doc) {
    var box = U.el('div', { class: 'files' }, U.el('div', { class: 'files-h', text: 'קבצים' }));
    (doc.files || []).forEach(function (f) {
      var row = U.el('div', { class: 'file-row' }, [
        U.icon(f.mime === 'application/pdf' ? 'i-file' : 'i-image', 20),
        U.el('span', { class: 'file-n', text: f.name }),
        U.el('span', { class: 'file-s' }, U.bidi(U.bytes(f.size)))
      ]);
      row.addEventListener('click', function () {
        DB.blob(f.blobId).then(function (rec) { if (rec) UI.viewer(rec, f.name); });
      });

      function act(label, icon, fn) {
        var b = U.el('button', { class: 'iconbtn', type: 'button', 'aria-label': label },
          U.icon(icon, 18));
        b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
        row.appendChild(b);
      }

      act('שיתוף הקובץ', 'i-share', function () {
        DB.blob(f.blobId).then(function (rec) {
          if (!rec) { UI.toast('הקובץ לא נמצא'); return; }
          return Share.file(rec.data, f.name, f.mime).then(function (mode) {
            if (mode === 'download') UI.toast('הקובץ הורד');
          });
        });
      });

      act('שינוי שם הקובץ', 'i-rename', function () {
        UI.prompt({
          title: 'שינוי שם הקובץ', label: 'שם', value: f.name,
          empty: 'צריך שם לקובץ'
        }).then(function (name) {
          if (name == null || name === f.name) return;
          return DB.renameFile(doc, f.blobId, name).then(function () {
            UI.toast('השם שונה');
            window.App.render();
          });
        });
      });

      act('הסרת קובץ', 'i-trash', function () {
        UI.confirm({ title: 'הסרת קובץ', body: f.name, ok: 'הסרה', danger: true })
          .then(function (yes) {
            if (!yes) return;
            DB.removeFile(doc, f.blobId).then(function () {
              UI.toast('הקובץ הוסר');
              window.App.render();
            });
          });
      });

      box.appendChild(row);
    });

    var add = U.el('button', { class: 'btn ghost wide', type: 'button' }, 'הוספת קובץ');
    add.addEventListener('click', function () { window.App.pickFiles(doc); });
    box.appendChild(add);
    return box;
  };

  /* ---------- ייצוא ----------
     שני דברים שונים לגמרי יוצאים מכאן: הקובץ עצמו, ופרטי המסמך כטקסט.
     הבחירה מפורשת, כי שליחת צילום של תעודת זהות בוואטסאפ אינה אותה
     פעולה כמו שליחת מספר הפוליסה. */
  Screens.shareSheet = function (doc) {
    var files = doc.files || [];

    function lines() {
      var out = [doc.title, DT.label(doc.typeKey)];
      var ent = state.byId[doc.entityId];
      if (ent) out.push(ent.name);
      out.push('');
      (doc.fields || []).forEach(function (f) {
        out.push(f.label + ': ' + KINDS.copyValue(f));
      });
      if (doc.issueDate) out.push('תאריך הנפקה: ' + KINDS.get('date').format(doc.issueDate));
      if (doc.expiryDate) out.push('בתוקף עד: ' + KINDS.get('date').format(doc.expiryDate));
      return out.join('\n');
    }

    var items = files.map(function (f) {
      return {
        icon: f.mime === 'application/pdf' ? 'i-file' : 'i-image',
        t: f.name, s: U.bytes(f.size),
        go: function () {
          DB.blob(f.blobId).then(function (rec) {
            if (!rec) { UI.toast('הקובץ לא נמצא'); return; }
            return Share.file(rec.data, f.name, f.mime).then(function (mode) {
              if (mode === 'download') UI.toast('הקובץ הורד');
            });
          });
        }
      };
    });

    items.push({
      icon: 'i-paste', t: 'הפרטים כטקסט',
      s: 'בלי הצילום · כולל ערכים רגישים',
      go: function () {
        Share.text(doc.title, lines()).then(function (mode) {
          if (mode === 'copy') UI.toast('הועתק ללוח');
        });
      }
    });

    var sheet = UI.sheet('שיתוף', [
      U.el('div', { class: 'routes' }, items.map(function (it) {
        var b = U.el('button', { class: 'route', type: 'button' }, [
          U.icon(it.icon, 24),
          U.el('span', {}, [
            U.el('span', { class: 'route-t', text: it.t }),
            U.el('span', { class: 'route-s', text: it.s })
          ])
        ]);
        b.addEventListener('click', function () { sheet.close(); it.go(); });
        return b;
      })),
      U.el('p', { class: 'muted small', text:
        'מה שיוצא מכאן יוצא מהאפליקציה. אין דרך לבטל שליחה.' })
    ]);
  };

  /* ---------- טופס מסמך ---------- */

  Screens.docForm = function (docId) {
    var doc = docId ? state.docs.filter(function (d) { return d.id === docId; })[0] : null;
    if (docId && !doc) return Screens.missing('המסמך לא נמצא');

    if (!state.entities.length) {
      var w = U.el('div', { class: 'scr' }, backHead('מסמך חדש', null, '#/entities'));
      w.appendChild(UI.empty({
        icon: 'i-users',
        title: 'צריך ישות אחת לפחות',
        sub: 'מסמך נתלה על אדם, רכב או בית',
        action: 'יצירת ישות',
        onAction: function () { Screens.entitySheet(null); }
      }));
      return w;
    }

    var proposal = doc ? null : window.App.proposal;
    var staged = (proposal && proposal.dropFiles) ? [] : window.App.staged;
    /* ההורה של הטופס: עריכה חוזרת למסמך, ומסמך חדש לישות שאליה הוא נתלה */
    var formParent = doc ? '#/doc/' + doc.id
      : '#/entity/' + (window.App.pendingEntityId || (state.entities[0] || {}).id || '');
    var wrap = U.el('div', { class: 'scr' },
      backHead(doc ? 'עריכת מסמך' : 'מסמך חדש', null, formParent));

    var noticeBox = U.el('div');
    wrap.appendChild(noticeBox);

    function showNotice(n) {
      U.clear(noticeBox);
      if (!n) return;
      noticeBox.appendChild(U.el('div', { class: 'notice notice-' + n.level }, [
        U.icon(n.level === 'ok' ? 'i-check' : 'i-bell', 20),
        U.el('span', { text: n.text })
      ]));
    }


    if (proposal && proposal.dropFiles && window.App.staged.length) {
      wrap.appendChild(U.el('p', { class: 'muted small', text:
        'הצילום שימש לקריאה בלבד ולא נשמר.' }));
    }

    if (staged.length) {
      wrap.appendChild(U.el('div', { class: 'staged' }, [
        U.el('div', { class: 'files-h', text: U.count(staged.length, 'קובץ אחד מצורף', 'קבצים מצורפים') })
      ].concat(staged.map(function (f) {
        return U.el('div', { class: 'file-row' }, [
          U.icon(f.mime === 'application/pdf' ? 'i-file' : 'i-image', 20),
          U.el('span', { class: 'file-n', text: f.name }),
          U.el('span', { class: 'file-s' }, U.bidi(Files.label(f)))
        ]);
      }))));
    }

    /* ---------- מסגרת התצוגה המקדימה ----------
       העוגן בכרטיס המסמך הוא חלון 16:10 לתוך הצילום, ובחירת החלון אינה
       דבר שקוד יכול לנחש נכון: בתעודת זהות עם ספח החלק המזהה למעלה,
       בקבלה הוא באמצע, ובצילום עם שוליים הוא נמוך יותר.

       הבורר יושב בטופס העריכה — שם המשתמש כבר מסתכל על המסמך — והוא
       חל על **הקובץ הראשון**, שהוא זה שמצויר בעוגן. */
    var cropCtl = null;
    /* **הקובץ הראשון בדיוק**, ולא הראשון שהוא תמונה. העוגן מצייר את
       `files[0]`, ובורר שהיה מכוון לקובץ אחר היה מזיז מסגרת שאיש לא רואה. */
    var cropFile = doc ? (doc.files || [])[0] : staged[0];
    if (cropFile && cropFile.mime === 'application/pdf') cropFile = null;

    if (cropFile) {
      var cropHost = U.el('div');
      wrap.appendChild(cropHost);

      var blobP = doc
        ? DB.blob(cropFile.blobId).then(function (rec) { return rec ? rec.data : null; })
        : Promise.resolve(cropFile.blob);

      blobP.then(function (blob) {
        if (!blob) return;
        cropCtl = UI.cropper(blob,
          { x: cropFile.focusX, y: cropFile.focusY, z: cropFile.focusZ }, {
            defaultFocus: { x: 50, y: 0 },
            label: 'מיקום התצוגה המקדימה',
            /* ברגע שיש הגדלה, גם הציר הרוחבי חי — ולכן הרמז אינו
               מבטיח יותר "למעלה ולמטה" בלבד. */
            hint: 'גרור כדי לבחור מה יוצג, וצבוט או הגדל במחוון'
          });
        U.clear(cropHost);
        cropHost.appendChild(U.el('div', { class: 'files-h', text: 'תצוגה מקדימה' }));
        cropHost.appendChild(cropCtl.element);
      });
    }

    /* ---------- פענוח לפי דרישה ----------
       הפרסינג האוטומטי רץ רק כשהוא מוגדר ורק פעם אחת. בלי הכפתור הזה,
       מסמך שלא זוהה — או שהמפתח הוגדר רק אחר כך — נשאר להזנה ידנית בלי
       שום דרך לנסות שוב. יכולת שאין לה כפתור היא יכולת שאינה קיימת. */
    var hasFile = staged.length > 0 || !!(doc && (doc.files || []).length);

    if (hasFile) {
      var parseBtn = U.el('button', { class: 'btn ghost wide', type: 'button' }, 'פענוח אוטומטי');
      parseBtn.addEventListener('click', function () {
        if (!window.Gemini.configured() || !window.Gemini.consented('image')) {
          Screens.geminiMissingSheet();
          return;
        }
        parseBtn.disabled = true;
        fileToParse().then(function (input) {
          if (!input) { UI.toast('אין קובץ לפענוח'); return null; }
          return window.App.runGemini(input);
        }).then(function (p) {
          parseBtn.disabled = false;
          if (!p) return;
          var r = form.applyProposal(p);
          if (r.mismatch) {
            showNotice(mismatchNotice(r.mismatch));
            UI.toast('הסוג שזוהה אינו מתאים לישות');
            return;
          }
          showNotice(p.notice);
          UI.toast(r.filled ? U.count(r.filled, 'מולא שדה אחד', 'מולאו שדות') : 'לא נמצאו שדות חדשים');
        }).catch(function () { parseBtn.disabled = false; });
      });
      wrap.appendChild(parseBtn);
    }

    function fileToParse() {
      if (staged.length) return Promise.resolve({ blob: staged[0].blob, mime: staged[0].mime });
      var f = doc && (doc.files || [])[0];
      if (!f) return Promise.resolve(null);
      return DB.blob(f.blobId).then(function (rec) {
        return rec ? { blob: rec.data, mime: rec.mime } : null;
      });
    }

    var form = Forms.doc({
      doc: doc,
      proposal: proposal,
      entities: state.entities,
      entityId: window.App.pendingEntityId
    });
    wrap.appendChild(form.element);

    function mismatchNotice(type) {
      var ent = state.byId[form.entityId()];
      return { level: 'warn', text:
        'המסמך זוהה כ' + type.label + ', שאינו מתאים ל' +
        (ent ? ent.name : 'ישות הזאת') + '. שנה את השיוך ונסה שוב.' };
    }

    /* שני המסלולים — אוטומטי ולפי דרישה — מציגים את אותה הודעה */
    if (proposal) {
      var initialBad = form.mismatchFor(proposal);
      showNotice(initialBad ? mismatchNotice(initialBad) : proposal.notice);
    }

    var err = U.el('p', { class: 'form-err', role: 'alert' });
    wrap.appendChild(err);

    var save = U.el('button', { class: 'btn wide', type: 'button', id: 'doc-save' }, 'שמירה');
    save.addEventListener('click', function () {
      err.textContent = '';
      var r = form.read();
      if (r.error) { err.textContent = r.error; return; }

      /* DEC-04: ילדים שנמצאו בספח מוצעים לפני השמירה, ברירת מחדל לא מסומן */
      var people = doc ? [] : window.Parse.peopleIn(r.value.typeKey, form.values());
      if (people.length) {
        Screens.peopleSheet(people, function (chosen) { commit(r, chosen); });
        return;
      }
      commit(r, []);
    });

    function commit(r, people) {
      var t = DT.get(r.value.typeKey);
      var files = (t && t.allowFiles) ? staged : [];
      var blobs = files.map(function (f) {
        return { id: U.id(), docId: r.value.id, data: f.blob, mime: f.mime, size: f.size };
      });
      r.value.files = (r.value.files || []).concat(blobs.map(function (b, i) {
        return {
          blobId: b.id, driveFileId: null, mime: b.mime,
          name: files[i].name, size: b.size
        };
      }));
      if (!doc && files.length) r.value.source = window.App.pendingSource || 'upload';

      /* המסגרת נשמרת על הקובץ שמצויר בעוגן, ולא על המסמך — החלפת הקובץ
         מחליפה גם את המסגרת שלו, וזה הדבר הנכון. */
      if (cropCtl && r.value.files.length) {
        var frame = cropCtl.value();
        r.value.files[0].focusX = frame.x;
        r.value.files[0].focusY = frame.y;
        r.value.files[0].focusZ = frame.z;
      }

      /* ---------- זיהוי מסמך מעודכן ----------
         אותו סוג, אותה ישות, אותם שדות חובה — אותו מסמך. מה שקובע מי
         הגרסה הנוכחית הוא התוקף, לא סדר ההעלאה. `updatedAt` נחתם כאן
         כי הוא שובר התיקו האחרון בדירוג. SPEC §6.6 */
      r.value.updatedAt = U.now();
      var plan = V.plan(r.value, state.docs);
      if (plan.supersededBy) r.value.supersededBy = plan.supersededBy;

      DB.supersede(r.value, plan.supersede, blobs).then(function () {
        return Promise.all(people.map(function (p) {
          return DB.saveEntity({
            id: U.id(), type: 'person', name: p.name,
            color: U.pick(C.ENTITY_COLORS, p.name), avatar: p.name.trim()[0]
          });
        }));
      }).then(function () {
        window.App.staged = [];
        window.App.proposal = null;
        window.App.pendingEntityId = null;
        var msg = r.unverified
          ? U.count(r.unverified, 'נשמר · שדה אחד לאימות', 'נשמר · שדות לאימות')
          : 'נשמר';
        if (people.length) msg += ' · ' + U.count(people.length, 'ישות נוצרה', 'ישויות נוצרו');
        if (plan.supersede.length) {
          msg = U.count(plan.supersede.length,
            'נשמר · הגרסה הקודמת נשמרה בצד', 'נשמר · הגרסאות הקודמות נשמרו בצד');
        } else if (plan.supersededBy) {
          msg = 'נשמר כגרסה קודמת — יש מסמך עדכני יותר';
        }
        UI.toast(msg);
        /* הטופס סיים. הוא יורד מההיסטוריה במקום להישאר בה, ולכן "חזור"
           מהמסמך השמור מוביל למי ששלח לטופס ולא לטופס עצמו. */
        window.App.leave('#/doc/' + r.value.id);
      });
    }
    wrap.appendChild(save);

    if (!doc && staged.length) {
      wrap.appendChild(U.el('p', { class: 'muted small', text:
        'הקבצים נשמרים רק בשמירה. יציאה מהמסך משחררת אותם.' }));
    }

    return wrap;
  };

  /* ---------- גיליון ישות ---------- */

  Screens.entitySheet = function (entity) {
    var form = Forms.entity(entity);
    var err = U.el('p', { class: 'form-err', role: 'alert' });

    var actions = [
      U.el('button', { class: 'btn wide', type: 'button' }, entity ? 'שמירה' : 'יצירה')
    ];
    if (entity) {
      actions.push(U.el('button', { class: 'btn ghost danger wide', type: 'button' }, 'מחיקת ישות'));
    }

    var sheet = UI.sheet(entity ? 'עריכת ישות' : 'ישות חדשה',
      [form.element, err, U.el('div', { class: 'sheet-actions col' }, actions)]);

    actions[0].addEventListener('click', function () {
      var r = form.read();
      if (r.error) { err.textContent = r.error; return; }
      DB.saveEntity(r.value).then(function () {
        sheet.close();
        UI.toast(entity ? 'נשמר' : 'הישות נוצרה');
        window.App.render();
      });
    });

    if (entity) {
      actions[1].addEventListener('click', function () {
        UI.confirm({
          title: 'מחיקת ' + entity.name,
          body: 'כל המסמכים של הישות יימחקו יחד איתה.',
          ok: 'מחיקה', danger: true
        }).then(function (yes) {
          if (!yes) return;
          DB.deleteEntity(entity.id).then(function () {
            sheet.close();
            UI.toast('הישות נמחקה');
            /* אותו כלל כמו במסמך מחוק — הרשומה מוחלפת ולא נדחפת */
            window.App.swap('#/entities');
          });
        });
      });
    }
  };

  /* מסביר מה חסר ולוקח לשם, במקום כפתור שלא עושה כלום */
  Screens.geminiMissingSheet = function () {
    var noKey = !window.Gemini.configured();
    var sheet = UI.sheet('פענוח אוטומטי', [
      U.el('p', { class: 'sheet-p', text: noKey
        ? 'הפענוח האוטומטי דורש מפתח Gemini. הוא אופציונלי — בלעדיו ממלאים ידנית, וסריקת דרכון ות״ז ממשיכה לעבוד על המכשיר.'
        : 'הפענוח שולח את הצילום לגוגל, וזה דורש הסכמה מפורשת בהגדרות.' }),
      U.el('div', { class: 'sheet-actions col' }, [
        U.el('button', {
          class: 'btn wide', type: 'button',
          onClick: function () { sheet.close(); location.hash = '#/settings'; }
        }, 'להגדרות')
      ])
    ]);
  };

  /* ---------- גיליון הצעת ישויות ---------- */
  /* מציע, לא יוצר. הצ׳קבוקסים פתוחים ולא מסומנים — פלט פרסינג לא נשמר בשקט. */
  Screens.peopleSheet = function (people, done) {
    var boxes = people.map(function (p) {
      var box = U.el('span', { class: 'box' });
      var row = U.el('button', { class: 'chk', type: 'button', 'aria-pressed': 'false' }, [
        box,
        U.el('span', {}, [
          U.el('span', { text: p.name }),
          p.year ? U.el('span', { class: 'chk-y' }, U.bidi(p.year)) : null
        ])
      ]);
      row.addEventListener('click', function () {
        var on = row.getAttribute('aria-pressed') !== 'true';
        row.setAttribute('aria-pressed', String(on));
        row.classList.toggle('on', on);
      });
      return { row: row, person: p };
    });

    var sheet = UI.sheet('נמצאו אנשים במסמך', [
      U.el('p', { class: 'sheet-p', text:
        'יצירת ישות מאפשרת לתלות עליהם דרכון או ביטוח. אפשר גם לדלג ולעשות את זה אחר כך.' }),
      U.el('div', { class: 'checks' }, boxes.map(function (b) { return b.row; })),
      U.el('div', { class: 'sheet-actions col' }, [
        U.el('button', {
          class: 'btn wide', type: 'button',
          onClick: function () {
            var chosen = boxes.filter(function (b) {
              return b.row.getAttribute('aria-pressed') === 'true';
            }).map(function (b) { return b.person; });
            sheet.close();
            done(chosen);
          }
        }, 'שמירה'),
        U.el('button', {
          class: 'btn ghost wide', type: 'button',
          onClick: function () { sheet.close(); done([]); }
        }, 'שמירה בלי ליצור ישויות')
      ])
    ]);
  };

  /* ---------- גיליון הוספה ---------- */

  Screens.addSheet = function (entityId) {
    /* ה-FAB גלובלי ואינו יודע מאיפה נלחץ; מסך ישות הוא הקשר, ולכן
       השיוך נגזר מהמסלול כשהקורא לא מסר אותו במפורש. */
    window.App.pendingEntityId = entityId || window.App.entityContext();

    function route(kind) {
      sheet.close();
      window.App.pendingSource = (kind === 'camera' || kind === 'mrz') ? 'camera' : 'upload';
      if (kind === 'manual') {
        window.App.staged = [];
        window.App.proposal = null;
        location.hash = '#/doc/new';
      } else if (kind === 'mrz') {
        window.App.pickFiles(null, true, 'mrz');
      } else if (kind === 'paste') {
        window.App.pasteRoute();
      } else {
        window.App.pickFiles(null, kind === 'camera');
      }
    }

    var items = [
      { icon: 'i-passport', t: 'סריקת דרכון או ת״ז', k: 'mrz',
        s: 'קריאה על המכשיר · הורדה חד-פעמית של ' +
           String(window.Parse.ASSET_MB).replace('.', '.') + 'MB' },
      { icon: 'i-camera', t: 'צילום', s: 'מצלמת המכשיר', k: 'camera' },
      { icon: 'i-upload', t: 'בחירת קובץ', s: 'תמונה או PDF', k: 'file' },
      { icon: 'i-paste', t: 'הדבקה מהלוח', s: 'צילום מסך, קובץ, או פרטים שהעתקת', k: 'paste' },
      { icon: 'i-edit', t: 'הזנה ידנית', s: 'בלי קובץ', k: 'manual' }
    ];

    var sheet = UI.sheet('הוספת מסמך', [
      U.el('div', { class: 'routes' }, items.map(function (it) {
        var b = U.el('button', { class: 'route', type: 'button' }, [
          U.icon(it.icon, 24),
          U.el('span', {}, [
            U.el('span', { class: 'route-t', text: it.t }),
            U.el('span', { class: 'route-s', text: it.s })
          ])
        ]);
        b.addEventListener('click', function () { route(it.k); });
        return b;
      })),
      U.el('p', { class: 'muted small', text:
        'אפשר גם לגרור קובץ לחלון, או להדביק עם Ctrl+V מכל מסך.' })
    ]);
  };

  /* ---------- יעד הדבקה ----------
     מסלול הנסיגה כשהדפדפן אינו נותן לקרוא את הלוח בקוד. מסגרת מקווקוות
     צבעונית — "ממתין לפעולה עכשיו", להבדיל מהמסגרת הניטרלית של מצב ריק. */
  Screens.pasteSheet = function (reason) {
    var target = U.el('div', {
      class: 'paste-target', contenteditable: 'true', role: 'textbox',
      inputmode: 'none', 'aria-label': 'הדבק כאן',
      tabindex: '0'
    }, U.el('span', { class: 'paste-hint', text: 'הדבק כאן' }));

    /* המסלול שתמיד עובד, ולכן הוא הכפתור המלא ולא הרפאים. במחשב הדבקה
       של קובץ למסגרת עובדת; **בנייד היא לרוב לא** — iOS אינו מדביק קובץ
       לתוך contenteditable, ולכן בורר הקבצים הוא התשובה ולא הנסיגה. */
    var pick = U.el('button', { class: 'btn wide', type: 'button' }, 'בחירת קובץ מהמכשיר');
    pick.addEventListener('click', function () {
      sheet.close();
      window.App.pickFiles(null, false);
    });

    var err = U.el('p', { class: 'form-err', role: 'alert' });

    var sheet = UI.sheet('הדבקה מהלוח', [
      U.el('p', { class: 'sheet-p', text: reason ||
        'הצמד את הסמן למסגרת והדבק — Ctrl+V במחשב, או לחיצה ארוכה והדבקה בנייד.' }),
      target,
      err,
      U.el('p', { class: 'muted small', text:
        'הדבקת קובץ למסגרת עובדת במחשב. בנייד המערכת לרוב אינה מוסרת קבצים ' +
        'להדבקה — שם בחר את הקובץ מהמכשיר. אפשר גם לגרור קובץ לחלון.' }),
      pick
    ]);

    /* **סוגרים רק כשנקלט משהו.** קודם הגיליון נסגר תמיד, וכשההדבקה לא
       מסרה קובץ המשתמש נזרק חזרה למסך הישות בלי הסבר — ונראה לו שהוא
       עשה משהו לא נכון. עכשיו הוא נשאר כאן ומקבל את השורה הבאה. */
    target.addEventListener('paste', function (e) {
      e.preventDefault();
      e.stopPropagation();
      err.textContent = '';
      if (window.App.ingestPaste(e.clipboardData, { quiet: true })) {
        sheet.close();
        return;
      }
      U.clear(target).appendChild(U.el('span', { class: 'paste-hint', text: 'הדבק כאן' }));
      err.textContent = 'ההדבקה לא מסרה קובץ. בחר את הקובץ מהמכשיר.';
      if (navigator.vibrate) navigator.vibrate(40);
    });

    setTimeout(function () { target.focus(); }, 80);
  };

  /* ---------- עוזר ----------
     שיחה שיש לה גישה לנתונים ויכולת לשנות אותם — אבל לא לכתוב בעצמה.
     כל שינוי מגיע ככרטיס לאישור, ורק כפתור "החלה" נוגע ב-DB. זה אותו
     כלל של מסך האישור: פלט מודל אינו נשמר בשקט. */

  Screens.chat = function () {
    var Chat = window.Chat;
    var wrap = U.el('div', { class: 'scr' }, backHead('עוזר', null, '#/' + C.HOME));

    if (!Chat.ready()) {
      var noKey = !window.Gemini.configured();
      wrap.appendChild(UI.empty({
        icon: 'i-chat',
        title: noKey ? 'העוזר דורש מפתח Gemini' : 'העוזר דורש הסכמה',
        sub: noKey
          ? 'הוא אופציונלי. כל השאר באפליקציה עובד בלעדיו.'
          : 'השיחה שולחת לגוגל את השמות, הסוגים והשדות של הכספת. צריך לאשר זאת בהגדרות.',
        action: 'להגדרות',
        onAction: function () { location.hash = '#/settings'; }
      }));
      return wrap;
    }

    var log = U.el('div', { class: 'chat-log' });
    wrap.appendChild(log);

    /* המספר שנאביגו אמרה שלא מדדו ושכדאי למדוד. הוא גדל עם הכספת,
       והמשתמש הוא היחיד שיכול להחליט מתי הוא גדול מדי. */
    var size = U.el('p', { class: 'muted small chat-size' });
    wrap.appendChild(size);

    var input = U.el('textarea', {
      class: 'f-i f-multi chat-in', rows: '2',
      placeholder: 'לדוגמה: קח מהספח את הפרטים של איתמר והוסף לישות שלו',
      'aria-label': 'הודעה לעוזר'
    });
    var sendB = U.el('button', { class: 'btn', type: 'button' }, 'שליחה');
    wrap.appendChild(U.el('div', { class: 'chat-bar' }, [input, sendB]));

    function bubble(role, text) {
      return U.el('div', { class: 'bub bub-' + role }, U.el('span', { text: text }));
    }

    function paint() {
      U.clear(log);
      if (!Chat.log.length) {
        log.appendChild(U.el('p', { class: 'muted small', text:
          'העוזר רואה את הישויות והשדות שלך, ויכול להציע שינויים. שום שינוי ' +
          'אינו נשמר לפני שאתה מאשר אותו.' }));
      }
      Chat.log.forEach(function (m) {
        if (m.system) {
          log.appendChild(U.el('p', { class: 'muted small chat-sys', text: m.text }));
          return;
        }
        log.appendChild(bubble(m.role, m.text));
        if (m.ops && m.ops.length) log.appendChild(opsCard(m));
        if (m.errors && m.errors.length) {
          log.appendChild(U.el('div', { class: 'notice notice-warn' }, [
            U.icon('i-bell', 20),
            U.el('span', { text: m.errors.join(' · ') })
          ]));
        }
      });
      log.scrollTop = log.scrollHeight;
    }

    function opsCard(m) {
      var chosen = {};
      /* מסומן כברירת מחדל רק למה שבטוח להחיל. ריקון שדה והעברת מסמך
         מגיעים לא מסומנים — סימון הוא הצהרה, ולא מקום לחסוך בו לחיצה. */
      m.ops.forEach(function (o, i) { chosen[i] = !!o.safe; });

      var rows = m.ops.map(function (o, i) {
        var box = U.el('span', { class: 'box' });
        var lines = [U.el('span', { text: o.text })];
        /* הערך הקודם לצד החדש. ההבדל בין "עדכון תאריך" לבין
           "עכשיו 12/08 · אחרי 12/09" הוא ההבדל בין אישור אוטומטי לבדיקה. */
        if (o.beforeText) {
          lines.push(U.el('span', { class: 'chk-was' },
            U.bidi('עכשיו: ' + o.beforeText)));
        }
        var row = U.el('button', {
          class: 'chk' + (chosen[i] ? ' on' : ''), type: 'button',
          'aria-pressed': String(chosen[i])
        }, [box, U.el('span', { class: 'chk-b' }, lines)]);
        row.addEventListener('click', function () {
          chosen[i] = !chosen[i];
          row.setAttribute('aria-pressed', String(chosen[i]));
          row.classList.toggle('on', chosen[i]);
        });
        return row;
      });

      var apply = U.el('button', { class: 'btn wide', type: 'button' }, 'החלה');
      apply.addEventListener('click', function () {
        var picked = [], skipped = [];
        m.ops.forEach(function (o, i) { (chosen[i] ? picked : skipped).push(o); });
        if (!picked.length && !skipped.length) return;
        apply.disabled = true;
        window.Chat.apply(picked).then(function () {
          m.ops = null;
          /* התוצאה חוזרת למודל כתור. מודל שלא יודע שדחו אותו מציע שוב
             את אותו דבר; מודל שכן יודע מציע חלופה. ההמלצה הזאת הגיעה
             מנאביגו והיא הזולה מכולן ליישום. */
          window.Chat.log.push({
            role: 'user', system: true,
            text: window.Chat.outcomeText(picked, skipped)
          });
          UI.toast(picked.length
            ? U.count(picked.length, 'שינוי אחד הוחל', 'שינויים הוחלו')
            : 'שום שינוי לא הוחל');
          return Screens.reload();
        }).then(paint);
      });

      return U.el('div', { class: 'checks' }, rows.concat([
        U.el('div', { class: 'sheet-actions col' }, [apply])
      ]));
    }

    function send() {
      var q = input.value.trim();
      if (!q) return;
      input.value = '';
      Chat.log.push({ role: 'user', text: q });
      paint();

      var pending = { role: 'model', text: 'חושב…' };
      Chat.log.push(pending);
      paint();
      sendB.disabled = true;

      var ctx = window.Chat.context(state.entities, state.docs);
      size.textContent = 'ההקשר שנשלח: ' + U.bytes(window.Chat.contextSize(ctx));
      var turns = Chat.log
        .filter(function (m) { return m !== pending; })
        .slice(-Chat.HISTORY_MAX)
        .map(function (m) { return { role: m.role, text: m.text }; });

      window.Gemini.chat(window.Chat.prompt(ctx), turns).then(function (json) {
        var out = window.Chat.compile((json && json.actions) || [],
          { entities: state.entities, docs: state.live });
        pending.text = (json && json.reply) || 'אין לי תשובה.';
        pending.ops = out.ops;
        pending.errors = out.errors;
      }, function (e) {
        pending.text = 'הבקשה נכשלה: ' + e.message;
      }).then(function () {
        sendB.disabled = false;
        paint();
      });
    }

    sendB.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
    });

    paint();
    return wrap;
  };

  /* ---------- הגדרות ---------- */

  Screens.settings = function () {
    var wrap = U.el('div', { class: 'scr' }, head('הגדרות'));

    function section(title, kids) {
      return U.el('div', { class: 'sect' },
        [U.el('div', { class: 'sect-h', text: title })].concat(kids));
    }

    function segRow(labelText, options, value, onPick) {
      var seg = U.el('div', { class: 'seg', role: 'group', 'aria-label': labelText });
      options.forEach(function (o) {
        var b = U.el('button', {
          class: 'seg-b', type: 'button', 'aria-pressed': String(o.key === value)
        }, [
          o.swatch ? U.el('i', { class: 'seg-sw', style: 'background:' + o.swatch }) : null,
          U.el('span', { text: o.label })
        ]);
        b.addEventListener('click', function () {
          seg.querySelectorAll('.seg-b').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          onPick(o.key);
        });
        seg.appendChild(b);
      });
      return U.el('div', { class: 'set-row col' }, [
        U.el('span', { class: 'set-l', text: labelText }), seg
      ]);
    }

    function toggleRow(labelText, sub, value, onChange) {
      var btn = U.el('button', {
        class: 'switch', type: 'button', role: 'switch',
        'aria-checked': String(!!value), 'aria-label': labelText
      }, U.el('i'));
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(next));
        onChange(next, btn);
      });
      return U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-b' }, [
          U.el('span', { class: 'set-l', text: labelText }),
          sub ? U.el('span', { class: 'set-s', text: sub }) : null
        ]),
        btn
      ]);
    }

    wrap.appendChild(section('תצוגה', [
      segRow('פלטה', C.PALETTES.map(function (p) {
        return { key: p.key, label: p.label, swatch: p.swatch };
      }), S.get(C.K.palette), function (k) { S.set(C.K.palette, k); }),

      segRow('כתב', C.TYPEFACES.map(function (t) {
        return { key: t.key, label: t.label };
      }), S.get(C.K.typeface), function (k) { S.set(C.K.typeface, k); }),

      toggleRow('מצב פרטיות', 'טשטוש כל הערכים הרגישים על המסך',
        S.get(C.K.privacyMode), function (v) {
          S.set(C.K.privacyMode, v).then(function () { S.applyTheme(); });
        })
    ]));

    /* ---- PIN — DEC-03 ---- */
    var pinKids = [];
    if (Vault.hasPin() && Vault.enabled()) {
      pinKids.push(U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-b' }, [
          U.el('span', { class: 'set-l', text: 'שער PIN' }),
          U.el('span', { class: 'set-s', text: 'דלוק. נדרש בכל פתיחה.' })
        ])
      ]));
      pinKids.push(U.el('button', {
        class: 'btn ghost wide', type: 'button',
        onClick: function () { Screens.pinSheet('change'); }
      }, 'שינוי קוד'));
      pinKids.push(U.el('button', {
        class: 'btn ghost danger wide', type: 'button',
        onClick: function () {
          UI.confirm({
            title: 'כיבוי שער ה-PIN',
            body: 'אחרי הכיבוי, כל מי שמחזיק את המכשיר הפתוח יראה את תעודות הזהות, ' +
                  'הפוליסות והמספרים של כל המשפחה, בלי שום שלב נוסף.',
            ok: 'כיבוי', danger: true
          }).then(function (yes) {
            if (!yes) return;
            Vault.disable().then(function () {
              UI.toast('שער ה-PIN כובה');
              window.App.render();
            });
          });
        }
      }, 'כיבוי שער ה-PIN'));

      var mins = [1, 5, 15, 0];
      pinKids.push(segRow('נעילה אוטומטית', mins.map(function (m) {
        return { key: String(m), label: m === 0 ? 'כבוי' : m + ' דקות' };
      }), String(S.get(C.K.autoLockMinutes)), function (k) {
        S.set(C.K.autoLockMinutes, Number(k));
      }));
    } else {
      pinKids.push(U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-b' }, [
          U.el('span', { class: 'set-l', text: 'שער PIN' }),
          U.el('span', { class: 'set-s', text: 'כבוי. האפליקציה נפתחת ישירות.' })
        ])
      ]));
      pinKids.push(U.el('button', {
        class: 'btn wide', type: 'button',
        onClick: function () { Screens.pinSheet('set'); }
      }, 'הפעלת שער PIN'));
    }
    wrap.appendChild(section('פרטיות', pinKids));

    /* ---- גיבוי לדרייב ----
       שתי דרכים, ואותו חוזה תחבורה מאחוריהן. ההבדל היחיד שמעניין את
       המשתמש הוא התחברות: הגשר לא מבקש אותה אף פעם, ו-OAuth מבקש בכל
       פתיחה. DEC-31. */
    var mode = S.get(C.K.backupMode) || 'bridge';

    var bridgeUrlI = U.el('input', {
      class: 'f-i', type: 'text', id: 'b-url', dir: 'ltr',
      autocomplete: 'off', spellcheck: 'false',
      placeholder: 'https://script.google.com/…/exec',
      value: S.get(C.K.bridgeUrl) || ''
    });
    var bridgeTokI = U.el('input', {
      class: 'f-i', type: 'password', id: 'b-token', dir: 'ltr',
      autocomplete: 'off', spellcheck: 'false',
      placeholder: 'הסוד שהגדרת ב-SECRET',
      value: S.get(C.K.bridgeToken) || ''
    });
    var bridgeMsg = U.el('div', { class: 'f-err', role: 'status' });

    var idInput = U.el('input', {
      class: 'f-i', type: 'text', id: 'd-client', dir: 'ltr',
      autocomplete: 'off', spellcheck: 'false',
      placeholder: '…apps.googleusercontent.com', value: S.get(C.K.driveClientId) || ''
    });
    var driveMsg = U.el('div', { class: 'f-err', role: 'status' });
    var connected = window.App.transport().connected();
    var last = S.get(C.K.lastSync);

    var driveKids = [
      U.el('p', { class: 'muted small', text:
        'אופציונלי. בלי חיבור הכל נשמר על המכשיר הזה בלבד, ואין גיבוי — ' +
        'מחיקת נתוני האתר מוחקת הכל.' }),
      segRow('שיטה', [
        { key: 'bridge', label: 'גשר Apps Script' },
        { key: 'oauth', label: 'התחברות לגוגל' }
      ], mode, function (k) {
        S.set(C.K.backupMode, k).then(function () {
          window.Sync.transport = window.App.transport();
          window.App.render();
        });
      }),
      U.el('p', { class: 'muted small', text: mode === 'oauth'
        ? 'התחברות לגוגל מבקשת אישור בכל פתיחה של האפליקציה, ובתמורה ההרשאה ' +
          'מצומצמת לקבצים שהאפליקציה עצמה יצרה.'
        : 'הגשר רץ בחשבון הגוגל שלך ולכן **אינו מבקש התחברות אף פעם** — ' +
          'מדביקים כתובת וסוד פעם אחת. הסוד הוא מה שמגן, ולכן הוא חייב ' +
          'להיות אקראי.' }),
      U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-b' }, [
          U.el('span', { class: 'set-l', text: 'חיבור' }),
          U.el('span', { class: 'set-s', text: connected ? 'מחובר' : 'לא מחובר' })
        ])
      ])
    ];

    if (last) {
      driveKids.push(U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-l', text: 'סנכרון אחרון' }),
        U.el('span', { class: 'set-s' },
          U.bidi(new Date(last).toLocaleString('he-IL')))
      ]));
    }

    /* המחוון עצמו הוא נקודה בת שמונה פיקסלים בפינה, וללא הסבר הוא נראה
       כמו תקלה בתצוגה. השאלה נשאלה, ולכן התשובה יושבת ליד ההגדרה. */
    driveKids.push(U.el('p', { class: 'muted small', text:
      'הנקודה הקטנה בפינה העליונה היא מחוון הסנכרון: פועמת בזמן סנכרון, ' +
      'דוהה לרגע כשהסתיים, ואדומה אם נכשל. כשאין מה לומר היא אינה מוצגת.' }));

    /* ---- הגשר ----
       שני שדות וכפתור בדיקה. אין כאן "התחברות" מפני שאין מה לחבר:
       הגשר רץ בחשבון, והדפדפן רק פונה אליו. */
    if (mode === 'bridge') {
      driveKids.push(U.el('details', { class: 'howto' }, [
        U.el('summary', { text: 'איך מקימים את הגשר' }),
        U.el('ol', { class: 'steps' }, [
          U.el('li', { text: 'script.google.com → New project' }),
          U.el('li', { text: 'הדבק את tools/bridge.gs מהריפו במקום התוכן' }),
          U.el('li', { text: 'שנה את SECRET למחרוזת אקראית — 16 תווים לפחות, מומלץ 32' }),
          U.el('li', { text: 'Deploy → New deployment → Web app' }),
          U.el('li', { text: 'Execute as: Me · Who has access: Anyone' }),
          U.el('li', { text: 'אשר את ההרשאות, והעתק את הכתובת שמסתיימת ב-‎/exec' })
        ]),
        U.el('p', { class: 'muted small', text:
          'הכתובת והסוד הם צמד גישה: מי שמחזיק בשניהם יכול לקרוא ולכתוב ' +
          'בתיקיית DocVault שלך. הגשר אינו נוגע בשום קובץ מחוצה לה. ' +
          'אם הסוד דלף — פרוס מחדש עם סוד חדש, וזה מבטל את הישן מיידית.' })
      ]));

      /* התקלה שכמעט כולם נתקלים בה, ולכן היא כתובה כאן ולא רק ב-README:
         Apps Script אינו יודע לעבוד עם כמה חשבונות גוגל מחוברים באותו
         דפדפן. הסימן הוא authuser=<מספר> בכתובת ודף שאומר "לא ניתן
         לפתוח את הקובץ". זה אינו קשור לסקריפט ואינו נפתר בפריסה חוזרת. */
      driveKids.push(U.el('details', { class: 'howto' }, [
        U.el('summary', { text: 'הפריסה נכשלת · "לא ניתן לפתוח את הקובץ"' }),
        U.el('p', { class: 'small', text:
          'אם בכתובת מופיע authuser ומספר, הדפדפן מחובר לכמה חשבונות גוגל ' +
          'ו-Apps Script פונה לחשבון הלא נכון. הסקריפט תקין — הבעיה בזהות.' }),
        U.el('ol', { class: 'steps' }, [
          U.el('li', { text: 'פתח חלון פרטי והתחבר בו לחשבון אחד בלבד' }),
          U.el('li', { text: 'היכנס מחדש ל-script.google.com מאותו חלון' }),
          U.el('li', { text: 'חלופה מהירה: החלף בכתובת authuser=3 ל-authuser=0' })
        ]),
        U.el('p', { class: 'small', text:
          'הודעה על סוד קצר מדי מגיעה מהגשר עצמו: הכתובת חשופה, ולכן הסוד ' +
          'הוא כל ההגנה, ופחות מ-16 תווים נדחה. אורך שונה בשני הצדדים ייתן ' +
          '"סוד שגוי" — הם חייבים להיות זהים תו בתו.' }),
        U.el('p', { class: 'muted small', text:
          'ואחרי כל שינוי בקובץ הסקריפט: Deploy → Manage deployments → עריכה ' +
          '→ New version. בלי זה הכתובת ממשיכה להריץ את הקוד הישן. ' +
          'בחשבון ארגוני (Workspace) ייתכן שמדיניות המנהל חוסמת ' +
          '"Who has access: Anyone", ואז יש להקים את הגשר בחשבון פרטי. ' +
          'ובדוק שהכתובת שהעתקת מסתיימת ב-‎/exec ולא ב-‎/dev.' })
      ]));

      driveKids.push(U.el('div', { class: 'f-g' }, [
        U.el('label', { class: 'f-l', for: 'b-url', text: 'כתובת הגשר' }),
        bridgeUrlI
      ]));
      driveKids.push(U.el('div', { class: 'f-g' }, [
        U.el('label', { class: 'f-l', for: 'b-token', text: 'סוד' }),
        bridgeTokI, bridgeMsg
      ]));

      driveKids.push(U.el('button', {
        class: 'btn wide', type: 'button',
        onClick: function (e) {
          var btn = e.currentTarget;
          btn.disabled = true;
          bridgeMsg.textContent = 'בודק…';
          S.set(C.K.bridgeUrl, bridgeUrlI.value.trim()).then(function () {
            return S.set(C.K.bridgeToken, bridgeTokI.value.trim());
          }).then(function () {
            window.Sync.transport = window.App.transport();
            return window.Bridge.connect();
          }).then(function (name) {
            bridgeMsg.textContent = '';
            UI.toast('הגשר עונה · ' + name);
            return window.Sync.run({ silent: false });
          }).then(function () {
            btn.disabled = false;
            window.App.render();
          }, function (err) {
            btn.disabled = false;
            bridgeMsg.textContent = err.message;
          });
        }
      }, 'שמירה ובדיקת הגשר'));

      if (connected) {
        driveKids.push(U.el('button', {
          class: 'btn ghost wide', type: 'button',
          onClick: function () {
            UI.toast('מסנכרן…');
            window.Sync.run({ silent: false }).then(function (r) {
              UI.toast(r.error ? 'הסנכרון נכשל: ' + r.error : 'הסנכרון הושלם');
              window.App.render();
            });
          }
        }, 'סנכרון עכשיו'));

        driveKids.push(U.el('button', {
          class: 'btn ghost danger wide', type: 'button',
          onClick: function () {
            UI.confirm({
              title: 'ניתוק הגשר',
              body: 'הכתובת והסוד יימחקו מהמכשיר. הנתונים יישארו במכשיר וגם בדרייב.',
              ok: 'ניתוק', danger: true
            }).then(function (yes) {
              if (!yes) return;
              window.Bridge.disconnect().then(function () {
                UI.toast('נותק');
                window.App.render();
              });
            });
          }
        }, 'ניתוק הגשר'));
      }
    }

    /* ---- מאיפה משיגים את המזהה ----
       השדה ביקש מזהה OAuth בלי לומר מאיפה הוא מגיע, וזה קלט שאי אפשר
       לנחש. ההוראות כאן ולא רק ב-README, כי מי שנתקע נתקע במסך הזה.

       השורה החשובה היא המקור: GIS דורש **Authorized JavaScript origins**
       ולא redirect URI, וזו הטעות שמחזירה `redirect_uri_mismatch`.
       הוא נגזר מ-`location.origin` ולכן הוא תמיד הנכון למכשיר הזה. */
    var steps = U.el('ol', { class: 'steps' }, [
      U.el('li', { text: 'console.cloud.google.com — צור פרויקט חדש' }),
      U.el('li', { text: 'APIs & Services → Library → הפעל את Google Drive API' }),
      U.el('li', { text: 'OAuth consent screen → External → הוסף את עצמך כ-Test user' }),
      U.el('li', { text: 'Credentials → Create credentials → OAuth client ID → Web application' }),
      U.el('li', {}, [
        U.el('span', { text: 'תחת Authorized JavaScript origins הדבק בדיוק: ' }),
        U.bidi(location.origin)
      ]),
      U.el('li', { text: 'העתק את ה-Client ID לשדה שלמטה' })
    ]);

    if (mode === 'oauth') {
    driveKids.push(U.el('details', { class: 'howto' }, [
      U.el('summary', { text: 'איך משיגים מזהה לקוח' }),
      steps,
      U.el('p', { class: 'muted small', text:
        'זה מקור JavaScript ולא כתובת הפניה — redirect URI במקום origin הוא ' +
        'הטעות שמחזירה redirect_uri_mismatch. אין צורך ב-Client secret.' })
    ]));

    driveKids.push(U.el('div', { class: 'f-g' }, [
      U.el('label', { class: 'f-l', for: 'd-client', text: 'מזהה לקוח של גוגל' }),
      idInput, driveMsg
    ]));

    driveKids.push(U.el('button', {
      class: 'btn ghost wide', type: 'button',
      onClick: function () {
        S.set(C.K.driveClientId, idInput.value.trim()).then(function () {
          driveMsg.textContent = 'נשמר במכשיר הזה בלבד';
        });
      }
    }, 'שמירת המזהה'));

    driveKids.push(U.el('button', {
      class: connected ? 'btn ghost danger wide' : 'btn wide', type: 'button',
      onClick: function () {
        if (connected) {
          UI.confirm({
            title: 'ניתוק מגוגל',
            body: 'הנתונים יישארו במכשיר וגם בדרייב. הסנכרון פשוט ייעצר.',
            ok: 'ניתוק', danger: true
          }).then(function (yes) {
            if (!yes) return;
            window.Drive.disconnect().then(function () {
              UI.toast('נותק');
              window.App.render();
            });
          });
          return;
        }
        driveMsg.textContent = 'מתחבר…';
        window.Drive.connect().then(function () {
          driveMsg.textContent = '';
          UI.toast('מחובר');
          return window.Sync.run({ silent: false });
        }).then(function () {
          window.App.render();
        }).catch(function (e) {
          driveMsg.textContent = e.message;
        });
      }
    }, connected ? 'ניתוק' : 'חיבור לגוגל דרייב'));

    if (connected) {
      driveKids.push(U.el('button', {
        class: 'btn ghost wide', type: 'button',
        onClick: function () {
          UI.toast('מסנכרן…');
          window.Sync.run({ silent: false }).then(function (r) {
            UI.toast(r.error ? 'הסנכרון נכשל: ' + r.error : 'הסנכרון הושלם');
            window.App.render();
          });
        }
      }, 'סנכרון עכשיו'));
    }
    }

    driveKids.push(U.el('p', { class: 'muted small', text:
      'צילומי תעודות זהות ורישיונות נשמרים בדרייב ללא הצפנה. הם מוגנים ' +
      'בדיוק כמו כל קובץ אחר בחשבון הגוגל שלך — לא יותר. דרכונים אינם עולים.' }));

    wrap.appendChild(section('גיבוי לדרייב', driveKids));

    /* ---- פרסינג בענן ---- */
    var keyInput = U.el('input', {
      class: 'f-i', type: 'password', id: 'g-key', dir: 'ltr',
      autocomplete: 'off', spellcheck: 'false',
      placeholder: 'מפתח Gemini', value: S.get(C.K.geminiKey) || ''
    });
    var keyMsg = U.el('div', { class: 'f-err', role: 'status' });

    var gemKids = [
      U.el('p', { class: 'muted small', text:
        'אופציונלי לגמרי. בלי מפתח, כל השדות ממולאים ידנית והאפליקציה עובדת במלואה. ' +
        'סריקת דרכון ותעודת זהות רצה על המכשיר ואינה נוגעת בזה.' }),
      U.el('div', { class: 'f-g' }, [
        U.el('label', { class: 'f-l', for: 'g-key', text: 'מפתח' }),
        keyInput, keyMsg
      ]),
      U.el('button', {
        class: 'btn ghost wide', type: 'button',
        onClick: function () {
          var v = keyInput.value.trim();
          S.set(C.K.geminiKey, v).then(function () {
            keyMsg.textContent = v ? 'נשמר במכשיר הזה בלבד' : 'המפתח הוסר';
            window.App.render();
          });
        }
      }, 'שמירת המפתח')
    ];

    /* שתי הסכמות נפרדות. שליחת מחרוזת פוליסה היא ויתור אחר לגמרי
       משליחת צילום של תעודת זהות, ולכן הן לא חולקות מתג. */
    gemKids.push(toggleRow('שליחת טקסט מודבק',
        'טקסט שהדבקת נשלח לגוגל לפרסינג',
      S.get(C.K.geminiConsentText), function (v) { S.set(C.K.geminiConsentText, v); }));

    gemKids.push(toggleRow('שליחת צילומי מסמכים',
        'הצילום עצמו נשלח לגוגל — כולל תעודות זהות',
      S.get(C.K.geminiConsentImage), function (v, btn) {
        if (!v) { S.set(C.K.geminiConsentImage, false); return; }
        UI.confirm({
          title: 'שליחת צילומים לגוגל',
          body: 'הצילום של המסמך — כולל תעודת זהות, רישיון או פוליסה — יישלח ' +
                'לשרתי גוגל לצורך הפרסינג. סריקת דרכון ות״ז לא צריכה את זה: ' +
                'היא רצה על המכשיר.',
          ok: 'מאשר'
        }).then(function (yes) {
          if (yes) S.set(C.K.geminiConsentImage, true);
          else btn.setAttribute('aria-checked', 'false');
        });
      }));

    /* ---------- מפל המודלים ----------
       הסדר קובע איכות, ולא רק מהירות: המודל הראשון ברשימה הוא זה שקורא
       את המסמך ברוב המכריע של הפעמים. לכן הוא גלוי, ניתן לעריכה, וניתן
       לרענון מול ה-API — "המודל העדכני" הוא שאילתה, לא קבוע. */
    var modelsI = U.el('textarea', {
      class: 'f-i f-multi', id: 'g-models', rows: '4', dir: 'ltr',
      spellcheck: 'false', autocomplete: 'off',
      placeholder: 'ריק = אוטומטי'
    });
    modelsI.value = (S.get(C.K.geminiModels) || []).join('\n');
    var modelsMsg = U.el('div', { class: 'f-err', role: 'status' });

    function readModels() {
      return modelsI.value.split('\n')
        .map(function (n) { return n.trim(); })
        .filter(Boolean);
    }

    gemKids.push(U.el('div', { class: 'set-row' }, [
      U.el('span', { class: 'set-b' }, [
        U.el('span', { class: 'set-l', text: 'המודל שענה אחרון' }),
        U.el('span', { class: 'set-s' },
          U.bidi(S.get(C.K.geminiLastModel) || 'עוד לא רץ'))
      ])
    ]));

    gemKids.push(U.el('div', { class: 'f-g' }, [
      U.el('label', { class: 'f-l', for: 'g-models', text: 'מפל המודלים — מודל בכל שורה' }),
      modelsI, modelsMsg
    ]));

    gemKids.push(U.el('p', { class: 'muted small', text:
      'הראשון ברשימה הוא שקורא את המסמך כמעט תמיד; מי שאחריו נכנס רק ' +
      'כשקודמו נכשל, עמוס או איטי. ריק = אוטומטי, לפי הסדר ' +
      'pro · flash · flash-lite, ובתוך כל שכבה הדור הגבוה קודם. ' +
      'מנוסים ' + C.GEMINI_TRIES + ' מודלים לכל היותר.' }));

    /* pro קורא תעודה מצולמת טוב יותר, וגם לוקח יותר זמן — זו הכרעה
       ולא ברירת מחדל שנפלה מעצמה (DEC-28). מי שלא יודע שאפשר להחליף
       משלם את ההפרש בלי לדעת שהייתה כאן בחירה. */
    gemKids.push(U.el('p', { class: 'muted small', text:
      'רוצה תשובות מהירות יותר ומוכן לוותר קצת בדיוק — שים מודל flash ' +
      'בשורה הראשונה. pro מדויק יותר על תעודה מצולמת, ואיטי יותר.' }));

    gemKids.push(U.el('button', {
      class: 'btn ghost wide', type: 'button',
      onClick: function (e) {
        var btn = e.currentTarget;
        if (!window.Gemini.configured()) {
          modelsMsg.textContent = 'צריך מפתח כדי לשאול אילו מודלים קיימים';
          return;
        }
        btn.disabled = true;
        modelsMsg.textContent = 'שואל את גוגל…';
        window.Gemini.available().then(function (names) {
          btn.disabled = false;
          modelsI.value = names.join('\n');
          modelsMsg.textContent = U.count(names.length,
            'נמצא מודל אחד · שמור כדי לקבע', 'מודלים נמצאו · שמור כדי לקבע');
        }, function (err) {
          btn.disabled = false;
          modelsMsg.textContent = err.message;
        });
      }
    }, 'גילוי המודלים הקיימים'));

    gemKids.push(U.el('button', {
      class: 'btn ghost wide', type: 'button',
      onClick: function () {
        var list = readModels();
        S.set(C.K.geminiModels, list).then(function () {
          modelsMsg.textContent = list.length
            ? U.count(list.length, 'מפל של מודל אחד נשמר', 'מודלים במפל')
            : 'המפל חזר לאוטומטי';
        });
      }
    }, 'שמירת המפל'));

    /* הסכמה שלישית, ורחבה מהשתיים: מפת הכספת ולא מסמך בודד. */
    gemKids.push(toggleRow('עוזר השיחה',
        'שמות, סוגים ושדות של כל הכספת נשלחים לגוגל בכל הודעה',
      S.get(C.K.geminiConsentChat), function (v, btn) {
        if (!v) { S.set(C.K.geminiConsentChat, false); return; }
        UI.confirm({
          title: 'שליחת נתוני הכספת לגוגל',
          body: 'העוזר צריך לראות את הנתונים כדי לענות עליהם. בכל הודעה נשלחות ' +
                'הישויות והשדות של כל המסמכים — כולל מספרי תעודת זהות ופוליסות. ' +
                'שדות הדרכון אינם נשלחים.',
          ok: 'מאשר'
        }).then(function (yes) {
          if (yes) S.set(C.K.geminiConsentChat, true);
          else btn.setAttribute('aria-checked', 'false');
        });
      }));

    wrap.appendChild(section('פרסינג בענן', gemKids));

    /* ---- מפתחות למכשיר נוסף — DEC-42 ----
       מכשיר שני אינו צריך להקים כלום מחדש: הוא צריך את אותן מחרוזות.
       הייצוא מוציא אותן כקובץ אחד, והייבוא כותב אותן ומסנכרן — ומאותו
       רגע יש שם גם את כל הכספת. */
    var kfMsg = U.el('div', { class: 'f-err', role: 'status' });
    var kfInput = U.el('input', {
      type: 'file', accept: 'application/json,.json',
      class: 'hidden-input', id: 'kf-file', 'aria-label': 'קובץ מפתחות'
    });

    function readText(file) {
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(String(r.result || '')); };
        r.onerror = function () { rej(new Error('קריאת הקובץ נכשלה')); };
        r.readAsText(file);
      });
    }

    function importKeyFile(file) {
      kfMsg.textContent = 'קורא את הקובץ…';
      readText(file).then(function (text) {
        var keys = window.KeyFile.parse(text);
        var rows = window.KeyFile.rows(keys);
        return UI.confirm({
          title: 'טעינת המפתחות',
          body: 'בקובץ: ' + rows.map(function (r) { return r.label; }).join(' · ') +
                '. מה שקיים במכשיר יוחלף, ומה שאינו בקובץ יישאר. ' +
                'ההסכמות לשליחה לגוגל אינן נוסעות בקובץ — כל אחד מאשר במכשיר שלו.',
          ok: 'טעינה'
        }).then(function (yes) {
          if (!yes) { kfMsg.textContent = ''; return null; }
          return window.KeyFile.apply(keys).then(function (n) {
            window.Sync.transport = window.App.transport();
            kfMsg.textContent = '';
            UI.toast(U.count(n, 'מפתח אחד נטען', 'מפתחות נטענו'));
            if (!window.App.transport().connected()) return null;
            UI.toast('מסנכרן…');
            return window.Sync.run({ silent: false }).then(function (r) {
              UI.toast(r.error ? 'הסנכרון נכשל: ' + r.error : 'הסנכרון הושלם');
            });
          }).then(function () { window.App.render(); });
        });
      }).catch(function (e) {
        kfMsg.textContent = e.message;
      });
    }

    kfInput.addEventListener('change', function () {
      var file = kfInput.files && kfInput.files[0];
      /* מתאפס לפני הקריאה, אחרת בחירה חוזרת באותו קובץ אינה מפעילה
         `change` והמסך נראה כאילו הלחיצה לא נקלטה. */
      kfInput.value = '';
      if (file) importKeyFile(file);
    });

    /* מי שיש לו מה לשלוח בא לכאן כדי לשלוח; מי שאין לו בא כדי לטעון.
       הכפתור הראשי הוא זה שמתאים למכשיר שעומדים מולו. */
    var kfHas = window.KeyFile.has();

    var keyKids = [
      U.el('p', { class: 'muted small', text:
        'קובץ אחד שנושא את כתובת הגשר, הסוד, מזהה הלקוח ומפתח Gemini — ' +
        'ולא נושא מסמכים. מי שטוען אותו מקבל את ההגדרות, ובסנכרון שרץ ' +
        'מיד אחריו מקבל גם את כל הכספת.' }),
      kfInput
    ];

    if (kfHas) {
      keyKids.push(U.el('button', {
        class: 'btn wide', type: 'button',
        onClick: function () {
          UI.confirm({
            title: 'שליחת המפתחות',
            body: 'הקובץ מכיל את סוד הגשר ואת מפתח Gemini בגלוי, ומי שמחזיק ' +
                  'בו יכול לקרוא ולכתוב בתיקיית הגיבוי. שלח אותו בערוץ שאתה ' +
                  'סומך עליו, ומחק אותו משם אחרי שנטען בצד השני.',
            ok: 'שליחה'
          }).then(function (yes) {
            if (!yes) return;
            window.Share.file(window.KeyFile.blob(), window.KeyFile.name(),
              'application/json').then(function (mode) {
              UI.toast(mode === 'cancel' ? 'בוטל'
                : mode === 'share' ? 'הקובץ נשלח' : 'הקובץ ירד למכשיר');
            });
          });
        }
      }, 'שליחת המפתחות שלי'));
    }

    keyKids.push(U.el('button', {
      class: kfHas ? 'btn ghost wide' : 'btn wide', type: 'button',
      onClick: function () { kfInput.click(); }
    }, 'טעינת קובץ מפתחות'));
    keyKids.push(kfMsg);

    if (!kfHas) {
      keyKids.push(U.el('p', { class: 'muted small', text:
        'אין עדיין מה לשלוח מהמכשיר הזה — אחרי שיוגדר גשר או מפתח Gemini, ' +
        'כפתור השליחה יופיע כאן.' }));
    }

    wrap.appendChild(section('מפתחות למכשיר נוסף', keyKids));

    wrap.appendChild(section('אודות', [
      U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-l', text: 'גרסה' }),
        U.el('span', { class: 'set-s' }, U.bidi(C.VERSION))
      ]),
      U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-l', text: 'מסמכים' }),
        U.el('span', { class: 'set-s', text: U.count(state.docs.length, 'מסמך אחד', 'מסמכים') })
      ]),
      /* המשפט הזה נכתב כשלא היה גיבוי, ונשאר אחרי שהיה. מסך הגדרות
         שמכחיש הגדרה שיושבת שתי מסגרות מעליו הוא גרוע יותר משורה חסרה:
         הוא מלמד לא להאמין למה שכתוב. הטקסט נגזר מהמצב, ולכן אינו יכול
         להתיישן שוב. */
      U.el('p', { class: 'muted small', text: connected
        ? 'מקור האמת הוא המכשיר הזה. הנתונים מגובים לדרייב אחרי כל שינוי, ' +
          'למעט שדות הדרכון שאינם עוזבים את המכשיר.'
        : 'הכל נשמר על המכשיר הזה בלבד. מחיקת נתוני האתר מוחקת הכל. ' +
          'גיבוי לדרייב קיים ואינו מחובר — ראה "גיבוי לדרייב" למעלה.' })
    ]));

    return wrap;
  };

  Screens.pinSheet = function (mode) {
    var first = '', stage = 'first';
    var title = U.el('p', { class: 'sheet-p', text: 'בחר קוד בן ארבע ספרות' });
    var dots = U.el('div', { class: 'dots' });
    var err = U.el('p', { class: 'form-err', role: 'alert' });
    var buf = '';

    function paint() {
      U.clear(dots);
      for (var i = 0; i < 4; i++) {
        dots.appendChild(U.el('i', { class: 'dot' + (i < buf.length ? ' on' : '') }));
      }
    }

    function press(d) {
      err.textContent = '';
      if (d === 'del') { buf = buf.slice(0, -1); paint(); return; }
      if (buf.length >= 4) return;
      buf += d;
      paint();
      if (buf.length < 4) return;
      /* מסגרת אחת כדי שהנקודה הרביעית תיצבע, ואז מיד — השהיה ארוכה יותר
         מפילה ספרה שהוקלדה מהר אחרי הרביעית */
      requestAnimationFrame(function () {
        if (stage === 'first') {
          first = buf; buf = ''; stage = 'confirm';
          title.textContent = 'הקלד שוב לאישור';
          paint();
        } else {
          if (buf !== first) {
            buf = ''; stage = 'first'; first = '';
            title.textContent = 'בחר קוד בן ארבע ספרות';
            err.textContent = 'הקודים לא תאמו. נסה שוב.';
            paint();
            return;
          }
          Vault.setPin(first).then(function () {
            sheet.close();
            UI.toast(mode === 'change' ? 'הקוד שונה' : 'שער ה-PIN הופעל');
            window.App.render();
          });
        }
      });
    }

    paint();
    var sheet = UI.sheet(mode === 'change' ? 'שינוי קוד' : 'הפעלת שער PIN',
      [title, dots, err, Screens.keypad(press)]);
  };

  Screens.keypad = function (press) {
    var pad = U.el('div', { class: 'pad' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) {
      pad.appendChild(U.el('button', {
        class: 'key', type: 'button', onClick: function () { press(d); }
      }, d));
    });
    pad.appendChild(U.el('button', { class: 'key blank', type: 'button', disabled: true, 'aria-hidden': 'true' }));
    pad.appendChild(U.el('button', {
      class: 'key', type: 'button', onClick: function () { press('0'); }
    }, '0'));
    pad.appendChild(U.el('button', {
      class: 'key', type: 'button', 'aria-label': 'מחיקה',
      onClick: function () { press('del'); }
    }, U.icon('i-backspace', 22)));
    return pad;
  };

  /* ---------- מסך נעילה ---------- */
  /* מקלדת משלנו ולא input type=number — כדי שלא תוקפץ מקלדת מערכת
     ולא תתאפשר הדבקה. אין כאן קישור לכיבוי השער. */
  Screens.lock = function (onOk) {
    var buf = '';
    var dots = U.el('div', { class: 'dots' });

    function paint() {
      U.clear(dots);
      for (var i = 0; i < 4; i++) {
        dots.appendChild(U.el('i', { class: 'dot' + (i < buf.length ? ' on' : '') }));
      }
    }

    function fail() {
      buf = ''; paint();
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
      if (navigator.vibrate) navigator.vibrate(60);
    }

    function press(d) {
      if (d === 'del') { buf = buf.slice(0, -1); paint(); return; }
      if (buf.length >= 4) return;
      buf += d; paint();
      if (buf.length < 4) return;
      Vault.verify(buf).then(function (okay) {
        if (okay) onOk(); else fail();
      });
    }

    paint();
    return U.el('div', { class: 'lock' }, [
      U.el('div', { class: 'lock-mark' }, U.icon('i-lock', 42)),
      U.el('div', { class: 'lock-t', text: C.APP_NAME }),
      U.el('div', { class: 'lock-s', text: 'הזן קוד כדי להיכנס' }),
      dots,
      Screens.keypad(press)
    ]);
  };

  Screens.missing = function (msg) {
    var wrap = U.el('div', { class: 'scr' }, backHead('לא נמצא', null, '#/' + C.HOME));
    wrap.appendChild(UI.empty({
      icon: 'i-file', title: msg,
      sub: 'ייתכן שהוא נמחק', action: 'למסך הבית',
      onAction: function () { location.hash = '#/' + C.HOME; }
    }));
    return wrap;
  };

  window.Screens = Screens;
})();
