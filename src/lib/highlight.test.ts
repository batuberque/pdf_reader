import { describe, expect, it } from "vitest";
import {
  type Highlight,
  migrateHighlight,
  normalizeRects,
  pageLabel,
  selectionRects,
  toMarkdown
} from "./highlight";

const page = (scale: number) => ({ left: 100, top: 50, width: 600 * scale, height: 800 * scale });
const rect = (scale: number, x: number, y: number, w: number, h: number) => ({
  left: 100 + x * scale,
  top: 50 + y * scale,
  width: w * scale,
  height: h * scale
});

describe("normalizeRects", () => {
  // Highlight zoom 1x'te kaydedilip 2x'te çizilir. Normalize değer aynı kalmazsa işaret kayar.
  it("gives the same result at every zoom level", () => {
    const at = (s: number) => normalizeRects([rect(s, 60, 80, 120, 16)], page(s), 1);
    expect(at(2)).toEqual(at(1));
    expect(at(1)[0]).toEqual({ page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.02 });
  });

  // pdf.js text layer bir satırı birçok span'a böler. Birleştirmezsek üst üste binen rect'ler koyu görünür.
  it("merges touching rects on the same line, keeps separate lines", () => {
    const rs = normalizeRects(
      [rect(1, 60, 80, 50, 16), rect(1, 110, 80, 70, 16), rect(1, 60, 100, 100, 16)],
      page(1),
      1
    );
    expect(rs).toHaveLength(2);
    expect(rs[0].w).toBeCloseTo(0.2);
  });

  // Seçim sonraki sayfaya taşarsa o rect'ler bu sayfaya yanlış konumda çizilir.
  // pdf.js `.endOfContent` bütün sayfayı kaplar. Atmazsak bütün sayfa boyanır.
  it("drops empty, off-page and page-sized rects", () => {
    const rs = [rect(1, 10, 900, 50, 16), rect(1, 10, 10, 0, 16), rect(1, 0, 0, 600, 800)];
    expect(normalizeRects(rs, page(1), 1)).toEqual([]);
  });
});

describe("selectionRects", () => {
  // 20 sayfalık bir seçim: her sayfanın rect'leri kendi sayfasına göre normalize edilmeli.
  // Yalnız ilk sayfayı alırsak metin 20 sayfayı içerir, işaret yalnız 1 sayfada görünür.
  it("splits a multi-page selection into rects of each page", () => {
    const p1 = { left: 100, top: 0, width: 600, height: 800 };
    const p2 = { ...p1, top: 820 };
    const rs = selectionRects(
      [
        { left: 160, top: 720, width: 300, height: 16 },
        { left: 160, top: 900, width: 300, height: 16 }
      ],
      [
        { number: 1, box: p1 },
        { number: 2, box: p2 }
      ]
    );
    expect(rs.map((r) => r.page)).toEqual([1, 2]);
    expect(rs[0].y).toBeCloseTo(0.9);
    expect(rs[1].y).toBeCloseTo(0.1);
  });
});

describe("migrateHighlight", () => {
  // Eski kayıtlarda rect'in sayfası yoktu. Sayfa eklenmezse eski highlight'lar hiç çizilmez.
  it("gives old rects the highlight's page", () => {
    const old = { id: "a", page: 7, rects: [{ x: 0, y: 0, w: 1, h: 0.01 }] } as Highlight;
    expect(migrateHighlight(old).rects[0].page).toBe(7);
    expect(pageLabel(migrateHighlight(old))).toBe("7");
  });
});

describe("toMarkdown", () => {
  const hl = (page: number, y: number, text: string, note = ""): Highlight => ({
    id: text,
    page,
    rects: [{ page, x: 0, y, w: 0.1, h: 0.01 }],
    text,
    color: "",
    note,
    createdAt: 0
  });

  // Highlight'lar oluşturma sırasıyla saklanır. Dışa aktarım kitabın okuma sırasında olmalı.
  it("orders by page and position, includes notes", () => {
    const md = toMarkdown("kitap.pdf", [
      hl(3, 0.1, "C"),
      hl(1, 0.5, "B", "önemli"),
      hl(1, 0.2, "A")
    ]);
    expect(md.indexOf("> A")).toBeLessThan(md.indexOf("> B"));
    expect(md.indexOf("> B")).toBeLessThan(md.indexOf("> C"));
    expect(md).toContain("## Sayfa 3");
    expect(md).toContain("önemli");
  });

  it("labels a multi-page highlight with its page range", () => {
    const h = hl(3, 0.5, "uzun");
    h.rects.push({ page: 5, x: 0, y: 0.1, w: 0.1, h: 0.01 });
    expect(toMarkdown("k.pdf", [h])).toContain("## Sayfa 3–5");
  });
});
