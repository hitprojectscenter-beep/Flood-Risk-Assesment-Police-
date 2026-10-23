// בדיקות QA פונקציונליות — יומן שטח (Playwright, מצב הדגמה)
// הרצה:  cd field-collect && python -m http.server 5090 &   node qa/qa.mjs
// משתני סביבה:
//   QA_URL   כתובת היישום (ברירת מחדל http://localhost:5090/)
//   QA_LIBS  תיקייה עם leaflet / markercluster / fonts מקומיים — לסביבה ללא גישה ל-CDN
//   QA_SHOTS תיקייה לצילומי מסך (אופציונלי)
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (_) { pw = createRequire('/opt/node-tools/node_modules/')('playwright'); }
const { chromium, devices } = pw;

const BASE = (process.env.QA_URL || 'http://localhost:5090/').replace(/\?.*$/, '');
const LIBS = process.env.QA_LIBS;
const SHOTS = process.env.QA_SHOTS;

const results = [];
let section = '';
const check = (name, ok, detail = '') => {
    results.push({ section, name, ok: !!ok, detail });
    console.log(`${ok ? '  ✅' : '  ❌'} ${name}${!ok && detail ? '  — ' + detail : ''}`);
};
const group = name => { section = name; console.log('\n▶ ' + name); };

async function routeOffline(ctx) {
    if (!LIBS) return;
    await ctx.route(/unpkg\.com/, r => {
        const m = r.request().url().match(/unpkg\.com\/(leaflet(?:\.markercluster)?)@([\d.]+)\/(.*)$/);
        const p = m && `${LIBS}/${m[1]}-${m[2]}/package/${m[3]}`;
        if (!p || !fs.existsSync(p)) return r.abort();
        r.fulfill({ body: fs.readFileSync(p), contentType: p.endsWith('.css') ? 'text/css' : p.endsWith('.png') ? 'image/png' : 'application/javascript' });
    });
    await ctx.route(/fonts\.googleapis\.com/, r => {
        const u = r.request().url();
        if (u.includes('Material')) return r.fulfill({ contentType: 'text/css', body: "@font-face{font-family:'Material Symbols Outlined';src:url(https://fonts.gstatic.com/ms.woff2) format('woff2');font-weight:100 700;}" });
        r.fulfill({ contentType: 'text/css', body: [300, 400, 500, 700, 800, 900].map(w => `@font-face{font-family:'Heebo';font-weight:${w};src:url(https://fonts.gstatic.com/heebo-${w}.woff2) format('woff2');}`).join('') });
    });
    await ctx.route(/fonts\.gstatic\.com/, r => {
        const u = r.request().url();
        const p = u.endsWith('ms.woff2') ? `${LIBS}/material-symbols-0.27.0/package/material-symbols-outlined.woff2`
            : `${LIBS}/fontsource-heebo-5.1.0/package/files/heebo-hebrew-${u.match(/heebo-(\d+)/)[1]}-normal.woff2`;
        fs.existsSync(p) ? r.fulfill({ body: fs.readFileSync(p), contentType: 'font/woff2' }) : r.abort();
    });
    await ctx.route(/esm\.sh|supabase\.co|tile\.|arcgisonline|cartocdn|israelhiking/, r => r.abort());
}

async function newPage(b, device, extra = {}) {
    const ctx = await b.newContext({
        ...device, locale: 'he-IL', serviceWorkers: 'block',
        geolocation: { latitude: 31.5245, longitude: 34.5953, accuracy: 7 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
        acceptDownloads: true, ...extra
    });
    await routeOffline(ctx);
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('dialog', d => d.accept());
    return { ctx, page };
}
const shot = async (page, n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const isOpen = (page, id) => page.evaluate(i => document.getElementById(i).classList.contains('open'), id);
const txt = (page, sel) => page.textContent(sel).then(t => (t || '').trim());
const wait = ms => new Promise(r => setTimeout(r, ms));

async function login(page, first = 'דנה', last = 'כהן', phone = '050-1234567') {
    await page.fill('#authFirst', first); await page.fill('#authLast', last); await page.fill('#authPhone', phone);
    await page.click('#authSubmit'); await wait(400);
    const code = (await txt(page, '.demo-code b'));
    await page.fill('#otpCode', code); await wait(700);
}

const b = await chromium.launch();
const { ctx, page } = await newPage(b, devices['Pixel 7']);
const img = fs.readFileSync(new URL('./fixture.jpg', import.meta.url));

// ---------------------------------------------------------------------------
group('טעינה ומסך פתיחה');
await page.goto(BASE + '?demo', { waitUntil: 'domcontentloaded' });
await wait(1500);
check('מסך הפתיחה מוצג', await page.isVisible('#splash'));
check('כפתור "כניסה למפה" גלוי', await page.evaluate(() => getComputedStyle(document.getElementById('splashGo')).opacity) > 0.9);
check('מצב הדגמה מזוהה ומוצג', (await txt(page, '#modeBanner')).includes('מצב הדגמה'));
await shot(page, 'qa-01-splash');
await page.click('#splashGo'); await wait(900);
check('מסך הפתיחה נסגר', await page.evaluate(() => document.getElementById('splash').classList.contains('gone')));
check('המפה נטענה (Leaflet)', await page.evaluate(() => !!document.querySelector('.leaflet-container')));
check('כפתורי הסרגל התחתון קיימים', (await page.locator('.dock .dock-btn').count()) === 4 && await page.isVisible('#addBtn'));
await page.click('#modeBanner');

// ---------------------------------------------------------------------------
group('שכבות מפה');
await page.click('#layersBtn'); await wait(500);
check('גיליון השכבות נפתח', await isOpen(page, 'layersSheet'));
const cards = await page.locator('#baseLayers .layer-card').allTextContents();
check('שכבת OSM קיימת', cards.some(t => t.includes('OpenStreetMap')));
check('שכבת אורתופוטו מפ"י קיימת', cards.some(t => t.includes('אורתופוטו')));
check('שכבת מבנים קיימת', (await txt(page, '#overlayLayers')).includes('מבנים'));
await page.click('#baseLayers .layer-card[data-key=mapi_ortho]'); await wait(300);
check('החלפת רקע לאורתופוטו', await page.evaluate(() => document.querySelector('[data-key=mapi_ortho]').classList.contains('active')));
check('הבחירה נשמרת', await page.evaluate(() => localStorage.getItem('fc_base2')) === 'mapi_ortho');
await page.click('#baseLayers .layer-card[data-key=osm]');
const bDisabled = await page.locator('#overlayLayers input[data-key=mapi_buildings]').isDisabled();
const bHasUrl = await page.evaluate(async () => (await import('./js/config.js')).LAYERS.find(l => l.id === 'mapi_buildings').url);
check('שכבת מבנים: מושבתת כל עוד אין כתובת שירות', bHasUrl ? !bDisabled : bDisabled);
await shot(page, 'qa-02-layers');
await page.click('#layersSheet .sheet-close'); await wait(400);

// ---------------------------------------------------------------------------
group('הזדהות: שם, שם משפחה, נייד + קוד SMS');
await page.click('#addBtn'); await wait(500);
check('דקירה ללא הזדהות פותחת את מסך ההזדהות', await isOpen(page, 'authSheet'));
check('מוצגת הודעה שנדרשת הזדהות', (await txt(page, '#authNote')).length > 0);
await page.click('#authSubmit');
check('אימות: שם פרטי חובה', (await txt(page, '#authMsg')).includes('שם פרטי'));
await page.fill('#authFirst', 'דנה'); await page.click('#authSubmit');
check('אימות: שם משפחה חובה', (await txt(page, '#authMsg')).includes('שם משפחה'));
await page.fill('#authLast', 'כהן');
for (const bad of ['12345', '0312345678', '05012345', 'abc']) {
    await page.fill('#authPhone', bad); await page.click('#authSubmit');
    check(`אימות: נייד לא תקין נדחה (${bad})`, (await txt(page, '#authMsg')).includes('לא תקין'));
}
await page.fill('#authPhone', '+972 50-123-4567'); await page.click('#authSubmit'); await wait(400);
check('נייד בפורמט בינ"ל מתקבל ועובר לשלב הקוד', !(await page.isHidden('#otpForm')));
check('המספר מוצג בפורמט מקומי', (await txt(page, '#otpPhone')) === '050-1234567');
check('ספירה לאחור לשליחה חוזרת', await page.locator('#otpResend').isDisabled());
const demoCode = await txt(page, '.demo-code b');
check('במצב הדגמה מוצג קוד בן 6 ספרות', /^\d{6}$/.test(demoCode));
await page.fill('#otpCode', '12'); await page.click('#otpSubmit');
check('קוד קצר נדחה', (await txt(page, '#otpMsg')).includes('6 ספרות'));
const wrong = demoCode === '000000' ? '111111' : '000000';
await page.fill('#otpCode', wrong); await wait(600);
check('קוד שגוי נדחה', (await txt(page, '#otpMsg')).includes('שגוי'));
check('לא מחובר אחרי קוד שגוי', !(await page.evaluate(() => document.getElementById('userBtn').classList.contains('logged'))));
await page.click('#otpBack');
check('"שינוי מספר" חוזר לשלב 1', !(await page.isHidden('#authForm')));
await page.click('#authSubmit'); await wait(400);
const code2 = await txt(page, '.demo-code b');
await shot(page, 'qa-03-otp');
await page.fill('#otpCode', code2); await wait(800);   // שליחה אוטומטית ב-6 ספרות
check('קוד נכון → מחובר', await page.evaluate(() => document.getElementById('userBtn').classList.contains('logged')));
check('שם המשתמש מוצג בכותרת', (await txt(page, '#userBtnLabel')) === 'דנה כהן');
check('אחרי הכניסה ממשיכים לדקירה', await page.evaluate(() => document.body.classList.contains('placing')));

// ---------------------------------------------------------------------------
group('דקירת נקודה והזנת נתונים');
await page.click('#placeGpsBtn'); await wait(1200);
check('דקירה לפי GPS פותחת טופס', await isOpen(page, 'formSheet'));
check('קואורדינטות GPS + דיוק מוצגות', (await txt(page, '#formCoords')).includes('31.524500') && (await txt(page, '#formCoords')).includes('±7m'));
check('שם המזין ממולא מהזיהוי', (await page.inputValue('#fReporter')) === 'דנה כהן');
await page.click('#formSubmit');
check('אימות: שם מיקום חובה', (await txt(page, '#formMsg')).includes('שם מיקום'));
await page.fill('#fName', 'גשר <img src=x onerror=alert(1)>');
await page.fill('#fNotes', 'שורה 1\nשורה 2');
check('4 שדות נוספים בטופס', (await page.locator('#extraFields input').count()) === 4);
await page.fill('#x_site_type', 'מבנה ציבור'); await page.fill('#x_project_status', 'בביצוע');
await page.fill('#x_org_unit', 'מערך הנדסה'); await page.fill('#x_tkuma_contact', 'רונית לוי 050-0000000');
await page.setInputFiles('#fPhotos', [1, 2, 3].map(i => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: img })));
await wait(1200);
check('צירוף 3 תמונות', (await page.locator('#photoGrid .thumb').count()) === 3);
await page.locator('#photoGrid .thumb button').first().click();
check('הסרת תמונה מהטופס', (await page.locator('#photoGrid .thumb').count()) === 2);
await page.setInputFiles('#fPhotos', Array.from({ length: 12 }, (_, i) => ({ name: `m${i}.jpg`, mimeType: 'image/jpeg', buffer: img })));
await wait(3500);
check('מגבלה: עד 10 תמונות לנקודה', (await page.locator('#photoGrid .thumb').count()) === 10);
check('כפתורי הוספת תמונה נעלמים במכסה מלאה', await page.isHidden('#photoAddGallery'));
for (let i = 0; i < 7; i++) await page.locator('#photoGrid .thumb button').first().click();
await shot(page, 'qa-04-form');
await page.click('#formSubmit'); await wait(1500);
check('הנקודה נשמרה ונפתח כרטיס פרטים', await isOpen(page, 'detailSheet'));
check('XSS: שם המיקום מוצג כטקסט ולא כ-HTML', (await txt(page, '.detail-title')).includes('<img') && !(await page.locator('.detail-title img').count()));
check('השדות הנוספים מוצגים בכרטיס', (await txt(page, '.info-grid')).includes('סוג אתר') && (await txt(page, '.info-grid')).includes('מערך הנדסה'));
check('3 תמונות בכרטיס', (await page.locator('#detailBody .dphoto').count()) === 3);
check('קישור ישיר לנקודה ב-URL', /[?&]p=/.test(page.url()));
check('מונה הנקודות עודכן', (await page.evaluate(() => document.getElementById('pointCount').dataset.n)) === '1');
await shot(page, 'qa-05-detail');

// ---------------------------------------------------------------------------
group('צפייה בפרטים');
await page.locator('#detailBody .dphoto').first().click(); await wait(300);
check('תצוגת תמונה במסך מלא', await page.isVisible('#lightbox'));
check('מונה תמונות 1/3', (await txt(page, '#lbCount')) === '1 / 3');
await page.click('.lb-next');
check('מעבר לתמונה הבאה', (await txt(page, '#lbCount')) === '2 / 3');
await page.click('.lb-close');
check('סגירת התצוגה', await page.isHidden('#lightbox'));
const nav = await page.getAttribute('#detailBody a[href*="google.com/maps"]', 'href');
check('קישור ניווט Google Maps', nav && nav.includes('31.5245'));
check('קישור Waze', !!(await page.getAttribute('#detailBody a[href*="waze.com"]', 'href')));
await page.click('[data-act=copy]'); await wait(200);
check('העתקת קואורדינטות', (await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))).includes('31.524500'));
check('כפתורי עריכה ומחיקה למזין', (await page.locator('[data-act=edit]').count()) === 1 && (await page.locator('[data-act=delete]').count()) === 1);

// ---------------------------------------------------------------------------
group('עריכה');
await page.click('[data-act=edit]'); await wait(600);
check('טופס עריכה נפתח עם הנתונים', (await txt(page, '#formTitle')) === 'עריכת נקודה' && (await page.inputValue('#fName')).startsWith('גשר'));
check('עריכה: השדות הנוספים נטענים', (await page.inputValue('#x_project_status')) === 'בביצוע');
await page.fill('#x_project_status', 'הושלם');
await page.fill('#fName', 'גשר הירקון'); await page.fill('#fNotes', 'עודכן בבדיקה');
await page.locator('#photoGrid .thumb button').first().click();
await page.click('#formSubmit'); await wait(1200);
check('עריכה: שדה נוסף עודכן', (await txt(page, '.info-grid')).includes('הושלם'));
check('השינויים נשמרו', (await txt(page, '.detail-title')) === 'גשר הירקון' && (await txt(page, '.detail-notes')) === 'עודכן בבדיקה');
check('מספר התמונות עודכן ל-2', (await page.locator('#detailBody .dphoto').count()) === 2);
await page.click('#detailSheet .sheet-close'); await wait(400);

// ---------------------------------------------------------------------------
group('דקירה בהקשה על המפה');
await page.click('#addBtn'); await wait(300);
const box = await page.locator('#map').boundingBox();
await page.mouse.click(box.x + box.width / 2 + 50, box.y + box.height / 2 - 80); await wait(700);
check('הקשה על המפה פותחת טופס חדש', await isOpen(page, 'formSheet') && (await txt(page, '#formTitle')) === 'נקודה חדשה');
check('נקודה ללא GPS — ללא נתון דיוק', !(await txt(page, '#formCoords')).includes('±'));
await page.click('#x_site_type'); await wait(200);
check('השלמה אוטומטית: מוצעים ערכים קיימים בפוקוס', (await page.locator('#x_site_type + .ac-list li').allTextContents()).includes('מבנה ציבור'));
await page.fill('#x_site_type', 'ציב'); await wait(200);
check('השלמה אוטומטית: סינון לפי הקלדה', (await page.locator('#x_site_type + .ac-list li').count()) === 1);
await page.locator('#x_site_type + .ac-list li').first().dispatchEvent('pointerdown'); await wait(150);
check('השלמה אוטומטית: בחירת הצעה ממלאת את השדה', (await page.inputValue('#x_site_type')) === 'מבנה ציבור');
await page.fill('#x_org_unit', 'ערך חדש לגמרי');
check('טקסט חופשי: ניתן להזין ערך שאינו ברשימה', (await page.inputValue('#x_org_unit')) === 'ערך חדש לגמרי');
await page.fill('#fName', 'צומת מוצף'); await page.fill('#fNotes', 'מים "עמוקים", זהירות'); await page.click('#formSubmit'); await wait(1200);
await page.click('#detailSheet .sheet-close'); await wait(400);
check('2 סמנים על המפה', (await page.locator('.leaflet-marker-icon .pin').count()) >= 1 && (await page.evaluate(() => document.getElementById('pointCount').dataset.n)) === '2');

// ---------------------------------------------------------------------------
group('רשימה, חיפוש וייצוא');
await page.click('#listBtn'); await wait(500);
check('הרשימה מציגה 2 נקודות', (await page.locator('#pointList li[data-id]').count()) === 2);
await page.fill('#listSearch', 'ירקון'); await wait(200);
check('חיפוש מסנן', (await page.locator('#pointList li[data-id]').count()) === 1);
await page.fill('#listSearch', 'לא-קיים-בכלל'); await wait(200);
await page.fill('#listSearch', 'ערך חדש'); await wait(200);
check('חיפוש לפי שדה נוסף', (await page.locator('#pointList li[data-id]').count()) === 1);
check('תגיות סוג/סטטוס ברשימה', (await page.locator('#pointList .li-tags span').count()) >= 1);
await page.fill('#listSearch', 'לא-קיים-בכלל'); await wait(200);
check('חיפוש ללא תוצאות', (await txt(page, '#pointList')).includes('לא נמצאו'));
await page.fill('#listSearch', '');
await page.check('#listMine'); await wait(200);
check('סינון "שלי בלבד"', (await page.locator('#pointList li[data-id]').count()) === 2);
await page.uncheck('#listMine');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportCsv')]);
const csv = fs.readFileSync(await dl.path(), 'utf8');
check('CSV: שם קובץ', /^field-points-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()));
check('CSV: BOM לעברית באקסל', csv.charCodeAt(0) === 0xFEFF);
check('CSV: כותרות בעברית', csv.includes('"שם המיקום"') && csv.includes('"שם המזין"') && csv.includes('"קישור למפה"'));
check('CSV: עמודות השדות הנוספים', ['"סוג אתר"', '"סטטוס הפרויקט"', '"שיוך למערך"', '"איש/אשת קשר במנהלת תקומה"'].every(h => csv.includes(h)) && csv.includes('"מערך הנדסה"'));
check('CSV: 2 שורות נתונים', csv.trim().split(/\r\n(?=")/).length === 3);
check('CSV: מרכאות ופסיקים מוגנים', csv.includes('"מים ""עמוקים"", זהירות"'));
check('CSV: קישור Google Maps', csv.includes('https://www.google.com/maps?q='));
const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#exportGeojson')]);
const gj = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8'));
check('GeoJSON תקין עם 2 נקודות', gj.type === 'FeatureCollection' && gj.features.length === 2 && gj.features[0].geometry.type === 'Point');
check('GeoJSON: השדות הנוספים', gj.features.every(f => 'site_type' in f.properties && 'tkuma_contact' in f.properties));
await shot(page, 'qa-06-list');

// ---------------------------------------------------------------------------
group('מחיקה');
await page.locator('#pointList li[data-id]', { hasText: 'צומת' }).click(); await wait(800);
await page.click('[data-act=delete]'); await wait(900);
check('הנקודה נמחקה', (await page.evaluate(() => document.getElementById('pointCount').dataset.n)) === '1');

// ---------------------------------------------------------------------------
group('פרופיל והתנתקות');
await page.click('#userBtn'); await wait(400);
check('פרופיל: שם ונייד', (await txt(page, '#profName')) === 'דנה כהן' && (await txt(page, '#profPhone')) === '050-1234567');
check('פרופיל: מונה נקודות', (await txt(page, '#profStats')).includes('1'));
await page.click('#logoutBtn'); await wait(500);
check('התנתקות', !(await page.evaluate(() => document.getElementById('userBtn').classList.contains('logged'))));

// ---------------------------------------------------------------------------
group('צפייה ציבורית ללא הזדהות');
await page.goto(BASE + '?demo', { waitUntil: 'domcontentloaded' }); await wait(1500);
check('מסך הפתיחה לא חוזר באותה לשונית', await page.isHidden('#splash') || await page.evaluate(() => document.getElementById('splash').classList.contains('gone')));
check('הנקודות גלויות ללא הזדהות', (await page.evaluate(() => document.getElementById('pointCount').dataset.n)) === '1');
await page.click('#listBtn'); await wait(400);
await page.locator('#pointList li[data-id]').first().click(); await wait(700);
check('פרטי נקודה פתוחים לצפייה', await isOpen(page, 'detailSheet'));
check('אין כפתורי עריכה/מחיקה לצופה', (await page.locator('[data-act=edit], [data-act=delete]').count()) === 0);
const deep = page.url();
// קישור ישיר בלשונית חדשה (באותו מכשיר — במצב הדגמה הנתונים מקומיים)
const p3 = await ctx.newPage(); p3.errors = []; p3.on('pageerror', e => p3.errors.push(e.message));
await p3.goto(deep, { waitUntil: 'domcontentloaded' }); await wait(1500);
check('קישור ישיר (?p=) פותח את הנקודה ומדלג על מסך הפתיחה', await isOpen(p3, 'detailSheet') && await p3.isHidden('#splash'));
await p3.close();

// משתמש אחר לא יכול לערוך נקודה של אחר
await page.click('#detailSheet .sheet-close'); await wait(300);
await page.click('#userBtn'); await wait(300);
await login(page, 'יוסי', 'לוי', '052-7654321');
await page.click('#listBtn'); await wait(400);
await page.locator('#pointList li[data-id]').first().click(); await wait(700);
check('משתמש אחר אינו רואה עריכה/מחיקה לנקודה שאינה שלו', (await page.locator('[data-act=edit]').count()) === 0);
check('אין שגיאות JavaScript (מובייל)', page.errors.length === 0, page.errors.join(' | '));
await ctx.close();

// ---------------------------------------------------------------------------
group('דסקטופ');
const { ctx: dctx, page: d } = await newPage(b, { viewport: { width: 1440, height: 900 } });
await d.goto(BASE + '?demo', { waitUntil: 'domcontentloaded' }); await wait(1200);
await d.click('#splashGo'); await wait(800);
await d.click('#listBtn'); await wait(500);
const sb = await d.locator('#listSheet').boundingBox();
check('דסקטופ: הגיליון מוצג כפאנל צד', sb && sb.width <= 460 && sb.x > 900);
check('דסקטופ: הסרגל התחתון נשאר גלוי עם פאנל פתוח', await d.evaluate(() => getComputedStyle(document.querySelector('.dock')).opacity) > 0.9);
await shot(d, 'qa-07-desktop');
check('אין שגיאות JavaScript (דסקטופ)', d.errors.length === 0, d.errors.join(' | '));
await dctx.close();
await b.close();

// ---------------------------------------------------------------------------
const failed = results.filter(r => !r.ok);
console.log(`\n══════ QA: ${results.length - failed.length}/${results.length} עברו ══════`);
failed.forEach(f => console.log(`❌ [${f.section}] ${f.name} ${f.detail}`));
process.exit(failed.length ? 1 : 0);
