/* config.js — קבועים. אין תלות באיש. */
(function () {
  'use strict';

  window.CONFIG = {
    APP_NAME: 'התיק המשפחתי',

    /* מסך הבית. הניתוב, ברירת המחדל, סדר הסרגל והבאנר היומי נגזרים ממנו,
       כדי שהחלפת מסך בית תהיה שורה אחת ולא ציד אחר מופעים. */
    HOME: 'entities',
    /* מקור אחד. index.html מציב אותו, `node tools/bump.mjs` כותב אותו. */
    VERSION: window._BUNDLE_VERSION || '0.0.0',

    DB_NAME: 'DocVaultDB',
    DB_VERSION: 1,

    /* נרמול תמונות — SPEC §7.2 */
    IMAGE_MAX_EDGE: 2400,
    IMAGE_PASS_BYTES: 800 * 1024,
    JPEG_QUALITY: 0.85,

    /* אווטאר של ישות — נשמר כ-data URL על הרשומה עצמה ולא כ-blob נפרד,
       כדי שהוא יצויר בפריים הראשון ויסתנכרן עם הישות.
       **הצלע הקצרה** היא שנקבעת: התמונה נשמרת שלמה, והחיתוך לעיגול הוא
       `object-fit` בזמן תצוגה. כך אפשר להזיז את המסגרת גם אחרי הבחירה. */
    AVATAR_SHORT_EDGE: 256,
    AVATAR_QUALITY: 0.82,
    AVATAR_MAX_BYTES: 120 * 1024,
    /* מעל היחס הזה תמונה מרופדת לריבוע כבר בייבוא. DEC-41 */
    /* תקרת ההגדלה בבורר המסגרת. שלוש הוא הגבול שבו תמונה שנשמרה
       בצלע הקצרה עדיין נראית, ומעליו מגדילים פיקסלים ולא תוכן. */
    CROP_MAX_ZOOM: 3,
    /* רצפה מוחלטת לערך **שנשמר**. הרצפה שהמשתמש פוגש בבורר היא
       "כל התמונה נכנסת למסגרת", והיא נגזרת מהתמונה ולכן אינה קבוע. */
    CROP_MIN_ZOOM: 0.2,

    AVATAR_WIDE_RATIO: 1.5,
    AVATAR_SQUARE_EDGE: 384,

    RECENT_MAX: 6,

    /* ---- תקרות הפרסינג בענן — DEC-44 ----
       שלוש מספרים ולא אחד. תקרה אחת לכל המפל הייתה נותנת למודל הראשון
       שנתקע לבלוע את כל התקציב, ואז "המפל" לא רץ מעולם: המשתמש חיכה
       45 שניות וקיבל כישלון, בזמן ששני מודלים מהירים יותר עמדו בתור. */
    GEMINI_TIMEOUT_MS: 25000,   /* תקרה לניסיון בודד */
    GEMINI_TOTAL_MS: 75000,     /* תקרה לכל המפל, כולל גילוי המודלים */
    GEMINI_TRIES: 3,            /* כמה מודלים לכל היותר. הרשימה ארוכה בהרבה */

    /* ---- מה שנשלח בפועל ----
       המסמך נשמר ב-2400px, ונשלח קטן ממנו. גוגל מרצפת תמונה ל-768px
       לפני שהיא קוראת אותה, ולכן הפיקסלים העודפים אינם קונים דיוק —
       הם קונים שניות של העלאה ברשת סלולרית, וזה רוב ההמתנה. */
    GEMINI_EDGE: 1600,
    GEMINI_QUALITY: 0.75,
    /* מעל זה נעצרים לפני השליחה. base64 מנפח בשליש, ובקשה של עשרות
       מגה-בייט אינה נכשלת מהר — היא נכשלת אחרי דקה. */
    GEMINI_MAX_BYTES: 8 * 1024 * 1024,

    /* תקרת קובץ בגשר. base64 מנפח בשליש, ולתשובת Apps Script יש גבול —
       קובץ שחורג נעצר בצד הלקוח עם מספר, ולא נכשל אצל גוגל בלי הודעה. */
    BRIDGE_MAX_BYTES: 12 * 1024 * 1024,
    /* חייב להיות זהה ל-MIN_SECRET ב-tools/bridge.gs. הכתובת חשופה, ולכן
       הסוד הוא כל ההגנה, וסוד קצר נשבר בניחוש. */
    BRIDGE_MIN_SECRET: 16,
    /* תקרות זמן לבקשה. בלעדיהן בקשה שנתקעת תולה את הסנכרון לתמיד.
       הבלובים מקבלים תקרה גבוהה בהרבה — 12MB ברשת סלולרית איטית הם
       דקות, ולנתק העלאה תקינה זה גרוע יותר מלחכות לה. */
    NET_TIMEOUT_MS: 30 * 1000,
    NET_BLOB_TIMEOUT_MS: 4 * 60 * 1000,

    DEFAULT_PALETTE: 'a',
    DEFAULT_TYPEFACE: 'assistant',
    DEFAULT_AUTOLOCK_MINUTES: 5,

    /* מפתחות settings — SPEC §3.5 */
    K: {
      pinHash: 'pinHash',
      pinEnabled: 'pinEnabled',
      autoLockMinutes: 'autoLockMinutes',
      privacyMode: 'privacyMode',
      palette: 'palette',
      typeface: 'typeface',
      geminiKey: 'geminiKey',
      geminiConsentText: 'geminiConsentText',
      geminiConsentImage: 'geminiConsentImage',
      geminiConsentChat: 'geminiConsentChat',
      geminiLastModel: 'geminiLastModel',
      geminiModels: 'geminiModels',
      geminiModelsSeen: 'geminiModelsSeen',
      backupMode: 'backupMode',
      bridgeUrl: 'bridgeUrl',
      bridgeToken: 'bridgeToken',
      driveClientId: 'driveClientId',
      driveFolderId: 'driveFolderId',
      driveDbFileId: 'driveDbFileId',
      lastSync: 'lastSync',
      recentFields: 'recentFields',
      lastNoticeDay: 'lastNoticeDay',
      lastNoticeSig: 'lastNoticeSig'
    },

    /* המפתחות היחידים שממורים ל-localStorage — SPEC §3.5 */
    MIRRORED: ['palette', 'typeface'],
    LS_PREFIX: 'fv.',

    /* `group` הוא העמודה שקובעת איפה הסוג מוצג במסך הבית. DEC-39.
       מסך הבית מציג תמונות, ולתמונה של אדם ולתמונה של בית מגיעה מסגרת
       אחרת: פנים מזוהות בעיגול, ורכב או דירה בפס רחב. */
    ENTITY_TYPES: [
      { key: 'person',  label: 'אדם',  icon: 'i-person', group: 'people' },
      { key: 'vehicle', label: 'רכב',  icon: 'i-car',    group: 'assets' },
      { key: 'home',    label: 'בית',  icon: 'i-home',   group: 'assets' },
      { key: 'other',   label: 'אחר',  icon: 'i-doc',    group: 'assets' }
    ],

    /* קבוצות מסך הבית, לפי סדר התצוגה. אין להן תווית משלהן: התווית
       נבנית משמות הסוגים שיש להם ישויות בפועל, ולכן משפחה בלי רכב
       רואה "בית" ולא "רכב ובית". */
    ENTITY_GROUPS: [
      { key: 'people', layout: 'rail'  },
      { key: 'assets', layout: 'board' }
    ],

    /* עמומים בכוונה: אווטאר שמתחרה באקסנט הופך את מסך הבית לרועש */
    ENTITY_COLORS: [
      '#4B6B7A', '#8B6F47', '#7A5B7E', '#4F6B4A',
      '#8A5A5A', '#5B6480', '#7E6B3F', '#5F7370'
    ],

    PALETTES: [
      { key: 'a', label: 'אינדיגו־חציל', swatch: '#4A4080' },
      { key: 'b', label: 'פטרול עמוק',   swatch: '#1F5350' },
      { key: 'c', label: 'טרקוטה חרוכה', swatch: '#A9492E' }
    ],

    TYPEFACES: [
      { key: 'assistant', label: 'Assistant' },
      { key: 'system',    label: 'מחסנית מערכת' }
    ]
  };

  /* ---------- קובץ המפתחות — DEC-42 ----------
     מכשיר שני מקבל את ההגדרות בקובץ אחד במקום בהקלדה. הטבלה היא המקור
     היחיד: היא קובעת מה נכתב לקובץ, מה מוצג לפני האישור ומה נכתב
     ל-settings — כלומר **מפתח נייד נוסף הוא שורה כאן ואפס קוד חדש**.

     `secret` ממסך את הערך בתצוגה. `pref` מסמן העדפה ולא מפתח: היא
     נוסעת, אבל אינה מצדיקה קובץ בפני עצמה.

     היא יושבת מחוץ לליטרל מפני שהיא קוראת את `K`, ואובייקט אינו יכול
     להצביע על עצמו בזמן שהוא נבנה. */
  var K = window.CONFIG.K;
  window.CONFIG.KEYFILE = {
    APP: 'family-vault',
    KIND: 'keys',
    FORMAT: 1,
    FIELDS: [
      { key: K.backupMode, label: 'שיטת הגיבוי', type: 'enum', pref: true,
        options: [
          { key: 'bridge', label: 'גשר Apps Script' },
          { key: 'oauth',  label: 'התחברות לגוגל' }
        ] },
      { key: K.bridgeUrl,     label: 'כתובת הגשר',        type: 'text' },
      { key: K.bridgeToken,   label: 'סוד הגשר',          type: 'text', secret: true },
      { key: K.driveClientId, label: 'מזהה לקוח של גוגל', type: 'text' },
      { key: K.geminiKey,     label: 'מפתח Gemini',       type: 'text', secret: true },
      { key: K.geminiModels,  label: 'מפל המודלים',       type: 'list', pref: true }
    ]
  };
})();
