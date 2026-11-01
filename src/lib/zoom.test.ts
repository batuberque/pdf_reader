import { describe, expect, it } from "vitest";
import { clampScale, fitScale } from "./zoom";

describe("sığdırma", () => {
  it("sayfa hiçbir ekran genişliğinde kutudan taşmaz", () => {
    // Taşma, mobilde yatay kaydırma demektir. Okuyucu her satırı kaydırarak okumak zorunda kalır.
    for (const box of [320, 360, 390, 412, 768, 1280]) {
      for (const page of [595, 612, 842]) {
        expect(page * fitScale(box, page, 16)).toBeLessThanOrEqual(box - 16);
      }
    }
  });

  it("dar ekranda en düşük ölçeğin altına inmez", () => {
    expect(fitScale(100, 612, 16)).toBe(0.25);
  });

  it("geniş ekranda en yüksek ölçeği aşmaz", () => {
    expect(fitScale(5000, 200, 32)).toBe(3);
  });
});

describe("yakınlaştırma adımı", () => {
  it("0,1'lik adıma yuvarlar ve sınırda durur", () => {
    expect(clampScale(1.24)).toBe(1.2);
    expect(clampScale(0.05)).toBe(0.25);
    expect(clampScale(9)).toBe(3);
  });
});
