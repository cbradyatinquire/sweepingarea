// Piece class — ported from piece.dart.
// A Piece is a polygon stored as an ordered list of vertices in grid coordinates.
// See ARCHITECTURE.md §6 for full documentation.

import type { GridState } from './state.ts';
import { getXForHSubTick, getYForVSubTick } from './coords.ts';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function colorToCSS(c: Color): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

export const DEFAULT_COLOR: Color = { r: 0, g: 0, b: 255, a: 0.3 };

// ------------------------------------------------------------------
// Piece
// ------------------------------------------------------------------

export class Piece {
  vertices: Point[];
  sides: [Point, Point][] = [];
  color: Color;
  strokeColor: string;

  xmin: number = 0;
  xmax: number = 0;
  ymin: number = 0;
  ymax: number = 0;

  readonly errorTolerance = 0.00001;

  constructor(vs: Point[]) {
    // deduplicate vertices (matches Dart constructor)
    this.vertices = [];
    for (const p of vs) {
      if (!this.vertices.some(v => v.x === p.x && v.y === p.y)) {
        this.vertices.push({ ...p });
      }
    }
    this.color = { ...DEFAULT_COLOR };
    this.strokeColor = '#000';
    this.establishBoundingBox();
    this.setupSides();
  }

  // ----------------------------------------------------------------
  // Bounding box + sides
  // ----------------------------------------------------------------

  establishBoundingBox(): void {
    if (this.vertices.length === 0) return;
    this.xmin = this.vertices[0].x;
    this.xmax = this.vertices[0].x;
    this.ymin = this.vertices[0].y;
    this.ymax = this.vertices[0].y;
    for (const p of this.vertices) {
      if (p.x < this.xmin) this.xmin = p.x;
      if (p.x > this.xmax) this.xmax = p.x;
      if (p.y < this.ymin) this.ymin = p.y;
      if (p.y > this.ymax) this.ymax = p.y;
    }
  }

  setupSides(): void {
    this.sides = [];
    let prev = this.vertices[this.vertices.length - 1];
    for (const v of this.vertices) {
      this.sides.push([{ ...prev }, { ...v }]);
      prev = v;
    }
  }

  // ----------------------------------------------------------------
  // Hit testing
  // ----------------------------------------------------------------

  containsGridPoint(x: number, y: number): boolean {
    if (x <= this.xmin || y <= this.ymin || x >= this.xmax || y >= this.ymax) {
      return false;
    }
    return this.hitParityOdd(x, y);
  }

  hitParityOdd(x: number, y: number): boolean {
    const startPoint: Point = { x: this.xmin - 1, y: (this.ymax - this.ymin) / 2 };
    const hits = this.getHitNumber(startPoint, { x, y });
    return hits % 2 !== 0;
  }

  getHitNumber(start: Point, end: Point): number {
    let hits = 0;
    for (const side of this.sides) {
      hits += this.numIntersections(start, end, side[0], side[1]);
    }
    return hits;
  }

  numIntersections(s1p1: Point, s1p2: Point, s2p1: Point, s2p2: Point): number {
    const a1 = s1p2.y - s1p1.y;
    const b1 = s1p1.x - s1p2.x;
    const c1 = s1p2.x * s1p1.y - s1p1.x * s1p2.y;

    const d1 = a1 * s2p1.x + b1 * s2p1.y + c1;
    const d2 = a1 * s2p2.x + b1 * s2p2.y + c1;
    if (d1 * d2 > 0) return 0;

    const a2 = s2p2.y - s2p1.y;
    const b2 = s2p1.x - s2p2.x;
    const c2 = s2p2.x * s2p1.y - s2p1.x * s2p2.y;

    const d3 = a2 * s1p1.x + b2 * s1p1.y + c2;
    const d4 = a2 * s1p2.x + b2 * s1p2.y + c2;
    if (d3 * d4 > 0) return 0;

    if (Math.abs(a1 * b2 - a2 * b1) < this.errorTolerance) return 0;
    return 1;
  }

  // ----------------------------------------------------------------
  // Cutting
  // ----------------------------------------------------------------

  cutVertical(xcor: number): Piece[] {
    return this.cutGeneral({ x: xcor, y: 0 }, { x: xcor, y: 1 });
  }

  cutHorizontal(ycor: number): Piece[] {
    return this.cutGeneral({ x: 0, y: ycor }, { x: 1, y: ycor });
  }

  // Cut along the line through one and two.
  // Returns an array of pieces (usually two, but handles edge cases).
  cutGeneral(one: Point, two: Point): Piece[] {
    const [verticesWithCuts, cutIndices] = this.getIntersectionsWithLine(one, two);

    const cutPieces: Piece[] = [];
    const indexUnused: boolean[] = verticesWithCuts.map(() => true);

    while (indexUnused.includes(true)) {
      let index = indexUnused.indexOf(true);
      const currentPiece: number[] = [];
      let justJumped = false;

      while (!currentPiece.includes(index)) {
        indexUnused[index] = false;

        if (cutIndices.includes(index)) {
          currentPiece.push(index);
          if (justJumped) {
            justJumped = false;
            index++;
          } else {
            justJumped = true;
            index = this.getNextIndex(index, cutIndices);
          }
        } else {
          currentPiece.push(index);
          index++;
        }

        if (index === verticesWithCuts.length) index = 0;
      }

      if (currentPiece.length > 2) {
        const vertexList = currentPiece.map(i => verticesWithCuts[i]);
        const piece = new Piece(vertexList);
        piece.color = { ...this.color };
        piece.strokeColor = this.strokeColor;
        cutPieces.push(piece);
      }
    }

    return cutPieces;
  }

  getIntersectionsWithLine(one: Point, two: Point): [Point[], number[]] {
    if (this.vertices.length === 0) return [[], []];

    // Remove repeated vertices and collinear points
    const verticesWithoutRepeats: Point[] = [];
    for (let index = 0; index < this.vertices.length; index++) {
      const next = (index + 1) % this.vertices.length;
      const previous = (index - 1 + this.vertices.length) % this.vertices.length;

      const repeated = this.dist(this.vertices[previous], this.vertices[index]) < this.errorTolerance;
      if (repeated) continue;

      const inLine = this.colinear(this.vertices[previous], this.vertices[index], this.vertices[next]);
      if (!inLine) {
        verticesWithoutRepeats.push(this.vertices[index]);
      }
    }

    const abc = this.getLineEq(one, two);
    let checkingIndex = 0;
    const cutIndices: number[] = [];
    const verticesTotal: Point[] = [];

    while (checkingIndex < verticesWithoutRepeats.length) {
      verticesTotal.push(verticesWithoutRepeats[checkingIndex]);
      const possiblePoint = this.isIntersection(checkingIndex, verticesWithoutRepeats, abc);
      if (possiblePoint !== null) {
        if (this.dist(possiblePoint, verticesWithoutRepeats[checkingIndex]) > this.errorTolerance) {
          verticesTotal.push(possiblePoint);
        }
        cutIndices.push(verticesTotal.length - 1);
      }
      checkingIndex++;
    }

    // Determine outside point for distance-based sorting
    const [a, b, c] = abc;
    let outsidePoint: Point;
    if (b !== 0) {
      outsidePoint = { x: -1, y: (a - c) / b };
    } else {
      outsidePoint = { x: -c / a, y: -1 };
    }

    cutIndices.sort((ai, bi) =>
      this.dist(outsidePoint, verticesTotal[ai]) - this.dist(outsidePoint, verticesTotal[bi])
    );

    // Handle tip and collinear-side edge cases
    const duplicate: boolean[] = cutIndices.map(() => false);
    const duplicateOrRemove: boolean[] = cutIndices.map(() => false);
    let n = 0;
    let pointsSkipped = 0;

    while (n < cutIndices.length) {
      const next = verticesTotal[(cutIndices[n] + 1) % verticesTotal.length];
      const previous = verticesTotal[(cutIndices[n] - 1 + verticesTotal.length) % verticesTotal.length];

      if (this.onSameSide(previous, next, abc)) {
        duplicateOrRemove[n] = true;
        if ((n - pointsSkipped) % 2 === 1) {
          duplicate[n] = true;
          pointsSkipped++;
        }
      } else {
        if (n < cutIndices.length - 1) {
          const d = cutIndices[n] - cutIndices[n + 1];
          if (Math.abs(d) === 1) {
            let considerBothTogether: boolean;
            if (d === -1) {
              const twoAhead = verticesTotal[(cutIndices[n] + 2) % verticesTotal.length];
              considerBothTogether = this.onSameSide(previous, twoAhead, abc);
            } else {
              const twoBehind = verticesTotal[(cutIndices[n] - 2 + verticesTotal.length) % verticesTotal.length];
              considerBothTogether = this.onSameSide(twoBehind, next, abc);
            }

            if (considerBothTogether) {
              if ((n - pointsSkipped) % 2 === 0) {
                duplicateOrRemove[n] = true;
                duplicateOrRemove[n + 1] = true;
                pointsSkipped += 2;
              }
              n++;
            } else {
              if ((n - pointsSkipped) % 2 === 0) {
                duplicateOrRemove[n] = true;
                pointsSkipped++;
                n++;
              } else {
                duplicateOrRemove[n + 1] = true;
                pointsSkipped++;
                n++;
              }
            }
          }
        }
      }
      n++;
    }

    // Build final vertex and index lists
    const verticesToReturn: Point[] = [];
    const cutIndicesFinal: number[] = [];
    let secondaryIndex = 0;

    while (secondaryIndex < verticesTotal.length) {
      verticesToReturn.push(verticesTotal[secondaryIndex]);
      const x = cutIndices.indexOf(secondaryIndex);
      if (x !== -1) {
        if (duplicateOrRemove[x]) {
          if (duplicate[x]) {
            cutIndicesFinal.push(verticesToReturn.length - 1);
            verticesToReturn.push(verticesTotal[secondaryIndex]);
            cutIndicesFinal.push(verticesToReturn.length - 1);
          }
        } else {
          cutIndicesFinal.push(verticesToReturn.length - 1);
        }
      }
      secondaryIndex++;
    }

    cutIndicesFinal.sort((ai, bi) =>
      Math.round(this.dist(outsidePoint, verticesToReturn[ai]) * 1000) -
      Math.round(this.dist(outsidePoint, verticesToReturn[bi]) * 1000)
    );

    // Order duplicated tip indices
    let j = 1;
    while (j < cutIndicesFinal.length - 1) {
      if (this.dist(verticesToReturn[cutIndicesFinal[j]], verticesToReturn[cutIndicesFinal[j + 1]]) < this.errorTolerance) {
        const g = Math.max(cutIndicesFinal[j], cutIndicesFinal[j + 1]);
        const h = Math.min(cutIndicesFinal[j], cutIndicesFinal[j + 1]);

        const previous = cutIndicesFinal[j - 1];
        const nextIdx = cutIndicesFinal[(j + 2) % cutIndicesFinal.length];

        let s = (g + 1) % verticesToReturn.length;
        while (!cutIndicesFinal.includes(s)) s = (s + 1) % verticesToReturn.length;

        let t = (h - 1 + verticesToReturn.length) % verticesToReturn.length;
        while (!cutIndicesFinal.includes(t)) t = (t - 1 + verticesToReturn.length) % verticesToReturn.length;

        if (s === nextIdx || t === previous) {
          cutIndicesFinal[j + 1] = g;
          cutIndicesFinal[j] = h;
        } else if (s === previous || t === nextIdx) {
          cutIndicesFinal[j + 1] = h;
          cutIndicesFinal[j] = g;
        } else {
          const nextNext = cutIndicesFinal[(j + 3) % cutIndicesFinal.length];
          if (s === nextNext) {
            cutIndicesFinal[j + 1] = g;
            cutIndicesFinal[j] = h;
          } else if (t === nextNext) {
            cutIndicesFinal[j + 1] = h;
            cutIndicesFinal[j] = g;
          }
        }
        j++;
      }
      j++;
    }

    return [verticesToReturn, cutIndicesFinal];
  }

  colinear(one: Point, two: Point, three: Point): boolean {
    const [a, b, c] = this.getLineEq(one, two);
    return Math.abs(a * three.x + b * three.y + c) < this.errorTolerance;
  }

  getNextIndex(element: number, cutIndices: number[]): number {
    const x = cutIndices.indexOf(element);
    const previous = (x + cutIndices.length - 1) % cutIndices.length;
    const next = (x + 1) % cutIndices.length;
    return x % 2 === 0 ? cutIndices[next] : cutIndices[previous];
  }

  isIntersection(checkingIndex: number, vertices: Point[], abc: [number, number, number]): Point | null {
    const [a, b, c] = abc;
    const end1 = vertices[checkingIndex];
    const end2 = vertices[(checkingIndex + 1) % vertices.length];

    const d1 = a * end1.x + b * end1.y + c;
    const d2 = a * end2.x + b * end2.y + c;

    if (d1 * d2 > 0) return null;
    if (Math.abs(d1) < this.errorTolerance) return end1;
    if (Math.abs(d2) < this.errorTolerance) return null;

    const a2 = end2.y - end1.y;
    const b2 = end1.x - end2.x;
    const c2 = end2.x * end1.y - end1.x * end2.y;

    const denom = a * b2 - a2 * b;
    return {
      x: (c2 * b - c * b2) / denom,
      y: (c * a2 - c2 * a) / denom,
    };
  }

  onSameSide(one: Point, two: Point, abc: [number, number, number]): boolean {
    const [a, b, c] = abc;
    return (a * one.x + b * one.y + c) * (a * two.x + b * two.y + c) > 0;
  }

  getLineEq(line1: Point, line2: Point): [number, number, number] {
    const a = line2.y - line1.y;
    const b = line1.x - line2.x;
    const c = line2.x * line1.y - line1.x * line2.y;
    return [a, b, c];
  }

  // ----------------------------------------------------------------
  // Coalescing (merging adjacent pieces)
  // ----------------------------------------------------------------

  coalesce(inputPieces: Piece[]): Piece[] {
    if (inputPieces.length === 0) return inputPieces;
    const inputCopy = [...inputPieces];
    const coalesced: Piece[] = [];

    while (inputCopy.length > 0) {
      let aggregator = inputCopy[0];
      const usedIndices = [0];
      for (let i = 1; i < inputCopy.length; i++) {
        if (aggregator.sharesSideWith(inputCopy[i])) {
          aggregator = aggregator.aggregate(inputCopy[i]);
          usedIndices.push(i);
        }
      }
      const cache = inputCopy.filter((_, i) => !usedIndices.includes(i));
      coalesced.push(aggregator);
      inputCopy.splice(0, inputCopy.length, ...cache);
    }
    return coalesced;
  }

  sharesSideWith(another: Piece): boolean {
    for (const side of this.sides) {
      for (const aside of another.sides) {
        if (
          this.pointsEqual(side[0], aside[0]) && this.pointsEqual(side[1], aside[1]) ||
          this.pointsEqual(side[0], aside[1]) && this.pointsEqual(side[1], aside[0])
        ) return true;
      }
    }
    return false;
  }

  aggregate(another: Piece): Piece {
    let oneindex = -1, anotherindex = -1;
    let reversed: boolean | null = null;

    outer: for (let osnum = 0; osnum < this.sides.length; osnum++) {
      const oneside = this.sides[osnum];
      for (let asnum = 0; asnum < another.sides.length; asnum++) {
        const anotherside = another.sides[asnum];
        const match01 = this.pointsEqual(anotherside[0], oneside[0]) && this.pointsEqual(anotherside[1], oneside[1]);
        const match10 = this.pointsEqual(anotherside[0], oneside[1]) && this.pointsEqual(anotherside[1], oneside[0]);
        if (match01 || match10) {
          oneindex = osnum;
          anotherindex = asnum;
          reversed = !this.pointsEqual(anotherside[0], oneside[0]);
          break outer;
        }
      }
    }

    const step = reversed ? 1 : -1;
    const agvertices: Point[] = [];

    for (let oi = 0; oi < oneindex; oi++) {
      agvertices.push({ ...this.sides[oi][0] });
    }

    let ai = anotherindex + step;
    while (((ai % another.sides.length) + another.sides.length) % another.sides.length !== anotherindex) {
      const idx = ((ai % another.sides.length) + another.sides.length) % another.sides.length;
      const aside = another.sides[idx];
      agvertices.push(reversed ? { ...aside[0] } : { ...aside[1] });
      ai += step;
    }

    for (let oi = oneindex + 1; oi < this.sides.length; oi++) {
      agvertices.push({ ...this.sides[oi][0] });
    }

    return new Piece(agvertices);
  }

  // ----------------------------------------------------------------
  // Rotation
  // ----------------------------------------------------------------

  // Exact 180° rotation — avoids sin(π) rounding errors.
  rotate180Degrees(center: Point): Piece {
    const newVertices = this.vertices.map(v => ({
      x: center.x + (center.x - v.x),
      y: center.y + (center.y - v.y),
    }));
    const p = new Piece(newVertices);
    p.color = { ...this.color };
    p.strokeColor = this.strokeColor;
    return p;
  }

  // General rotation — converts to pixel space first so rotation is visually
  // correct on non-square grids (where ticwid ≠ ticht). See ARCHITECTURE.md §6.
  rotateCounterclockwiseBy(angle: number, center: Point, g: GridState): void {
    const rotated = this.vertices.map(v => {
      const rel = { x: v.x - center.x, y: v.y - center.y };
      const r = this.rotateVectorBy(angle, rel, g);
      return { x: r.x + center.x, y: r.y + center.y };
    });
    this.vertices = rotated;
    this.establishBoundingBox();
    this.setupSides();
  }

  rotateVectorBy(angle: number, v: Point, g: GridState): Point {
    // Convert to pixel space, rotate, convert back
    const px = v.x * g.ticwid / g.hSubTicks;
    const py = v.y * g.ticht / g.vSubTicks;
    const newpx = px * Math.cos(angle) - py * Math.sin(angle);
    const newpy = px * Math.sin(angle) + py * Math.cos(angle);
    return {
      x: newpx * g.hSubTicks / g.ticwid,
      y: newpy * g.vSubTicks / g.ticht,
    };
  }

  // Returns true if a 180° rotation around center keeps the piece on-screen.
  possibleCenter(center: Point, worldX: number, worldY: number): boolean {
    const xleft  = center.x - this.xmin;
    const xright = this.xmax - center.x;
    const yup    = this.ymax - center.y;
    const ydown  = center.y - this.ymin;
    return (
      center.x + xleft  <= worldX &&
      center.x - xright >= 0     &&
      center.y + ydown  <= worldY &&
      center.y - yup    >= 0
    );
  }

  // ----------------------------------------------------------------
  // Reflection
  // ----------------------------------------------------------------

  flipform(ctr: number, val: number): number {
    return ctr + (ctr - val);
  }

  flipInBounds(axis: 'horizontal' | 'vertical', coord: number, worldX: number, worldY: number): boolean {
    for (const v of this.vertices) {
      const candidate = axis === 'horizontal'
        ? this.flipform(coord, v.x)
        : this.flipform(coord, v.y);
      if (axis === 'horizontal' && (candidate > worldX || candidate < 0)) return false;
      if (axis === 'vertical'   && (candidate > worldY || candidate < 0)) return false;
    }
    return true;
  }

  actuallyFlip(axis: 'horizontal' | 'vertical', coord: number): void {
    this.vertices = this.vertices.map(v =>
      axis === 'horizontal'
        ? { x: this.flipform(coord, v.x), y: v.y }
        : { x: v.x, y: this.flipform(coord, v.y) }
    );
    this.establishBoundingBox();
    this.setupSides();
  }

  // ----------------------------------------------------------------
  // Translation
  // ----------------------------------------------------------------

  shiftBy(delx: number, dely: number): void {
    this.vertices = this.vertices.map(v => ({ x: v.x + delx, y: v.y + dely }));
    this.establishBoundingBox();
    this.setupSides();
  }

  // ----------------------------------------------------------------
  // Copy
  // ----------------------------------------------------------------

  copy(): Piece {
    const p = new Piece(this.vertices.map(v => ({ ...v })));
    p.color = { ...this.color };
    p.strokeColor = this.strokeColor;
    return p;
  }

  // ----------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, g: GridState): void {
    ctx.strokeStyle = this.strokeColor;
    ctx.fillStyle = colorToCSS(this.color);
    this.mainDraw(ctx, g);
  }

  drawAsDragging(ctx: CanvasRenderingContext2D, g: GridState): void {
    ctx.strokeStyle = this.strokeColor;
    ctx.fillStyle = '#F55';
    this.mainDraw(ctx, g);
  }

  drawAsVeryInsubstantial(ctx: CanvasRenderingContext2D, g: GridState, allowed: boolean): void {
    ctx.beginPath();
    ctx.strokeStyle = allowed ? 'rgba(0,255,0,1)'   : 'rgba(255,0,0,0.2)';
    ctx.fillStyle   = allowed ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.03)';
    this.tracePath(ctx, g);
    ctx.setLineDash([3]);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawInsubstantialForRotate(ctx: CanvasRenderingContext2D, g: GridState, allowed: boolean): void {
    ctx.beginPath();
    ctx.strokeStyle = allowed ? 'rgba(0,0,0,0.8)'   : 'rgba(255,0,0,0.8)';
    ctx.fillStyle   = allowed ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)';
    this.tracePath(ctx, g);
    ctx.setLineDash([3]);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawFlipped(ctx: CanvasRenderingContext2D, g: GridState, axis: 'horizontal' | 'vertical', coord: number): void {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.fillStyle   = 'rgba(190,190,190,0.2)';

    const flipped = this.vertices.map(v =>
      axis === 'horizontal'
        ? { x: this.flipform(coord, v.x), y: v.y }
        : { x: v.x, y: this.flipform(coord, v.y) }
    );
    const start = flipped[flipped.length - 1];
    ctx.moveTo(getXForHSubTick(start.x, g), getYForVSubTick(start.y, g));
    ctx.setLineDash([3]);
    for (const v of flipped) {
      ctx.lineTo(getXForHSubTick(v.x, g), getYForVSubTick(v.y, g));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawRotatedCopiesEveryNDegrees(
    ctx: CanvasRenderingContext2D,
    g: GridState,
    center: Point,
    degreeInterval: number,
    allowed: boolean
  ): void {
    for (let i = degreeInterval; i < 180; i += degreeInterval) {
      const temp = this.copy();
      temp.rotateCounterclockwiseBy(i * 2 * Math.PI / 360, center, g);
      temp.drawAsVeryInsubstantial(ctx, g, allowed);
    }
  }

  private mainDraw(ctx: CanvasRenderingContext2D, g: GridState): void {
    ctx.beginPath();
    this.tracePath(ctx, g);
    ctx.fill();
    ctx.stroke();
  }

  private tracePath(ctx: CanvasRenderingContext2D, g: GridState): void {
    const start = this.vertices[this.vertices.length - 1];
    ctx.moveTo(getXForHSubTick(start.x, g), getYForVSubTick(start.y, g));
    for (const v of this.vertices) {
      ctx.lineTo(getXForHSubTick(v.x, g), getYForVSubTick(v.y, g));
    }
    ctx.closePath();
  }

  // ----------------------------------------------------------------
  // Serialisation helpers
  // ----------------------------------------------------------------

  toString(): string {
    return '(' + this.vertices.map(v => `(${v.x}, ${v.y})`).join(', ') + ')';
  }

  toStringUnwrapped(): string {
    return this.vertices.map(v => `(${v.x}, ${v.y})`).join(', ');
  }

  // ----------------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------------

  private dist(a: Point, b: Point): number {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private pointsEqual(a: Point, b: Point): boolean {
    return Math.abs(a.x - b.x) < this.errorTolerance &&
           Math.abs(a.y - b.y) < this.errorTolerance;
  }

  verticesAsString(): string {
    return 'Piece with vertices:\n' +
      this.vertices.map(v => `  (${v.x}, ${v.y})`).join('\n');
  }
}

// Convenience: copy a list of pieces
export function copyPieces(pieces: Piece[]): Piece[] {
  return pieces.map(p => p.copy());
}
