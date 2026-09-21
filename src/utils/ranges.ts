import type { Position, Range } from "../types/index.js";

/** Create a zero-based position. Caller ensures non-negative inputs. */
export function createPosition(line: number, character: number): Position {
  return { line: Math.max(0, line), character: Math.max(0, character) };
}

function comparePositions(a: Position, b: Position): number {
  if (a.line !== b.line) {
    return a.line < b.line ? -1 : 1;
  }
  if (a.character !== b.character) {
    return a.character < b.character ? -1 : 1;
  }
  return 0;
}

/** Create a range, normalizing inverted inputs so start <= end. */
export function createRange(start: Position, end: Position): Range {
  if (comparePositions(start, end) <= 0) {
    return { start, end };
  }
  return { start: end, end: start };
}

/** True when start == end. */
export function isEmpty(range: Range): boolean {
  return comparePositions(range.start, range.end) === 0;
}

/** Structural equality. */
export function equals(a: Range, b: Range): boolean {
  return comparePositions(a.start, b.start) === 0 && comparePositions(a.end, b.end) === 0;
}

function positionEquals(a: Position, b: Position): boolean {
  return a.line === b.line && a.character === b.character;
}

/**
 * Inclusive start, exclusive end containment.
 * A position equal to `end` is outside; a position equal to `start` is inside.
 */
export function containsPosition(range: Range, pos: Position): boolean {
  return comparePositions(range.start, pos) <= 0 && comparePositions(pos, range.end) < 0;
}

/** True when `outer` fully encloses `inner` (inclusive both ends). */
export function containsRange(outer: Range, inner: Range): boolean {
  return comparePositions(outer.start, inner.start) <= 0 && comparePositions(inner.end, outer.end) <= 0;
}

/** True when ranges share at least one position (touching at a point counts as overlap). */
export function overlaps(a: Range, b: Range): boolean {
  return comparePositions(a.start, b.end) <= 0 && comparePositions(b.start, a.end) <= 0;
}

/** Shift a range; clamps resulting coordinates at zero. */
export function translate(range: Range, lineDelta: number, characterDelta: number): Range {
  const start = createPosition(range.start.line + lineDelta, range.start.character + characterDelta);
  const end = createPosition(range.end.line + lineDelta, range.end.character + characterDelta);
  return createRange(start, end);
}

export function positionsEqual(a: Position, b: Position): boolean {
  return positionEquals(a, b);
}
