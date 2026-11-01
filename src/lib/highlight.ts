/** `page` sayfasına göre 0..1 aralığında. Zoom değişince yeniden hesap gerekmez. */
export type Rect = { page: number; x: number; y: number; w: number; h: number };

export type Highlight = {
  id: string;
  /** İlk sayfa. Seçim birden fazla sayfaya yayılabilir. Her rect kendi sayfasını taşır. */
  page: number;
  rects: Rect[];
  text: string;
  color: string;
  note: string;
  createdAt: number;
};

type Box = { left: number; top: number; width: number; height: number };

export const COLORS = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4"];

/**
 * Seçimin ekran rect'lerini sayfa kutusuna göre normalize eder.
 * Sayfa dışında kalan ve boş rect'leri atar. Aynı satırdaki rect'leri birleştirir.
 * Sayfa boyunun %10'undan uzun rect'leri atar: pdf.js text layer'daki `.endOfContent`
 * seçime girince bütün sayfayı kaplayan bir rect verir. Bir metin satırı bu kadar uzun olmaz.
 */
export function normalizeRects(rects: Box[], page: Box, pageNumber: number): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    if (r.width < 1 || r.height < 1 || r.height > page.height * 0.1) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < page.left || cx > page.left + page.width) continue;
    if (cy < page.top || cy > page.top + page.height) continue;
    const n = {
      page: pageNumber,
      x: (r.left - page.left) / page.width,
      y: (r.top - page.top) / page.height,
      w: r.width / page.width,
      h: r.height / page.height
    };
    const prev = out[out.length - 1];
    const sameLine = prev && Math.abs(prev.y - n.y) < n.h / 2 && Math.abs(prev.h - n.h) < n.h / 2;
    if (sameLine && n.x <= prev.x + prev.w + 0.01) {
      const right = Math.max(prev.x + prev.w, n.x + n.w);
      prev.x = Math.min(prev.x, n.x);
      prev.w = right - prev.x;
    } else {
      out.push(n);
    }
  }
  return out;
}

/** Çok sayfalı bir seçimin rect'lerini sayfalara dağıtır. Rect'i olmayan sayfa sonuca girmez. */
export function selectionRects(rects: Box[], pages: { number: number; box: Box }[]): Rect[] {
  return pages.flatMap((p) => normalizeRects(rects, p.box, p.number));
}

/** Eski kayıtlarda rect'lerin sayfası yoktu. Bütün rect'ler highlight'ın sayfasındaydı. */
export function migrateHighlight(h: Highlight): Highlight {
  return { ...h, rects: h.rects.map((r) => ({ ...r, page: r.page ?? h.page })) };
}

export function pageLabel(h: Highlight): string {
  const last = Math.max(h.page, ...h.rects.map((r) => r.page));
  return last > h.page ? `${h.page}–${last}` : `${h.page}`;
}

export function sortHighlights(hls: Highlight[]): Highlight[] {
  return [...hls].sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0));
}

export function toMarkdown(docName: string, hls: Highlight[]): string {
  const parts = [`# ${docName} — notlar\n`];
  for (const h of sortHighlights(hls)) {
    parts.push(`## Sayfa ${pageLabel(h)}\n\n> ${h.text.replace(/\s*\n\s*/g, " ")}\n`);
    if (h.note.trim()) parts.push(`${h.note.trim()}\n`);
  }
  return parts.join("\n");
}
