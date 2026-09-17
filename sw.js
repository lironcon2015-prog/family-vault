/* sw.js — מעטפת אופליין.
   CACHE_VERSION חייב להיות זהה ל-version.json ול-_BUNDLE_VERSION ב-index.html.
   `node tools/bump.mjs` כותב את שלושתם, ו-tests/pwa.mjs נכשל אם הם נפרדו. */
const CACHE_VERSION = '0.17.1';
const CACHE_NAME = 'family-vault-' + CACHE_VERSION;

/* המעטפת, הכתב, וצופה ה-PDF.
   גופני התחליף של pdf.js נטענים **עצלה** מתוך הספרייה, ולכן runtime caching
   לא תופס אותם — מסמך ייפתח אופליין עם אותיות חסרות והבאג ייראה כמו PDF פגום.
   זו אזהרה מפורשת שהגיעה מנאביגו, והיא הסיבה שהם ברשימה. */
const CORE = [
  './', './index.html', './style.css', './manifest.json',
  './fonts/assistant-hebrew.woff2', './fonts/assistant-latin.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './js/config.js', './js/util.js', './js/kinds.js', './js/doctypes.js',
  './js/versions.js', './js/share.js', './js/keyfile.js', './js/chat.js',
  './js/db.js', './js/settings.js', './js/vault.js', './js/files.js',
  './js/mrz.js', './js/gemini.js', './js/parse.js', './js/expiry.js',
  './js/drive.js', './js/bridge.js', './js/sync.js', './js/search.js', './js/ui.js',
  './js/forms.js', './js/screens.js', './js/app.js',
  './lib/pdfjs/pdf.min.js', './lib/pdfjs/pdf.worker.min.js',
  ...['FoxitDingbats', 'FoxitFixed', 'FoxitFixedBold', 'FoxitFixedBoldItalic', 'FoxitFixedItalic',
      'FoxitSerif', 'FoxitSerifBold', 'FoxitSerifBoldItalic', 'FoxitSerifItalic', 'FoxitSymbol']
    .map(f => `./lib/pdfjs/standard_fonts/${f}.pfb`),
  ...['Regular', 'Bold', 'Italic', 'BoldItalic']
    .map(f => `./lib/pdfjs/standard_fonts/LiberationSans-${f}.ttf`)
];

/* מה שנשאר ל-runtime cache במכוון:
   lib/tesseract  — 6.7MB שרובם לא ייגעו בהם לעולם. מורדים בסריקה הראשונה.
   lib/pdfjs/cmaps — 1.7MB, רלוונטי ל-PDF ביפנית או סינית בלבד. */

self.addEventListener('install', (e) => {
  /* cache:'no-cache' — למלא מהשרת ולא מ-HTTP cache שאולי מיושן.
     GitHub Pages מגיש max-age, וספארי מכבד אותו גם עבור קבצי הליבה. */
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.all(CORE.map(u =>
        fetch(u, { cache: 'no-cache' })
          .then(r => { if (r.ok) return c.put(u, r); })
          .catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* דומיין זר — גוגל, ג׳מיני, ההתחברות. לעולם לא נכנס לקאש. */
  if (url.origin !== location.origin) return;

  /* version.json הוא מקור האמת מהשרת, ולכן תמיד מהרשת. */
  if (url.pathname.endsWith('/version.json')) return;

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
      }
      return res;
    }).catch(() => {
      if (req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }))
  );
});
