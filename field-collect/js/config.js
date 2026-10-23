// הגדרות חיבור ל-Supabase (מנוע ההרשמה והאחסון של field-nav-app).
// המפתח הוא ה-"publishable" (צד-לקוח) ומיועד לחשיפה בדפדפן; ההגנה על הנתונים
// נאכפת ע"י RLS במסד הנתונים (supabase/field_points.sql), לא ע"י הסתרת המפתח.
// אין לשים כאן את ה-service_role key.
//
// אם הטבלה field_points עוד לא נוצרה (או שאין חיבור), היישום עובר אוטומטית
// ל"מצב הדגמה" — הנתונים נשמרים במכשיר בלבד. אפשר לכפות מצב הדגמה עם ?demo

export const SUPABASE_URL = 'https://dxfxpsfhjfygxrkitnob.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_mrxqAF43tH7TSoHxnWIrVQ_fVScbqxV';

export const TABLE = 'field_points';
export const PHOTO_BUCKET = 'field-photos';

export const MAX_PHOTOS = 10;          // מקסימום תמונות לנקודה
export const PHOTO_MAX_DIM = 1600;     // הקטנת תמונה בצד-לקוח (פיקסלים, הצלע הארוכה)
export const PHOTO_QUALITY = 0.82;     // איכות JPEG

export const MAP_CENTER = [31.6, 34.95];
export const MAP_ZOOM = 8;

// ---------------------------------------------------------------------------
// מיתוג — לוגו מנהלת תקומה
// יש להניח את קובץ הלוגו הרשמי בנתיב LOGO_URL (PNG/SVG, רקע שקוף מומלץ).
// כל עוד הקובץ לא קיים — מוצג סמליל טקסט במקומו.
// ---------------------------------------------------------------------------
export const BRAND = {
    org: 'מנהלת תקומה',
    app: 'יומן שטח',
    tagline: 'איסוף נתונים חכם מהשטח',
    LOGO_URL: 'assets/tkuma-logo.png'
};

// ---------------------------------------------------------------------------
// שכבות מפה
// base    — שכבות רקע (נבחרת אחת)
// overlay — שכבות-על (ניתן להפעיל כמה)
// type: 'xyz' (תבנית {z}/{x}/{y}) או 'wms'
// שכבה בלי url מוצגת כ"ממתינה להגדרה" — כך מוסיפים את שירותי המרכז למיפוי
// ישראל (מפ"י) ברגע שמתקבלת כתובת השירות / מפתח GovMap לדומיין של היישום.
// ---------------------------------------------------------------------------
export const LAYERS = [
    {
        id: 'osm', group: 'base', label: 'OpenStreetMap', sub: 'מפת רחובות', icon: 'map',
        type: 'xyz', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        opt: { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }
    },
    {
        id: 'mapi_ortho', group: 'base', label: 'אורתופוטו', sub: 'המרכז למיפוי ישראל', icon: 'satellite_alt',
        type: 'xyz', url: '',            // ← כתובת שירות האורתופוטו של מפ"י
        opt: { maxZoom: 20, attribution: '© המרכז למיפוי ישראל' },
        // עד להגדרת שירות מפ"י — צילום אוויר חלופי, מסומן בבירור כחלופה
        fallback: {
            sub: 'זמני: Esri (עד חיבור מפ"י)',
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            opt: { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }
        }
    },
    {
        id: 'dark', group: 'base', label: 'לילה', sub: 'רקע כהה', icon: 'dark_mode',
        type: 'xyz', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        opt: { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' }
    },
    {
        id: 'mapi_buildings', group: 'overlay', label: 'מבנים', sub: 'המרכז למיפוי ישראל', icon: 'apartment',
        type: 'wms', url: '',            // ← כתובת שירות WMS של שכבת המבנים (מפ"י / GovMap)
        opt: { layers: '', format: 'image/png', transparent: true, minZoom: 14, maxZoom: 20, attribution: '© המרכז למיפוי ישראל' }
    }
];

// ---------------------------------------------------------------------------
// שדות נוספים לנקודה — טקסט חופשי עם השלמה אוטומטית.
// ההצעות נלקחות מ: (1) רשימת ערכים מנוהלת בטבלה field_options במסד הנתונים,
// (2) ערכים שכבר הוזנו בנקודות קיימות (לפי שכיחות).
// ---------------------------------------------------------------------------
export const EXTRA_FIELDS = [
    { key: 'site_type', label: 'סוג אתר', icon: 'category', placeholder: 'לדוגמה: מבנה ציבור, תשתית, מגורים' },
    { key: 'project_status', label: 'סטטוס הפרויקט', icon: 'flag', placeholder: 'לדוגמה: בתכנון, בביצוע, הושלם' },
    { key: 'org_unit', label: 'שיוך למערך', icon: 'account_tree', placeholder: 'המערך שאליו משויך האתר' },
    { key: 'tkuma_contact', label: 'איש/אשת קשר במנהלת תקומה', icon: 'contact_phone', placeholder: 'שם ופרטי קשר' }
];
