// src/web/src/lib/ansi.ts
// Parses basic ANSI escape codes into styled segments

export interface AnsiSegment {
  text: string;
  color?: string;
  bold?: boolean;
}

const COLOR_MAP: Record<number, string> = {
  30: '#585b70', 31: '#f38ba8', 32: '#a6e3a1', 33: '#f9e2af',
  34: '#89b4fa', 35: '#cba6f7', 36: '#94e2d5', 37: '#cdd6f4',
  90: '#585b70', 91: '#f38ba8', 92: '#a6e3a1', 93: '#f9e2af',
  94: '#89b4fa', 95: '#cba6f7', 96: '#94e2d5', 97: '#cdd6f4',
};

export function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let currentColor: string | undefined;
  let currentBold = false;

  let match;
  while ((match = regex.exec(text)) !== null) {
    // Text before this escape code
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        color: currentColor,
        bold: currentBold,
      });
    }

    // Parse the codes
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) {
        currentColor = undefined;
        currentBold = false;
      } else if (code === 1) {
        currentBold = true;
      } else if (COLOR_MAP[code] !== undefined) {
        currentColor = COLOR_MAP[code];
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last escape code
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      color: currentColor,
      bold: currentBold,
    });
  }

  return segments;
}
