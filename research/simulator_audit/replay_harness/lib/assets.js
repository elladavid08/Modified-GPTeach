// Benchmark-only drawings and their geometry (harness review §5). Production images in public/images
// and src/config/testConfig.js are NOT changed or used by the corrected benchmark.
//
// Vector drawings are generated from `vertices` by scripts/render_assets.js (SVG) and rendered to PNG
// with scripts/render_png.sh. The geometry checks below are what the teacher text claims about each
// drawing; test/assets.test.js verifies them and that the SVG matches the vertices.

export const DRAWINGS = {
  kite: {
    file: 'assets/s2_kite.png',
    svg: 'assets/s2_kite.svg',
    usedIn: [{ scenario: 2, turn: 5 }],
    claim: 'מרובע שהאלכסונים שלו מאונכים אבל הוא לא מעוין - זה דלתון',
    vertices: [[40, 150], [100, 70], [260, 150], [100, 230]],
    diagonals: [[0, 2], [1, 3]],
    rightAngleMark: [100, 138],
  },
  parallelogram: {
    file: 'assets/s4_parallelogram.png',
    svg: 'assets/s4_parallelogram.svg',
    usedIn: [{ scenario: 4, turn: 8 }],
    claim: 'מקבילית; האלכסון שלה לא חוצה את הזווית',
    vertices: [[30, 220], [230, 220], [280, 120], [80, 120]],
    diagonals: [[0, 2]],
  },
  'equal-perpendicular-not-bisecting': {
    file: 'assets/s5_equal_perpendicular_not_bisecting.png',
    svg: 'assets/s5_equal_perpendicular_not_bisecting.svg',
    usedIn: [{ scenario: 5, turn: 8 }],
    claim: 'מרובע שהאלכסונים שלו שווים ומאונכים אבל לא חוצים זה את זה',
    vertices: [[40, 150], [100, 60], [260, 150], [100, 280]],
    diagonals: [[0, 2], [1, 3]],
    rightAngleMark: [100, 138],
    // The equality of the diagonals cannot be judged by eye (smoke run 3): state it, as in textbooks
    labels: { vertices: ['A', 'B', 'C', 'D'], caption: 'AC = BD' },
  },
  'rotated-rectangle': {
    // Byte copy of public/images/rotated-parallelogram.png, which shows a rotated RECTANGLE (correct
    // for its questionnaire use). Raster only; corner coordinates measured from the image.
    file: 'assets/rotated-rectangle.png',
    copyOf: 'public/images/rotated-parallelogram.png',
    usedIn: [{ scenario: 3, turn: 8 }],
    claim: 'צורה מסובבת שהיא מלבן',
    vertices: [[20, 105], [228, 30], [253, 105], [45, 181]],
    diagonals: [],
    tolerance: { lengthRel: 0.05, angleDeg: 4 },
  },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const dist = (a, b) => len(sub(a, b));
const angleDeg = (v, w) => (Math.acos((v[0] * w[0] + v[1] * w[1]) / (len(v) * len(w))) * 180) / Math.PI;

/** Fractions along each diagonal where the two diagonals intersect: [t on d1, u on d2]. */
export function intersectionFractions([p1, p2], [p3, p4]) {
  const den = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / den;
  const u = ((p1[0] - p3[0]) * (p1[1] - p2[1]) - (p1[1] - p3[1]) * (p1[0] - p2[0])) / den;
  return [t, u];
}

/** Basic measurements of a quadrilateral ABCD. */
export function measure(vertices) {
  const [A, B, C, D] = vertices;
  const sides = [dist(A, B), dist(B, C), dist(C, D), dist(D, A)];
  const angles = [
    angleDeg(sub(B, A), sub(D, A)),
    angleDeg(sub(A, B), sub(C, B)),
    angleDeg(sub(B, C), sub(D, C)),
    angleDeg(sub(C, D), sub(A, D)),
  ];
  const diag = [dist(A, C), dist(B, D)];
  const diagAngle = angleDeg(sub(C, A), sub(D, B));
  const [t, u] = intersectionFractions([A, C], [B, D]);
  // angle at A split by diagonal AC
  const splitA = [angleDeg(sub(B, A), sub(C, A)), angleDeg(sub(C, A), sub(D, A))];
  return { sides, angles, diag, diagAngle, intersection: [t, u], splitA };
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

/** The geometric facts each drawing must satisfy for the teacher text to be true. */
export function checkDrawing(id) {
  const d = DRAWINGS[id];
  const m = measure(d.vertices);
  const [ab, bc, cd, da] = m.sides;
  if (id === 'kite') {
    return {
      'two pairs of equal adjacent sides': near(ab, da, 0.5) && near(bc, cd, 0.5),
      'not a rhombus (not all sides equal)': !near(ab, bc, 1),
      'diagonals perpendicular': near(m.diagAngle, 90, 0.5),
      'exactly one diagonal bisected': near(m.intersection[1], 0.5, 0.01) && !near(m.intersection[0], 0.5, 0.05),
    };
  }
  if (id === 'parallelogram') {
    return {
      'opposite sides equal': near(ab, cd, 0.5) && near(bc, da, 0.5),
      'not a rhombus': !near(ab, bc, 1),
      'not a rectangle': !near(m.angles[0], 90, 5),
      'diagonal AC does not bisect angle A (visibly)': Math.abs(m.splitA[0] - m.splitA[1]) > 10,
    };
  }
  if (id === 'equal-perpendicular-not-bisecting') {
    return {
      'diagonals equal': near(m.diag[0], m.diag[1], 0.5),
      'diagonals perpendicular': near(m.diagAngle, 90, 0.5),
      'neither diagonal bisected': !near(m.intersection[0], 0.5, 0.05) && !near(m.intersection[1], 0.5, 0.05),
      'not a square (sides not all equal)': !near(ab, bc, 1),
    };
  }
  if (id === 'rotated-rectangle') {
    const { lengthRel, angleDeg: angTol } = d.tolerance;
    return {
      'opposite sides equal (within tolerance)': Math.abs(ab - cd) / ab < lengthRel && Math.abs(bc - da) / bc < lengthRel,
      'all angles about 90°': m.angles.every((a) => near(a, 90, angTol)),
      'rotated (not axis-aligned)': Math.abs(d.vertices[0][1] - d.vertices[1][1]) > 20,
    };
  }
  throw new Error(`unknown drawing ${id}`);
}

const BG = '#FFF2CC';
const FILL = '#4472C4';
const STROKE = '#1F3864';

/** SVG source for a vector drawing (same palette as the production images). */
export function svgFor(id) {
  const d = DRAWINGS[id];
  const poly = d.vertices.map(([x, y]) => `${x},${y}`).join(' ');
  const diags = d.diagonals
    .map(([i, j]) => {
      const [a, b] = [d.vertices[i], d.vertices[j]];
      return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="8,5"/>`;
    })
    .join('');
  const mark = d.rightAngleMark
    ? `<rect x="${d.rightAngleMark[0]}" y="${d.rightAngleMark[1]}" width="12" height="12" fill="none" stroke="#FFFFFF" stroke-width="2"/>`
    : '';
  const offsets = [[-22, 6], [-6, -10], [10, 6], [-24, 0]];
  const labels = d.labels
    ? d.labels.vertices.map((t, i) => `<text x="${d.vertices[i][0] + offsets[i][0]}" y="${d.vertices[i][1] + offsets[i][1]}" font-family="Arial" font-size="18" fill="${STROKE}">${t}</text>`).join('') +
      `<text x="190" y="285" font-family="Arial" font-size="18" fill="${STROKE}">${d.labels.caption}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="${BG}"/><polygon points="${poly}" fill="${FILL}" stroke="${STROKE}" stroke-width="3"/>${diags}${mark}${labels}</svg>\n`;
}
