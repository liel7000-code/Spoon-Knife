// The three drift tracks. All layouts, names and places are original and fictional.
// par = time-trial lap (s) for an S grade; grades = Score Attack (3 min) thresholds, calibrated
// with an autopilot. Control points are [x, z] in metres; the centre line is a closed
// centripetal Catmull-Rom curve through them, driven in point order.
export const TRACKS = [
  {
    id: 'harbor', name: 'Harbor Night', he: 'נמל בלילה', level: 1, levelHe: 'מתחילים',
    blurb: 'נמל תעשייתי בלילה: פניות ארוכות ורחבות בין מכולות ועגורנים.',
    theme: 'harbor', width: 16, runoff: 5, wall: 'jersey',
    pts: [[0, 0], [0, -140], [25, -215], [95, -255], [175, -245], [230, -195], [245, -120], [215, -60], [175, -10], [170, 60], [210, 120], [205, 195], [150, 240], [70, 240], [20, 190], [0, 110]],
    par: 50, grades: { S: 75000, A: 45000, B: 22000 },
  },
  {
    id: 'mountain', name: 'Mountain Pass', he: 'מעבר ההרים', level: 2, levelHe: 'בינוני',
    blurb: 'כביש הררי מתפתל בשקיעה: סיכות ראש, מעקות בטיחות, צוקים ועצים.',
    theme: 'mountain', width: 11, runoff: 2, wall: 'rail',
    pts: [[0, 0], [0, -100], [-15, -170], [-60, -200], [-95, -180], [-95, -140], [-60, -115], [-40, -80], [-70, -45], [-120, -50], [-150, -90], [-160, -160], [-150, -240], [-110, -290], [-50, -300], [10, -280], [40, -230], [80, -205], [122, -228], [160, -205], [158, -160], [130, -140], [90, -120], [80, -70], [110, -30], [100, 30], [60, 60], [20, 50]],
    climb: 34, par: 82, grades: { S: 60000, A: 35000, B: 18000 },
  },
  {
    id: 'neon', name: 'Neon Circuit', he: 'מעגל הניאון', level: 3, levelHe: 'קשה',
    blurb: 'מעגל טכני סגור בלב עיר: מעברים מהירים, שיקיינים ופנייה אחרונה ענקית.',
    theme: 'neon', width: 13, runoff: 3.5, wall: 'neon',
    pts: [[0, 0], [0, -110], [6, -145], [32, -165], [40, -190], [32, -215], [48, -245], [90, -250], [130, -235], [140, -200], [175, -185], [215, -200], [245, -175], [240, -130], [205, -112], [196, -84], [212, -56], [238, -24], [225, 50], [180, 95], [110, 115], [50, 100], [12, 60]],
    par: 57, grades: { S: 65000, A: 38000, B: 19000 },
  },
];

export const SESSIONS = {
  free: { id: 'free', name: 'Free Drift', he: 'דריפט חופשי', blurb: 'בלי שעון. סחפו כמה שבא לכם וצברו ניקוד.' },
  attack: { id: 'attack', name: 'Score Attack', he: 'מתקפת ניקוד', blurb: '3 דקות. כמה שיותר נקודות.', time: 180 },
  trial: { id: 'trial', name: 'Time Trial', he: 'נגד השעון', blurb: '3 הקפות, ההקפה הטובה נשמרת כרוח רפאים.', laps: 3 },
};
