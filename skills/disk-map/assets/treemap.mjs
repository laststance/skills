// Squarified treemap layout shared by the live viewer and the static export.

const worst = (row, side) => {
  const sum = row.reduce((total, value) => total + value, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
};

/**
 * Lay out positive values (sorted largest first) inside a rectangle so each
 * tile's area is proportional to its value.
 *
 * Called by the viewer for every map level and by the static report export.
 *
 * @param values - Positive numbers in descending order.
 * @param rect - `{ x, y, w, h }` container in any unit.
 * @returns One `{ x, y, w, h }` per value, in input order.
 * @example
 * squarify([6, 3, 1], { x: 0, y: 0, w: 100, h: 100 });
 */
export function squarify(values, rect) {
  const total = values.reduce((sum, value) => sum + value, 0);
  let { x, y, w, h } = rect;
  if (!total || w <= 0 || h <= 0) return values.map(() => ({ x, y, w: 0, h: 0 }));
  const areas = values.map((value) => (value * w * h) / total);
  const out = [];
  let index = 0;
  while (index < areas.length) {
    const side = Math.min(w, h);
    let row = [areas[index]];
    let next = index + 1;
    // Grow the row while the worst aspect ratio improves.
    while (next < areas.length && worst([...row, areas[next]], side) <= worst(row, side)) {
      row = [...row, areas[next]];
      next += 1;
    }
    const sum = row.reduce((total, area) => total + area, 0);
    if (w >= h) {
      const width = sum / h;
      let cursor = y;
      for (const area of row) {
        out.push({ x, y: cursor, w: width, h: area / width });
        cursor += area / width;
      }
      x += width;
      w -= width;
    } else {
      const height = sum / w;
      let cursor = x;
      for (const area of row) {
        out.push({ x: cursor, y, w: area / height, h: height });
        cursor += area / height;
      }
      y += height;
      h -= height;
    }
    index = next;
  }
  return out;
}

/**
 * Format a decimal byte string for display (base 1000, like Finder).
 *
 * @example
 * formatBytes('1500000000'); // '1.5 GB'
 */
export function formatBytes(value, locale = 'en') {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unit = 0;
  let scaled = Math.abs(bytes);
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  const digits = scaled >= 100 || unit === 0 ? 0 : 1;
  return `${bytes < 0 ? '−' : ''}${scaled.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`;
}
