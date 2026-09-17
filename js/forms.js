/* forms.js — הטופס הידני נבנה מ-DOC_TYPES. SPEC §5.
   אין כאן שום ידיעה על סוג מסמך מסוים. */
(function () {
  'use strict';

  var U = window.U, KINDS = window.KINDS, DT = window.DOC_TYPES, C = window.CONFIG;

  function label(text, forId) {
    return U.el('label', { class: 'f-l', for: forId, text: text });
  }

  function group(kids) { return U.el('div', { class: 'f-g' }, kids); }

  function select(id, options, value, onChange) {
    var s = U.el('select', { class: 'f-i', id: id });
    options.forEach(function (o) {
      s.appendChild(U.el('option', { value: o.value, text: o.label, selected: o.value === value }));
    });
    if (onChange) s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  function dateInput(id, value) {
    return U.el('input', { class: 'f-i', type: 'date', id: id, value: value || '' });
  }

  var Forms = {};

  /* טופס ישות */
  Forms.entity = function (entity) {
    var e = entity || { type: 'person', name: '', color: '', sortOrder: Date.now() };
    var nameI = U.el('input', { class: 'f-i', id: 'e-name', type: 'text', value: e.name || '', maxlength: '40' });
    var typeS = select('e-type', C.ENTITY_TYPES.map(function (t) {
      return { value: t.key, label: t.label };
    }), e.type);

    var chosen = e.color || U.pick(C.ENTITY_COLORS, e.id || String(Math.random()));
    var swatches = U.el('div', { class: 'swatches' }, C.ENTITY_COLORS.map(function (col) {
      var b = U.el('button', {
        class: 'sw' + (col === chosen ? ' on' : ''), type: 'button',
        style: 'background:' + col, 'aria-label': 'צבע ' + col,
        'aria-pressed': String(col === chosen)
      });
      b.addEventListener('click', function () {
        chosen = col;
        swatches.querySelectorAll('.sw').forEach(function (x) {
          x.classList.remove('on'); x.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
      });
      return b;
    }));

    /* ---------- אווטאר ----------
       תמונה גוברת על האות. כל עוד אין תמונה, האות והצבע נשארים —
       ולכן ישות בלי תמונה נראית בדיוק כמו קודם.

       כשיש תמונה, התצוגה המקדימה **היא הבורר**: התמונה נשמרת שלמה,
       והעיגול הוא חלון לתוכה שאפשר לגרור. חיתוך מהמרכז בזמן הבחירה
       היה מקבע ניחוש שאי אפשר לתקן בלי הקובץ המקורי. */
    var avatarImage = e.avatarImage || '';
    var avatarFocus = e.avatarFocus || { x: 50, y: 50, z: 1 };
    var framer = null;

    var host = U.el('div', { class: 'av-host' });
    var pickI = U.el('input', {
      type: 'file', accept: 'image/*', class: 'hidden-input',
      id: 'e-avatar', 'aria-label': 'תמונת ישות'
    });
    var avErr = U.el('div', { class: 'f-err' });
    var pickB = U.el('button', { class: 'btn ghost', type: 'button' }, 'בחירת תמונה');
    var removeB = U.el('button', { class: 'btn ghost', type: 'button' }, 'הסרת התמונה');

    function readFocus() {
      if (framer) avatarFocus = framer.value();
      return avatarFocus;
    }

    function paintAvatar() {
      U.clear(host);
      framer = null;
      if (avatarImage) {
        framer = window.UI.cropper(avatarImage, avatarFocus, {
          shape: 'circle', slider: false,
          label: 'מה יוצג בעיגול האווטאר',
          hint: 'גרור כדי לבחור מה יוצג, וצבוט כדי להגדיל או להקטין',
          flatHint: 'התמונה ריבועית — כולה נכנסת לעיגול.'
        });
        host.appendChild(framer.element);
      } else {
        var circle = U.el('span', {
          class: 'av av-lg', style: 'background:' + chosen
        }, U.el('span', { text: (nameI.value.trim()[0] || '?') }));
        host.appendChild(circle);
      }
      pickB.textContent = avatarImage ? 'החלפת התמונה' : 'בחירת תמונה';
      removeB.style.display = avatarImage ? '' : 'none';
    }

    nameI.addEventListener('input', function () { if (!avatarImage) paintAvatar(); });
    pickI.addEventListener('change', function () {
      var f = pickI.files && pickI.files[0];
      pickI.value = '';
      if (!f) return;
      avErr.textContent = '';
      window.Files.avatar(f).then(function (url) {
        avatarImage = url;
        /* תמונה חדשה מתחילה במרכז. שמירת המסגרת הקודמת הייתה מציגה
           פינה אקראית של תמונה אחרת לגמרי. */
        avatarFocus = { x: 50, y: 50, z: 1 };
        paintAvatar();
      }, function (err) { avErr.textContent = err.message; });
    });
    pickB.addEventListener('click', function () { pickI.click(); });
    removeB.addEventListener('click', function () {
      avatarImage = '';
      avatarFocus = { x: 50, y: 50, z: 1 };
      paintAvatar();
    });

    var avatarRow = U.el('div', { class: 'av-row' }, [
      host,
      U.el('div', { class: 'av-acts' }, [pickB, removeB]),
      pickI
    ]);

    /* בחירת צבע משתקפת בעיגול האות, ולכן הציור מחדש */
    Array.prototype.forEach.call(swatches.querySelectorAll('.sw'), function (b) {
      b.addEventListener('click', function () { if (!avatarImage) paintAvatar(); });
    });

    var form = U.el('div', { class: 'form' }, [
      group([label('שם', 'e-name'), nameI]),
      group([label('סוג', 'e-type'), typeS]),
      group([label('תמונה', null), avatarRow, avErr]),
      group([label('צבע', null), swatches])
    ]);

    paintAvatar();

    return {
      element: form,
      read: function () {
        var name = nameI.value.trim();
        if (!name) return { error: 'צריך שם לישות' };
        return {
          value: {
            id: e.id || U.id(),
            type: typeS.value,
            name: name,
            color: chosen,
            avatar: name[0],
            avatarImage: avatarImage || '',
            avatarFocus: readFocus(),
            sortOrder: e.sortOrder != null ? e.sortOrder : Date.now(),
            deleted: 0
          }
        };
      }
    };
  };

  /* טופס מסמך — כולו נגזר מהטבלה */
  Forms.doc = function (opts) {
    var doc = opts.doc || null;
    var proposal = opts.proposal || null;
    var entities = opts.entities || [];
    var current = doc ? { entityId: doc.entityId, typeKey: doc.typeKey } : {
      entityId: opts.entityId || (entities[0] && entities[0].id) || '',
      typeKey: (proposal && proposal.typeKey) || ''
    };

    var host = U.el('div', { class: 'form' });
    var fieldsHost = U.el('div');
    var inputs = {};
    var issueI, expiryI, notesI, titleI;
    var reminderShown = false;

    /* שדות שאין להם עמודה בטבלה, בסוגים שהטבלה מסמנת כפתוחים.
       {key,label,value} — התווית עצמה ניתנת לעריכה, מפני שהיא מגיעה
       מהמסמך ולא מהטבלה, ומודל טועה בתוויות בדיוק כפי שהוא טועה בערכים. */
    var extras = [];
    var extraHost = U.el('div');

    function entityById(id) {
      return entities.filter(function (x) { return x.id === id; })[0] || null;
    }

    function typesFor(entityId) {
      var ent = entityById(entityId);
      return ent ? DT.forEntityType(ent.type) : DT.all();
    }

    /* ההצעה ממלאת רק מה שאין. עריכה של מסמך קיים גוברת על פרסינג. */
    function fieldValue(key) {
      if (doc) {
        var f = (doc.fields || []).filter(function (x) { return x.key === key; })[0];
        if (f) return f.value;
      }
      if (proposal && proposal.values[key]) return proposal.values[key];
      return '';
    }

    function proposedDate(which) {
      if (doc && doc[which]) return doc[which];
      if (proposal && proposal[which]) return proposal[which];
      return '';
    }

    /* מקורות השדות הפתוחים, לפי סדר: מה שכבר שמור על המסמך, ואז מה
       שהפרסינג הציע. שדה שיש לו עמודה בטבלה אינו שדה פתוח גם אם הוא
       שמור על המסמך — הוא ייכנס לשורה שלו למעלה. */
    function seedExtras(t) {
      var defs = {};
      t.fields.forEach(function (f) { defs[f.key] = 1; });
      var out = [], seen = {};
      function add(key, label, value) {
        var v = value == null ? '' : String(value);
        if (!key || defs[key] || seen[key]) return;
        seen[key] = 1;
        out.push({ key: key, label: String(label || key), value: v });
      }
      if (doc) (doc.fields || []).forEach(function (f) { add(f.key, f.label, f.value); });
      if (proposal) (proposal.extra || []).forEach(function (e) { add(e.key, e.label, e.value); });
      return out;
    }

    function extraRow(row, i) {
      var lI = U.el('input', {
        class: 'f-i f-x-l', id: 'x-l-' + i, type: 'text', value: row.label,
        maxlength: '40', 'aria-label': 'שם השדה'
      });
      var vI = U.el('input', {
        class: 'f-i', id: 'x-v-' + i, type: 'text', value: row.value,
        autocomplete: 'off', 'aria-label': 'ערך השדה'
      });
      lI.addEventListener('input', function () { row.label = lI.value; });
      vI.addEventListener('input', function () { row.value = vI.value; });

      var del = U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'הסרת השדה'
      }, U.icon('i-trash', 20));
      del.addEventListener('click', function () {
        var i = extras.indexOf(row);
        if (i !== -1) extras.splice(i, 1);
        paintExtras();
      });

      return group([U.el('div', { class: 'f-x-h' }, [lI, del]), vI]);
    }

    function paintExtras() {
      U.clear(extraHost);
      var t = DT.get(current.typeKey);
      if (!t || !t.openFields) return;

      if (extras.length) {
        extraHost.appendChild(U.el('div', { class: 'files-h', text: 'שדות נוספים' }));
        extras.forEach(function (row, i) { extraHost.appendChild(extraRow(row, i)); });
      }

      /* הכפתור קיים גם כשאין שדות. סוג פתוח בלי דרך להוסיף שדה ביד הוא
         סוג פתוח רק כשיש מפתח Gemini, וזה בדיוק מה שאסור. */
      var add = U.el('button', { class: 'btn ghost wide', type: 'button' }, [
        U.icon('i-plus', 18), U.el('span', { text: 'הוספת שדה' })
      ]);
      add.addEventListener('click', function () {
        extras.push({ key: '', label: '', value: '' });
        paintExtras();
        var all = extraHost.querySelectorAll('.f-x-l');
        if (all.length) all[all.length - 1].focus();
      });
      extraHost.appendChild(add);
    }

    function renderFields() {
      U.clear(fieldsHost);
      inputs = {};
      var t = DT.get(current.typeKey);
      if (!t) return;

      titleI = U.el('input', {
        class: 'f-i', id: 'd-title', type: 'text',
        value: (doc && doc.title) || t.label, maxlength: '60'
      });
      fieldsHost.appendChild(group([label('כותרת', 'd-title'), titleI]));

      t.fields.forEach(function (def) {
        var kind = KINDS.get(def.kind);
        var id = 'f-' + def.key;
        var input = def.multiline
          ? U.el('textarea', { class: 'f-i f-multi', id: id, rows: '2' })
          : U.el('input', {
              class: 'f-i', id: id, type: KINDS.inputType(def.kind),
              inputmode: kind.inputMode, autocomplete: 'off'
            });
        input.value = fieldValue(def.key);
        inputs[def.key] = { input: input, def: def };
        var lbl = label(def.label + (def.required ? ' *' : ''), id);
        var g = group([lbl, input, U.el('div', { class: 'f-err', id: id + '-err' })]);
        fieldsHost.appendChild(g);
      });

      /* השדות הפתוחים יושבים אחרי העמודות של הטבלה ולפני התאריכים —
         הם שדות של המסמך, ולא נספח בתחתית הטופס. */
      extras = seedExtras(t);
      fieldsHost.appendChild(extraHost);
      paintExtras();

      /* תאריכים — נגזר מ-expiry בטבלה. SPEC §5.1 */
      var issueVal = proposedDate('issueDate');
      issueI = dateInput('d-issue', issueVal);
      fieldsHost.appendChild(group([label('תאריך הנפקה', 'd-issue'), issueI]));

      var expVal = proposedDate('expiryDate');
      expiryI = dateInput('d-expiry', expVal);
      var expLabel = label('בתוקף עד' + (t.expiry === 'required' ? ' *' : ''), 'd-expiry');
      var expGroup = group([expLabel, expiryI, U.el('div', { class: 'f-err', id: 'd-expiry-err' })]);

      if (t.expiry === 'none' && !expVal && !reminderShown) {
        var add = U.el('button', { class: 'btn ghost wide', type: 'button' }, 'הוספת תזכורת');
        add.addEventListener('click', function () {
          reminderShown = true;
          add.replaceWith(expGroup);
        });
        fieldsHost.appendChild(add);
      } else {
        fieldsHost.appendChild(expGroup);
      }

      notesI = U.el('textarea', { class: 'f-i f-multi', id: 'd-notes', rows: '2' });
      notesI.value = (doc && doc.notes) || '';
      fieldsHost.appendChild(group([label('הערות', 'd-notes'), notesI]));
    }

    var entS = select('d-entity', entities.map(function (e) {
      return { value: e.id, label: e.name };
    }), current.entityId, function (v) {
      current.entityId = v;
      rebuildTypes();
    });

    var typeS = U.el('select', { class: 'f-i', id: 'd-type' });
    typeS.addEventListener('change', function () {
      current.typeKey = typeS.value;
      renderFields();
    });

    function rebuildTypes() {
      var list = typesFor(current.entityId);
      U.clear(typeS);
      list.forEach(function (t) {
        typeS.appendChild(U.el('option', { value: t.key, text: t.label }));
      });
      if (!list.some(function (t) { return t.key === current.typeKey; })) {
        current.typeKey = list[0] ? list[0].key : '';
      }
      typeS.value = current.typeKey;
      renderFields();
    }

    host.appendChild(group([label('שייך ל', 'd-entity'), entS]));
    host.appendChild(group([label('סוג מסמך', 'd-type'), typeS]));
    host.appendChild(fieldsHost);
    rebuildTypes();

    function currentValues() {
      var out = {};
      Object.keys(inputs).forEach(function (k) { out[k] = inputs[k].input.value.trim(); });
      return out;
    }

    /* סוג שההצעה מציעה ואינו קיים לישות הנבחרת. מוחזר גם למסלול האוטומטי,
       שאחרת היה מציג "שדות מולאו" בזמן ששום שדה לא מולא. */
    function mismatchFor(p) {
      if (!p || !p.typeKey) return null;
      var fits = typesFor(current.entityId).some(function (t) { return t.key === p.typeKey; });
      return fits ? null : DT.get(p.typeKey);
    }

    /* מזרים הצעה לטופס שכבר על המסך. **ממלא רק שדות ריקים** — מי שכבר
       הקליד משהו לא מאבד אותו לטובת ניחוש של מודל. */
    function applyProposal(p) {
      if (!p) return { filled: 0, mismatch: null };
      proposal = p;   /* כדי ש-read() יכבד את unverified שלה */

      /* המודל עשוי לזהות סוג שאינו מתאים לישות שנבחרה — ביטוח רכב על אדם.
         נפילה שקטה לסוג אחר נראית למשתמש כמו "הפענוח לא עשה כלום", ולכן
         זה חוזר כמידע ולא כשתיקה. */
      var bad = mismatchFor(p);
      if (bad) return { filled: 0, mismatch: bad };

      var blank = Object.keys(inputs).every(function (k) {
        return !inputs[k].input.value.trim();
      });
      if (p.typeKey && p.typeKey !== current.typeKey && blank) {
        current.typeKey = p.typeKey;
        typeS.value = p.typeKey;
        renderFields();   /* renderFields כבר ממלא מההצעה */
      }

      var filled = 0;
      Object.keys(p.values || {}).forEach(function (k) {
        var rec = inputs[k];
        if (!rec) return;
        if (!rec.input.value.trim()) rec.input.value = p.values[k];
        if (rec.input.value.trim() === String(p.values[k])) filled++;
      });

      /* אותו כלל בדיוק על השדות הפתוחים: שורה שכבר יש בה ערך אינה נדרסת,
         ושורה חדשה נוספת. סוג סגור מתעלם מהם — אין להם איפה לשבת. */
      var openType = DT.get(current.typeKey);
      if (openType && openType.openFields && (p.extra || []).length) {
        var have = {};
        extras.forEach(function (r) { if (r.key) have[r.key] = r; });
        p.extra.forEach(function (e) {
          var hit = have[e.key];
          if (hit) {
            if (!String(hit.value).trim()) { hit.value = e.value; filled++; }
            return;
          }
          extras.push({ key: e.key, label: e.label, value: e.value });
          have[e.key] = extras[extras.length - 1];
          filled++;
        });
        paintExtras();
      }

      if (p.expiryDate && expiryI && !expiryI.value) { expiryI.value = p.expiryDate; filled++; }
      if (p.issueDate && issueI && !issueI.value) { issueI.value = p.issueDate; filled++; }
      return { filled: filled, mismatch: null };
    }

    return {
      element: host,
      typeKey: function () { return current.typeKey; },
      entityId: function () { return current.entityId; },
      mismatchFor: mismatchFor,
      values: currentValues,
      applyProposal: applyProposal,

      /* verified = true אם ורק אם עבר את הוולידטור. SPEC §3.3 */
      read: function () {
        var t = DT.get(current.typeKey);
        if (!t) return { error: 'צריך לבחור סוג מסמך' };
        if (!current.entityId) return { error: 'צריך לשייך את המסמך לישות' };

        var fields = [], missing = [], unverified = 0;

        Object.keys(inputs).forEach(function (key) {
          var rec = inputs[key];
          var raw = rec.input.value.trim();
          var err = document.getElementById('f-' + key + '-err');
          if (err) { err.textContent = ''; }

          if (!raw) {
            if (rec.def.required) missing.push(rec.def.label);
            return;
          }
          var kind = KINDS.get(rec.def.kind);
          var canonical = kind.canonical(raw);
          var field = {
            key: rec.def.key,
            label: rec.def.label,
            value: canonical,
            kind: rec.def.kind,
            sensitive: rec.def.sensitive != null ? !!rec.def.sensitive : !!kind.sensitive,
            confidence: null,
            verified: true,
            multiline: !!rec.def.multiline
          };
          var check = KINDS.check(field);
          /* שדה שהפרסינג מילא בלי ראיה — שם מ-MRZ, שאין לו ספרת ביקורת —
             נשמר לא מאומת גם אם ה-kind שלו אינו יודע לפסול אותו. */
          var forced = proposal && proposal.unverified.indexOf(rec.def.key) !== -1 &&
                       raw === fieldValue(rec.def.key);
          field.verified = check.ok && !forced;
          if (forced && check.ok) unverified++;
          if (!check.ok) {
            unverified++;
            if (err) err.textContent = check.reason + ' · נשמר ומסומן לאימות';
          }
          fields.push(field);
        });

        /* שדות פתוחים. אין להם def בטבלה, ולכן אין להם kind משלהם והם
           נשמרים כטקסט — אבל הם עוברים את אותו `KINDS.check` ונשמרים
           באותה צורה בדיוק, כדי שמסך המסמך, ההעתקה והייצוא לא ידעו
           שיש הבדל. */
        if (t.openFields) {
          var taken = {};
          fields.forEach(function (f) { taken[f.key] = 1; });
          extras.forEach(function (row) {
            var lbl = String(row.label == null ? '' : row.label).trim();
            var val = String(row.value == null ? '' : row.value).trim();
            /* שורה חצי-ריקה אינה שדה. היא שורה שהמשתמש פתח ולא מילא. */
            if (!lbl || !val) return;

            var base = window.Parse.extraKey(lbl), key = base, n = 2;
            while (taken[key]) key = base + '_' + (n++);
            taken[key] = 1;

            var xf = {
              key: key, label: lbl, value: KINDS.get('text').canonical(val),
              kind: 'text', sensitive: false, confidence: null,
              verified: true, multiline: false
            };
            xf.verified = KINDS.check(xf).ok;
            fields.push(xf);
          });
        }

        if (missing.length) {
          return { error: 'חסר: ' + missing.join(', ') };
        }

        var expiry = expiryI ? expiryI.value : '';
        var issue = issueI ? issueI.value : '';
        var expErr = document.getElementById('d-expiry-err');
        if (expErr) expErr.textContent = '';

        if (t.expiry === 'required' && !expiry) {
          return { error: 'לסוג הזה חייב להיות תאריך תפוגה' };
        }
        if (expiry && issue && expiry < issue) {
          return { error: 'תאריך התפוגה מוקדם מתאריך ההנפקה' };
        }

        var title = (titleI && titleI.value.trim()) || t.label;
        if (t.titleFrom) {
          var src = fields.filter(function (f) { return f.key === t.titleFrom; })[0];
          if (src && src.value && (!titleI || titleI.value.trim() === t.label)) {
            title = t.label + ' · ' + src.value;
          }
        }

        return {
          value: {
            id: (doc && doc.id) || U.id(),
            entityId: current.entityId,
            typeKey: current.typeKey,
            title: title,
            fields: fields,
            issueDate: issue || null,
            expiryDate: expiry || null,
            files: (doc && doc.files) || [],
            /* מצביע הגרסה שורד עריכה. בלעדיו, עריכה של גרסה קודמת
               הייתה מחזירה אותה לתצוגה ומציגה שני מסמכים נוכחיים. */
            supersededBy: (doc && doc.supersededBy) || null,
            /* וכך גם סדר התצוגה שנבחר ביד — עריכת שדה אינה סיבה
               להחזיר את המסמך למקומו הכרונולוגי. */
            sortOrder: (doc && doc.sortOrder != null) ? doc.sortOrder : null,
            source: (doc && doc.source) || 'upload',
            notes: notesI ? notesI.value.trim() : '',
            deleted: 0
          },
          unverified: unverified
        };
      }
    };
  };

  window.Forms = Forms;
})();
