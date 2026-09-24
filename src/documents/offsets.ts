import type { Position } from "../types/index.js";

/**
 * Compute the UTF-16 offset of each line start.
 * Handles \n, \r\n, and lone \r as single breaks.
 */
export function computeLineStarts(text: string): readonly number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      starts.push(i + 1);
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") {
        i++;
      }
      starts.push(i + 1);
    }
  }
  return starts;
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) {
    return min;
  }
  if (n > max) {
    return max;
  }
  return n;
}

/** Convert a position to a UTF-16 offset, clamping out-of-bounds input. */
export function offsetAtPosition(
  lineStarts: readonly number[],
  text: string,
  pos: Position,
): number {
  if (lineStarts.length === 0) {
    return 0;
  }
  const line = clamp(pos.line, 0, lineStarts.length - 1);
  const lineStart = lineStarts[line];
  if (lineStart === undefined) {
    return text.length;
  }
  const nextStart = lineStarts[line + 1];
  const lineEnd = nextStart === undefined ? text.length : nextStart;
  // Exclude the line break itself from the clamp range.
  let breakLen = 0;
  if (lineEnd > lineStart) {
    if (text[lineEnd - 1] === "\n" && lineEnd - 2 >= lineStart && text[lineEnd - 2] === "\r") {
      breakLen = 2;
    } else if (text[lineEnd - 1] === "\n" || text[lineEnd - 1] === "\r") {
      breakLen = 1;
    }
  }
  const maxChar = lineEnd - lineStart - breakLen;
  const character = clamp(pos.character, 0, Math.max(0, maxChar));
  return clamp(lineStart + character, 0, text.length);
}

/** Convert a UTF-16 offset to a position, clamping out-of-bounds input. */
export function positionAtOffset(
  lineStarts: readonly number[],
  text: string,
  offset: number,
): Position {
  const clamped = clamp(offset, 0, text.length);
  if (lineStarts.length === 0) {
    return { line: 0, character: clamped };
  }
  // Binary search: lineStarts is strictly ascending, so this finds the
  // greatest line start <= clamped in O(log n). Same result as the old
  // linear scan (verified by round-trip property tests).
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = low + ((high - low + 1) >> 1);
    if ((lineStarts[mid] ?? Number.POSITIVE_INFINITY) <= clamped) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  const lineStart = lineStarts[low] ?? 0;
  return { line: low, character: clamped - lineStart };
}
