/** Line-based diff (LCS) used to compare song versions and proposals. */
import { expandSequence, sectionTitle, toInlineChords, chordsFor, type SongContent } from './song';

export type DiffOp = { type: 'same' | 'add' | 'del'; text: string };

export function diffLines(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: 'del', text: a[i++]! });
    } else {
      out.push({ type: 'add', text: b[j++]! });
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++]! });
  while (j < m) out.push({ type: 'add', text: b[j++]! });
  return out;
}

/** Text representation for comparison: section headers, lyrics with inline chords, order. */
export function contentToLines(c: SongContent, withChords = true): string[] {
  const lines: string[] = [];
  for (const s of c.sections) {
    lines.push(`## ${sectionTitle(s, c)}`);
    s.lines.forEach((l, i) => lines.push(withChords ? toInlineChords(l, chordsFor(c, s.key, i)) : l));
    lines.push('');
  }
  lines.push(`Ordine: ${expandSequence(c).map((e) => sectionTitle(e.section, c)).join(' → ')}`);
  if (withChords && c.key) lines.push(`Tonalità: ${c.key}`);
  return lines;
}

export function diffContent(a: SongContent, b: SongContent, withChords = true): DiffOp[] {
  return diffLines(contentToLines(a, withChords), contentToLines(b, withChords));
}

export const hasChanges = (ops: DiffOp[]) => ops.some((o) => o.type !== 'same');
