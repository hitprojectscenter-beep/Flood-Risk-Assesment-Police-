// הקטנת תמונות בצד-לקוח לפני העלאה — חוסך נפח ונתונים סלולריים בשטח.
import { PHOTO_MAX_DIM, PHOTO_QUALITY } from './config.js';

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('לא ניתן לקרוא את התמונה')); };
        img.src = url;
    });
}

// מחזיר Blob מסוג JPEG. הדפדפן מיישם את כיוון ה-EXIF אוטומטית בציור ל-canvas.
export async function resizeImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('הקובץ אינו תמונה');
    let src;
    try {
        src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) {
        src = await loadImage(file);
    }
    const w = src.width, h = src.height;
    const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    canvas.getContext('2d').drawImage(src, 0, 0, cw, ch);
    if (src.close) src.close();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', PHOTO_QUALITY));
    if (!blob) throw new Error('הקטנת התמונה נכשלה');
    // אם המקור כבר קטן יותר (JPEG דחוס) — נשמור את המקור
    return (file.type === 'image/jpeg' && file.size <= blob.size) ? file : blob;
}
