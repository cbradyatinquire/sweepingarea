import { describe, it, expect } from 'vitest';
import { Piece } from './piece.ts';
import type { Point } from './piece.ts';

// Helper: make a rectangle with corners at (x1,y1)-(x2,y2)
function rect(x1: number, y1: number, x2: number, y2: number): Piece {
  return new Piece([
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ]);
}

// Helper: sort vertices for stable comparison
function sortedVerts(p: Piece): string {
  return [...p.vertices]
    .map(v => `${Math.round(v.x * 1000) / 1000},${Math.round(v.y * 1000) / 1000}`)
    .sort()
    .join(' | ');
}

// ----------------------------------------------------------------
// containsGridPoint
// ----------------------------------------------------------------

describe('containsGridPoint', () => {
  const r = rect(0, 0, 4, 3);

  it('returns true for a point clearly inside', () => {
    expect(r.containsGridPoint(2, 1.5)).toBe(true);
  });

  it('returns false for a point outside the bounding box', () => {
    expect(r.containsGridPoint(5, 1.5)).toBe(false);
  });

  it('returns false for a point on the boundary (exclusive)', () => {
    expect(r.containsGridPoint(0, 1.5)).toBe(false); // on xmin edge
  });
});

// ----------------------------------------------------------------
// cutVertical
// ----------------------------------------------------------------

describe('cutVertical', () => {
  it('splits a rectangle into two rectangles', () => {
    const r = rect(0, 0, 4, 3);
    const pieces = r.cutVertical(2);
    expect(pieces).toHaveLength(2);
    // Both pieces should have 4 vertices
    pieces.forEach(p => expect(p.vertices.length).toBe(4));
  });

  it('preserves total bounding width', () => {
    const r = rect(0, 0, 4, 3);
    const pieces = r.cutVertical(2);
    const xmins = pieces.map(p => p.xmin);
    const xmaxs = pieces.map(p => p.xmax);
    expect(Math.min(...xmins)).toBeCloseTo(0);
    expect(Math.max(...xmaxs)).toBeCloseTo(4);
  });

  it('does not cut outside the piece — returns original as one piece', () => {
    const r = rect(0, 0, 4, 3);
    const pieces = r.cutVertical(10);
    // Cut is outside the piece, so no split occurs
    expect(pieces.length).toBeLessThanOrEqual(1);
  });

  it('the cut line is at x=2 for both resulting pieces', () => {
    const r = rect(0, 0, 4, 3);
    const [left, right] = r.cutVertical(2).sort((a, b) => a.xmin - b.xmin);
    expect(left.xmax).toBeCloseTo(2);
    expect(right.xmin).toBeCloseTo(2);
  });
});

// ----------------------------------------------------------------
// cutHorizontal
// ----------------------------------------------------------------

describe('cutHorizontal', () => {
  it('splits a rectangle into two rectangles', () => {
    const r = rect(0, 0, 4, 3);
    const pieces = r.cutHorizontal(1.5);
    expect(pieces).toHaveLength(2);
  });

  it('the cut line is at y=1.5 for both resulting pieces', () => {
    const r = rect(0, 0, 4, 3);
    const [top, bottom] = r.cutHorizontal(1.5).sort((a, b) => a.ymin - b.ymin);
    expect(top.ymax).toBeCloseTo(1.5);
    expect(bottom.ymin).toBeCloseTo(1.5);
  });
});

// ----------------------------------------------------------------
// Triangle cutting
// ----------------------------------------------------------------

describe('cutting a triangle', () => {
  // Right triangle with vertices at (0,0), (4,0), (0,3)
  const tri = new Piece([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }]);

  it('cutting vertically produces two pieces', () => {
    const pieces = tri.cutVertical(2);
    expect(pieces).toHaveLength(2);
  });

  it('both pieces stay within original bounding box', () => {
    const pieces = tri.cutVertical(2);
    for (const p of pieces) {
      expect(p.xmin).toBeGreaterThanOrEqual(-0.001);
      expect(p.xmax).toBeLessThanOrEqual(4.001);
      expect(p.ymin).toBeGreaterThanOrEqual(-0.001);
      expect(p.ymax).toBeLessThanOrEqual(3.001);
    }
  });
});

// ----------------------------------------------------------------
// rotate180Degrees
// ----------------------------------------------------------------

describe('rotate180Degrees', () => {
  it('rotating a rectangle 180° around its centre returns the same shape', () => {
    const r = rect(0, 0, 4, 2);
    const centre: Point = { x: 2, y: 1 };
    const rotated = r.rotate180Degrees(centre);
    expect(sortedVerts(rotated)).toBe(sortedVerts(r));
  });

  it('a point at (1,0) rotated 180° around (2,1) lands at (3,2)', () => {
    const p = new Piece([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }]);
    const rotated = p.rotate180Degrees({ x: 2, y: 1 });
    const v = rotated.vertices.find(v => Math.abs(v.x - 3) < 0.001 && Math.abs(v.y - 2) < 0.001);
    expect(v).toBeDefined();
  });
});

// ----------------------------------------------------------------
// flipform / flipInBounds / actuallyFlip
// ----------------------------------------------------------------

describe('reflection', () => {
  it('flipform reflects a value across a centre', () => {
    const p = new Piece([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
    expect(p.flipform(5, 3)).toBeCloseTo(7);
    expect(p.flipform(5, 7)).toBeCloseTo(3);
    expect(p.flipform(5, 5)).toBeCloseTo(5);
  });

  it('flipInBounds returns true when flipped piece stays on screen', () => {
    const r = rect(1, 1, 3, 3);
    expect(r.flipInBounds('horizontal', 5, 10, 10)).toBe(true);
  });

  it('flipInBounds returns false when flipped piece goes off screen', () => {
    const r = rect(1, 1, 3, 3);
    // Flipping horizontally across x=9 would put x=1 at x=17, off a 10-wide world
    expect(r.flipInBounds('horizontal', 9, 10, 10)).toBe(false);
  });

  it('actuallyFlip mutates vertices correctly', () => {
    const r = rect(0, 0, 2, 2);
    r.actuallyFlip('horizontal', 3);
    // x=0 → 6, x=2 → 4
    const xs = r.vertices.map(v => v.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(4);
    expect(xs[xs.length - 1]).toBeCloseTo(6);
  });
});

// ----------------------------------------------------------------
// copy
// ----------------------------------------------------------------

describe('copy', () => {
  it('produces an independent copy — mutating original does not affect copy', () => {
    const r = rect(0, 0, 4, 3);
    const c = r.copy();
    r.shiftBy(10, 10);
    expect(c.xmin).toBeCloseTo(0);
  });

  it('preserves color', () => {
    const r = rect(0, 0, 4, 3);
    r.color = { r: 255, g: 0, b: 0, a: 0.5 };
    const c = r.copy();
    expect(c.color).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
  });
});

// ----------------------------------------------------------------
// Non-convex arrowhead — exercises concave cut paths
// ----------------------------------------------------------------
//
// Major-tick vertices: (1,2),(4,1),(3,3),(4,5),(1,4),(3,4)
// The last vertex is the deep notch — moved to (3,4) for a more extreme shape.
//
// With hSubTicks=vSubTicks=2 the piece is stored in sub-tick coords
// (each major-tick position ×2), so vertices land on EVEN sub-tick values.
// Cuts at ODD sub-tick values slice cleanly between all vertices.
//
// Sub-tick vertices: (2,4),(8,2),(6,6),(8,10),(2,8),(6,8)
// Bounding box: xmin=2 xmax=8 ymin=2 ymax=10
//
// Cross-sections (major y → major x range → sub-tick equivalents):
//   y=1.5 (st 3):  x ∈ [2.50, 3.75]  st x ∈ [5.0,  7.5]
//   y=2.5 (st 5):  x ∈ [1.50, 3.25]  st x ∈ [3.0,  6.5]
//   y=3.0 (st 6):  x ∈ [2.00, 3.00]  st x ∈ [4.0,  6.0]  ← degenerate (hits vertex (3,3))
//   y=3.5 (st 7):  x ∈ [2.50, 3.25]  st x ∈ [5.0,  6.5]
//   y=4.5 (st 9):  x ∈ [2.50, 3.75]  st x ∈ [5.0,  7.5]

describe('non-convex arrowhead (hSubTicks=vSubTicks=2)', () => {
  // All coordinates are sub-tick (major × 2).
  function arrow(): Piece {
    return new Piece([
      { x: 2, y: 4  },   // major (1,2)
      { x: 8, y: 2  },   // major (4,1)
      { x: 6, y: 6  },   // major (3,3) — right concave vertex
      { x: 8, y: 10 },   // major (4,5)
      { x: 2, y: 8  },   // major (1,4)
      { x: 6, y: 8  },   // major (3,4) — deep left notch vertex
    ]);
  }

  it('constructs without throwing', () => {
    expect(() => arrow()).not.toThrow();
  });

  it('has correct bounding box in sub-tick coords', () => {
    const a = arrow();
    expect(a.xmin).toBeCloseTo(2);
    expect(a.xmax).toBeCloseTo(8);
    expect(a.ymin).toBeCloseTo(2);
    expect(a.ymax).toBeCloseTo(10);
  });

  // -- containsGridPoint --

  it('containsGridPoint — inside at sub-tick y=5 (major 2.5), body x∈[3,6.5]', () => {
    expect(arrow().containsGridPoint(5, 5)).toBe(true);   // sub-tick (5,5) = major (2.5,2.5)
  });

  it('containsGridPoint — inside at sub-tick y=9 (major 4.5), body x∈[5,7.5]', () => {
    expect(arrow().containsGridPoint(6, 9)).toBe(true);   // sub-tick (6,9) = major (3,4.5)
  });

  it('containsGridPoint — outside: right of right-concavity at y=7 (major 3.5)', () => {
    // body x∈[5,6.5]; sub-tick x=7 is outside
    expect(arrow().containsGridPoint(7, 7)).toBe(false);
  });

  it('containsGridPoint — outside: left of deep notch at y=7 (major 3.5)', () => {
    // body x∈[5,6.5]; sub-tick x=4 is outside (the big excluded region due to (3,4) notch)
    expect(arrow().containsGridPoint(4, 7)).toBe(false);
  });

  it('containsGridPoint — outside: clearly left of shape', () => {
    expect(arrow().containsGridPoint(1, 5)).toBe(false);
  });

  it('containsGridPoint — outside: clearly right of shape', () => {
    expect(arrow().containsGridPoint(10, 5)).toBe(false);
  });

  it('containsGridPoint — degenerate y=6 (major 3, hits vertex (3,3)); body x∈[4,6]', () => {
    expect(arrow().containsGridPoint(5, 6)).toBe(true);   // inside [4,6]
    expect(arrow().containsGridPoint(7, 6)).toBe(false);  // right of right vertex
    expect(arrow().containsGridPoint(3, 6)).toBe(false);  // left of left boundary
  });

  // -- cuts at odd sub-tick positions (between all vertices) --

  it('cutVertical(5) — major x=2.5, slices through left-side body', () => {
    const pieces = arrow().cutVertical(5);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    for (const p of pieces) {
      expect(p.xmin).toBeGreaterThanOrEqual(1.999);
      expect(p.xmax).toBeLessThanOrEqual(8.001);
      expect(p.ymin).toBeGreaterThanOrEqual(1.999);
      expect(p.ymax).toBeLessThanOrEqual(10.001);
    }
  });

  it('cutVertical(7) — major x=3.5, slices through right concave area', () => {
    const pieces = arrow().cutVertical(7);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    for (const p of pieces) {
      expect(p.xmin).toBeGreaterThanOrEqual(1.999);
      expect(p.xmax).toBeLessThanOrEqual(8.001);
    }
  });

  it('cutHorizontal(5) — major y=2.5, horizontal slice through upper body', () => {
    const pieces = arrow().cutHorizontal(5);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    for (const p of pieces) {
      expect(p.ymin).toBeGreaterThanOrEqual(1.999);
      expect(p.ymax).toBeLessThanOrEqual(10.001);
    }
  });

  it('cutHorizontal(7) — major y=3.5, horizontal slice through narrow waist', () => {
    const pieces = arrow().cutHorizontal(7);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    for (const p of pieces) {
      expect(p.ymin).toBeGreaterThanOrEqual(1.999);
      expect(p.ymax).toBeLessThanOrEqual(10.001);
    }
  });

  it('cutHorizontal(9) — major y=4.5, horizontal slice through lower body', () => {
    const pieces = arrow().cutHorizontal(9);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
  });

  it('multi-cut: cutVertical(5) then cutHorizontal(7) — non-vertex grid cuts', () => {
    const stage1 = arrow().cutVertical(5);
    const allPieces: Piece[] = [];
    for (const p of stage1) allPieces.push(...p.cutHorizontal(7));
    expect(allPieces.length).toBeGreaterThanOrEqual(3);
    for (const p of allPieces) {
      expect(p.xmin).toBeGreaterThanOrEqual(1.999);
      expect(p.xmax).toBeLessThanOrEqual(8.001);
      expect(p.ymin).toBeGreaterThanOrEqual(1.999);
      expect(p.ymax).toBeLessThanOrEqual(10.001);
    }
  });

  it('multi-cut: full grid at sub-tick step 2 — simulates "cut on grid" with hSubTicks=2', () => {
    // Cut every even sub-tick line (matching major tick lines)
    let pieces = [arrow()];
    for (let yc = 2; yc <= 10; yc += 2) {
      const next: Piece[] = [];
      for (const p of pieces) next.push(...p.cutHorizontal(yc));
      pieces = next;
    }
    for (let xc = 2; xc <= 8; xc += 2) {
      const next: Piece[] = [];
      for (const p of pieces) next.push(...p.cutVertical(xc));
      pieces = next;
    }
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    for (const p of pieces) {
      expect(p.xmin).toBeGreaterThanOrEqual(1.999);
      expect(p.xmax).toBeLessThanOrEqual(8.001);
      expect(p.ymin).toBeGreaterThanOrEqual(1.999);
      expect(p.ymax).toBeLessThanOrEqual(10.001);
      expect(p.vertices.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('shiftBy moves all vertices', () => {
    const a = arrow();
    a.shiftBy(2, 1);
    expect(a.xmin).toBeCloseTo(4);
    expect(a.ymin).toBeCloseTo(3);
  });

  it('copy is independent', () => {
    const a = arrow();
    const b = a.copy();
    a.shiftBy(10, 10);
    expect(b.xmin).toBeCloseTo(2);
  });
});

// ----------------------------------------------------------------
// possibleCenter
// ----------------------------------------------------------------

describe('possibleCenter', () => {
  it('returns true when 180° rotation stays on screen', () => {
    const r = rect(2, 2, 4, 4);
    // Centre at (3,3): rotated extents stay within a 10x10 world
    expect(r.possibleCenter({ x: 3, y: 3 }, 10, 10)).toBe(true);
  });

  it('returns false when 180° rotation goes off screen', () => {
    const r = rect(0, 0, 4, 4);
    // Centre at (1,1): rotated left side would need x=-2
    expect(r.possibleCenter({ x: 1, y: 1 }, 10, 10)).toBe(false);
  });
});
