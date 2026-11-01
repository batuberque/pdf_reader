import { describe, expect, it } from "vitest";
import { markMatches, matchRanges } from "./search";

describe("arama", () => {
  it("Türkçe büyük harfle yazılan sorguyu bulur (I ↔ ı, İ ↔ i)", () => {
    expect(matchRanges("ışık İstanbul", "IŞIK")).toEqual([[0, 4]]);
    expect(matchRanges("ışık İstanbul", "istanbul")).toEqual([[5, 13]]);
  });

  it("boş sorguda eşleşme vermez", () => {
    expect(matchRanges("abc", "")).toEqual([]);
  });

  it("metindeki HTML'i kaçırır, yalnız eşleşmeyi işaretler", () => {
    expect(markMatches("a<b>c & d", "c")).toBe("a&lt;b&gt;<mark>c</mark> &amp; d");
  });
});
