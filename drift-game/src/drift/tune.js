// Per-car drift tune (tuning screen), saved in localStorage.
import { specFor } from '../physics/carSpecs.js';

const KEY = 'driftgame.tune.';

// slider definitions: value range, step, unit, label and what it does (Hebrew UI)
export const TUNE_FIELDS = [
  { key: 'pressure', min: 22, max: 40, step: 0.5, unit: 'psi', label: 'לחץ אוויר בצמיגים', help: 'הכי הרבה אחיזה סביב 30. נמוך: צמיג רך ועצל. גבוה: פחות אחיזה, האחורי משתחרר קל יותר.' },
  { key: 'camberF', min: -6, max: 0, step: 0.25, unit: '°', label: 'קאמבר קדמי', help: 'יותר שלילי = יותר אחיזה קדמית בזמן החלקה (עד בערך ‎-3.5°). עוזר לתפוס את הסחף.' },
  { key: 'camberR', min: -4, max: 0, step: 0.25, unit: '°', label: 'קאמבר אחורי', help: 'פחות קאמבר אחורי = פחות אחיזה צדית מאחור: קל יותר להחליק, קשה יותר להחזיק.' },
  { key: 'diffLock', min: 0, max: 100, step: 5, unit: '%', label: 'נעילת דיפרנציאל', help: 'גבוה: שני הגלגלים האחוריים מסתובבים יחד, החלקה צפויה וארוכה. נמוך: הגלגל הפנימי מסתחרר.' },
  { key: 'brakeBias', min: 50, max: 80, step: 1, unit: '% קדמי', label: 'חלוקת בלימה', help: 'יותר אחורה = האחורי ננעל ומסתובב בבלימה (כניסה לסחף). יותר קדימה = יציב יותר.' },
  { key: 'lock', min: 30, max: 65, step: 1, unit: '°', label: 'זווית היגוי מרבית', help: 'יותר זווית = אפשר להחזיק זוויות סחף גדולות יותר בלי לאבד שליטה. פחות = היגוי מהיר יותר.' },
  { key: 'springF', min: 0.6, max: 1.6, step: 0.05, unit: '×', label: 'קפיצים קדמיים', help: 'קשיח יותר מקדימה = יותר תת-היגוי (החזית דוחפת החוצה).' },
  { key: 'springR', min: 0.6, max: 1.6, step: 0.05, unit: '×', label: 'קפיצים אחוריים', help: 'קשיח יותר מאחור = יותר היגוי-יתר (האחורי משתחרר בקלות).' },
];

export function defaultTune(carId) {
  const s = specFor(carId);
  return { pressure: 30, camberF: -3.5, camberR: -1, diffLock: Math.round(s.diff.lock * 100), brakeBias: Math.round(s.brakeBias * 100), lock: s.lockDeg, springF: 1, springR: 1 };
}

// stored in UI units; converted for the physics by toPhysics()
export function loadTune(carId) {
  try { return { ...defaultTune(carId), ...(JSON.parse(localStorage.getItem(KEY + carId)) || {}) }; } catch (e) { return defaultTune(carId); }
}
export function saveTune(carId, t) { try { localStorage.setItem(KEY + carId, JSON.stringify(t)); } catch (e) { /* storage blocked */ } }
export function resetTune(carId) { try { localStorage.removeItem(KEY + carId); } catch (e) { /* storage blocked */ } return defaultTune(carId); }
export function toPhysics(t) { return { ...t, diffLock: t.diffLock / 100, brakeBias: t.brakeBias / 100 }; }
