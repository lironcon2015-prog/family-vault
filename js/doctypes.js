/* doctypes.js — הטבלה המרכזית. SPEC §5.
   שורה אחת מייצרת: הטופס · הפרומפט ל-Gemini · רשימת ההעתקה · מנוע התפוגה.
   הוספת סוג מסמך = שורה. אפס קוד חדש. */
(function () {
  'use strict';

  var T = {

    id_card: {
      label: 'תעודת זהות', icon: 'i-card',
      entityTypes: ['person'], expiry: 'optional', allowFiles: true, parse: 'mrz+gemini',
      /* גב תעודת זהות ביומטרית הוא TD1. המיפוי משדות ה-MRZ לשדות הטבלה
         יושב כאן ולא בקוד הפרסינג — הוספת סוג עם MRZ היא שורה. */
      mrzFormat: 'TD1',
      mrzMap: {
        idNumber: 'israeliId', fullName: 'nameEn',
        birthDate: 'birthDate', docNumber: 'documentNumber'
      },
      fields: [
        { key: 'idNumber',  label: 'מספר תעודת זהות', kind: 'id',   required: true },
        { key: 'fullName',  label: 'שם מלא',          kind: 'text', required: true },
        { key: 'birthDate', label: 'תאריך לידה',      kind: 'date' },
        { key: 'docNumber', label: 'מספר התעודה',     kind: 'text' }
      ]
    },

    id_appendix: {
      label: 'ספח תעודת זהות', icon: 'i-doc',
      entityTypes: ['person'], expiry: 'none', allowFiles: true, parse: 'gemini',
      /* DEC-04: הילדים שבספח מוצעים כישויות, לא נוצרים. השדה שמזין את
         ההצעה מוגדר כאן, ולכן זה עובד גם בהזנה ידנית ולא רק אחרי פרסינג. */
      peopleFrom: 'children',
      fields: [
        { key: 'idNumber', label: 'מספר תעודת זהות', kind: 'id',   required: true },
        { key: 'fullName', label: 'שם מלא',          kind: 'text', required: true },
        { key: 'address',  label: 'כתובת',           kind: 'text', multiline: true },
        { key: 'children', label: 'ילדים',           kind: 'text', multiline: true }
      ]
    },

    /* שלושה דגלים שמבודדים את הדרכון, וכולם שורות בטבלה ולא if בקוד:
       allowFiles: false  — DEC-01, מקור האמת לסריקה הוא נאביגו
       syncFields: false  — DEC-13, מספר הדרכון לא עוזב את המכשיר
       notify: false      — DEC-14, מופיע ברשימת התפוגות ולא בבאנר היומי */
    passport: {
      label: 'דרכון', icon: 'i-passport',
      entityTypes: ['person'], expiry: 'required', allowFiles: false, parse: 'mrz',
      syncFields: false, notify: false,
      mrzFormat: 'TD3',
      mrzMap: { passportNumber: 'documentNumber', fullNameLatin: 'nameEn', birthDate: 'birthDate' },
      fields: [
        { key: 'passportNumber', label: 'מספר דרכון', kind: 'passport', required: true },
        { key: 'fullNameLatin',  label: 'שם באנגלית', kind: 'text' },
        { key: 'birthDate',      label: 'תאריך לידה', kind: 'date' }
      ]
    },

    driving_license: {
      label: 'רישיון נהיגה', icon: 'i-license',
      entityTypes: ['person'], expiry: 'required', allowFiles: true, parse: 'gemini',
      fields: [
        { key: 'idNumber',      label: 'מספר תעודת זהות', kind: 'id', required: true },
        { key: 'licenseNumber', label: 'מספר רישיון',     kind: 'text' },
        { key: 'classes',       label: 'דרגות',           kind: 'text' }
      ]
    },

    vehicle_license: {
      label: 'רישיון רכב', icon: 'i-car',
      entityTypes: ['vehicle'], expiry: 'required', allowFiles: true, parse: 'gemini',
      titleFrom: 'makeModel',
      fields: [
        { key: 'plate',     label: 'מספר רישוי', kind: 'plate', required: true },
        { key: 'vin',       label: 'מספר שלדה',  kind: 'text' },
        { key: 'makeModel', label: 'יצרן ודגם',  kind: 'text' },
        { key: 'year',      label: 'שנת ייצור',  kind: 'text' },
        { key: 'ownerName', label: 'בעלים',      kind: 'text' }
      ]
    },

    vehicle_test: {
      label: 'טסט', icon: 'i-gauge',
      entityTypes: ['vehicle'], expiry: 'required', allowFiles: true, parse: 'gemini',
      fields: [
        { key: 'plate',   label: 'מספר רישוי', kind: 'plate', required: true },
        { key: 'station', label: 'תחנת בדיקה', kind: 'text' },
        { key: 'mileage', label: 'קילומטראז׳', kind: 'text' }
      ]
    },

    vehicle_insurance: {
      label: 'ביטוח רכב', icon: 'i-shield',
      entityTypes: ['vehicle'], expiry: 'required', allowFiles: true, parse: 'gemini',
      titleFrom: 'insurer',
      fields: [
        { key: 'policyNumber', label: 'מספר פוליסה', kind: 'policy', required: true },
        { key: 'insurer',      label: 'חברת ביטוח',  kind: 'text',   required: true },
        { key: 'plate',        label: 'מספר רישוי',  kind: 'plate' },
        { key: 'coverage',     label: 'סוג כיסוי',   kind: 'text' },
        { key: 'agentName',    label: 'סוכן',        kind: 'text' },
        { key: 'agentPhone',   label: 'טלפון סוכן',  kind: 'phone' }
      ]
    },

    home_insurance: {
      label: 'ביטוח דירה', icon: 'i-home',
      entityTypes: ['home'], expiry: 'required', allowFiles: true, parse: 'gemini',
      titleFrom: 'insurer',
      fields: [
        { key: 'policyNumber', label: 'מספר פוליסה', kind: 'policy', required: true },
        { key: 'insurer',      label: 'חברת ביטוח',  kind: 'text',   required: true },
        { key: 'address',      label: 'כתובת הנכס',  kind: 'text',   multiline: true },
        { key: 'coverage',     label: 'סוג כיסוי',   kind: 'text' },
        { key: 'agentPhone',   label: 'טלפון סוכן',  kind: 'phone' }
      ]
    },

    life_insurance: {
      label: 'ביטוח בריאות / חיים', icon: 'i-heart',
      entityTypes: ['person'], expiry: 'optional', allowFiles: true, parse: 'gemini',
      titleFrom: 'insurer',
      fields: [
        { key: 'policyNumber', label: 'מספר פוליסה', kind: 'policy', required: true },
        { key: 'insurer',      label: 'חברה',        kind: 'text',   required: true },
        { key: 'insuredName',  label: 'שם המבוטח',   kind: 'text' },
        { key: 'agentPhone',   label: 'טלפון סוכן',  kind: 'phone' }
      ]
    },

    hmo_card: {
      label: 'כרטיס קופת חולים', icon: 'i-cross',
      entityTypes: ['person'], expiry: 'optional', allowFiles: true, parse: 'gemini',
      titleFrom: 'hmo',
      fields: [
        { key: 'idNumber',     label: 'מספר תעודת זהות', kind: 'id',   required: true },
        { key: 'hmo',          label: 'קופת חולים',      kind: 'text', required: true },
        { key: 'memberNumber', label: 'מספר חבר',        kind: 'text' },
        { key: 'clinic',       label: 'מרפאה',           kind: 'text' }
      ]
    },

    diploma: {
      label: 'תעודה / דיפלומה', icon: 'i-cert',
      entityTypes: ['person'], expiry: 'none', allowFiles: true, parse: 'gemini',
      titleFrom: 'title',
      fields: [
        { key: 'title',        label: 'שם התעודה', kind: 'text', required: true },
        { key: 'institution',  label: 'מוסד',      kind: 'text' },
        { key: 'fieldOfStudy', label: 'תחום',      kind: 'text' }
      ]
    },

    /* שני הסוגים הבאים נולדו מהמראה של התקציב (DEC-47): אלה המסמכים של
       דירה בבנייה שיש בהם משהו לכספת — תפוגה, או מספר שמעתיקים. */
    sale_guarantee: {
      label: 'ערבות חוק המכר', icon: 'i-bank',
      entityTypes: ['home'], expiry: 'optional', allowFiles: true, parse: 'gemini',
      fields: [
        { key: 'guaranteeNumber', label: 'מספר ערבות', kind: 'text', required: true },
        { key: 'bank',            label: 'בנק מנפיק',  kind: 'text', required: true },
        { key: 'amount',          label: 'סכום',       kind: 'text' },
        { key: 'developer',       label: 'יזם',        kind: 'text' }
      ]
    },

    purchase_contract: {
      label: 'חוזה רכישה', icon: 'i-sign',
      entityTypes: ['home'], expiry: 'none', allowFiles: true, parse: 'gemini',
      titleFrom: 'seller',
      fields: [
        { key: 'seller',  label: 'מוכר / יזם',  kind: 'text', required: true },
        { key: 'address', label: 'כתובת הנכס', kind: 'text', multiline: true },
        { key: 'price',   label: 'מחיר',       kind: 'text' },
        { key: 'lawyer',  label: 'עורך דין',   kind: 'text' }
      ]
    },

    /* שסתום הביטחון.

       `openFields` הוא ההבדל בין שסתום לבין חור בקיר: תעודה שאין לה שורה
       בטבלה מגיעה לכאן, ובלי הדגל הזה כל מה שנקרא ממנה — חוץ משלושת
       השדות למטה — נזרק בשקט. עם הדגל, שדה שאין לו עמודה נשמר כפי שהוא,
       עם התווית שהופיעה במסמך. הדגל אינו מזכיר אף סוג, ולכן סוג פתוח נוסף
       הוא עדיין שורה בטבלה. */
    generic: {
      label: 'מסמך כללי', icon: 'i-file',
      entityTypes: ['person', 'vehicle', 'home', 'other'],
      expiry: 'optional', allowFiles: true, parse: 'gemini',
      titleFrom: 'title', openFields: true,
      fields: [
        { key: 'title',     label: 'כותרת',      kind: 'text', required: true },
        { key: 'issuer',    label: 'גורם מנפיק', kind: 'text' },
        { key: 'reference', label: 'מספר אסמכתא', kind: 'text' }
      ]
    }
  };

  /* מפתח נשמר גם בתוך השורה, כדי שאפשר יהיה להעביר שורה בלי המפתח שלה */
  Object.keys(T).forEach(function (k) { T[k].key = k; });

  var API = {
    all: function () { return Object.keys(T).map(function (k) { return T[k]; }); },
    get: function (key) { return T[key] || null; },
    label: function (key) { return T[key] ? T[key].label : 'מסמך'; },
    icon: function (key) { return T[key] ? T[key].icon : 'i-file'; },
    forEntityType: function (etype) {
      return API.all().filter(function (t) { return t.entityTypes.indexOf(etype) !== -1; });
    },
    hasExpiry: function (key) { return T[key] ? T[key].expiry !== 'none' : false; },

    /* ברירת המחדל של שני הדגלים היא "כן" — סוג צריך לוותר במפורש */
    syncFields: function (key) { return T[key] ? T[key].syncFields !== false : true; },
    notify: function (key) { return T[key] ? T[key].notify !== false : true; },

    /* סוג שמקבל שדות שאינם בעמודות שלו. ברירת המחדל היא "לא" — סוג
       מוגדר היטב לא אמור לצבור שדות שאיש לא הגדיר. */
    openFields: function (key) { return !!(T[key] && T[key].openFields); },

    /* תווית קריאה למפתח שדה, מכל מקום בטבלה. מודל שמחזיר `idNumber` על
       מסמך פתוח אינו מתאר תקלה — הוא מתאר שדה שיש לו שם בעברית בשורה
       אחרת. בלי החיפוש הזה השורה הייתה מוצגת כ-idNumber. */
    fieldLabel: function (key) {
      var hit = null;
      API.all().forEach(function (t) {
        t.fields.forEach(function (f) { if (!hit && f.key === key) hit = f.label; });
      });
      return hit;
    },

    /* פורמט ה-MRZ קובע את סוג המסמך, ולא להפך: TD3 הוא דרכון, TD1 הוא ת״ז */
    byMrzFormat: function (format) {
      return API.all().filter(function (t) { return t.mrzFormat === format; })[0] || null;
    }
  };

  window.DOC_TYPES = API;
})();
