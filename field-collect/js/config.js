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
