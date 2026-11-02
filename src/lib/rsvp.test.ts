import { describe, expect, it } from "vitest";
import {
  RAMP_WORDS,
  cleanText,
  countWords,
  durationMs,
  pageText,
  pivotIndex,
  readingTime,
  seekSentence,
  splitParagraphs,
  tokenize
} from "./rsvp";

const text =
  "Okuma hızı, göz hareketleriyle sınırlıdır. RSVP bu hareketleri kaldırır! " +
  "Ama anlama oranı 2016 çalışmalarına göre düşebilir.";

describe("tokenize + durationMs", () => {
  // Kullanıcı 800 WPM seçince bir dakikada ortalama 800 kelime görmeli.
  // Noktalama duraklamaları toplam süreyi uzatırsa ayar yalan söyler.
  it("keeps the real average speed equal to the chosen WPM", () => {
    const tokens = tokenize([
      { text, page: 1 },
      { text: "İkinci alıntı burada.", page: 4 }
    ]);
    for (const wpm of [300, 800]) {
      const total = tokens.reduce((s, t) => s + durationMs(t, wpm), 0);
      expect(total).toBeCloseTo((tokens.length * 60000) / wpm, 6);
    }
  });

  // Cümle sonunda kısa bir duraklama anlamayı artırır. Virgül daha kısa durur.
  it("pauses longer at sentence ends than at commas, and at commas than mid-sentence", () => {
    const t = tokenize([{ text, page: 1 }]);
    const w = (word: string) => t.find((x) => x.word === word)!.weight;
    expect(w("sınırlıdır.")).toBeGreaterThan(w("hızı,"));
    expect(w("hızı,")).toBeGreaterThan(w("göz"));
  });

  // Alıntılar arasında geçiş, yeni bir konuya geçiştir. En uzun duraklama burada olmalı.
  it("pauses longest at the end of each highlight and marks the next as a sentence start", () => {
    const t = tokenize([
      { text: "bir iki üç", page: 1 },
      { text: "dört beş altı.", page: 2 }
    ]);
    expect(t[2].weight).toBeGreaterThan(t[1].weight);
    expect(t[3]).toMatchObject({ word: "dört", source: 1, sentenceStart: true });
  });

  // Tek başına "—" ekranda anlamsız bir flaş olur.
  it("attaches standalone punctuation to the previous word", () => {
    expect(tokenize([{ text: "bekle — sonra", page: 1 }]).map((t) => t.word)).toEqual([
      "bekle —",
      "sonra"
    ]);
  });

  // Hızlanma süresi yalnız oynatmanın ilk kelimelerinde etkili olmalı.
  it("shows the first words slower after play, then normal speed", () => {
    const [t] = tokenize([{ text: "kelime", page: 1 }]);
    expect(durationMs(t, 600, 0)).toBeCloseTo(2 * durationMs(t, 600));
    expect(durationMs(t, 600, RAMP_WORDS)).toBe(durationMs(t, 600));
  });
});

describe("cleanText", () => {
  // PDF satır sonunda kelimeyi böler. Birleştirmezsek "oku-" ve "mak" iki ayrı flaş olur.
  it("joins words hyphenated across lines, keeps Turkish letters", () => {
    expect(cleanText("hızlı oku-\nmak  için\nçalışmak")).toBe("hızlı okumak için çalışmak");
  });

  // "Ankara-\nİstanbul" bir bölünme değil, gerçek bir tire.
  it("keeps a real hyphen before a capital letter", () => {
    expect(cleanText("Ankara-\nİstanbul")).toBe("Ankara- İstanbul");
  });
});

describe("pivotIndex", () => {
  // Göz kelimenin ortasının biraz soluna odaklanır. Odak harfi ekranda sabit kalır.
  it("picks the ORP letter and skips leading punctuation", () => {
    expect(pivotIndex("a")).toBe(0);
    expect(pivotIndex("okuma")).toBe(1);
    expect(pivotIndex("çalışmalarına")).toBe(3);
    expect(pivotIndex("«merhaba»")).toBe(3);
  });
});

describe("seekSentence", () => {
  const t = tokenize([{ text: "Bir iki. Üç dört beş. Altı yedi.", page: 1 }]);
  // ← cümlenin ortasında: aynı cümlenin başına dön. Cümle başında: önceki cümleye git.
  it("goes back to the current, then the previous sentence start", () => {
    expect(seekSentence(t, 4, -1)).toBe(2);
    expect(seekSentence(t, 2, -1)).toBe(0);
    expect(seekSentence(t, 0, -1)).toBe(0);
  });
  it("goes forward to the next sentence start", () => {
    expect(seekSentence(t, 2, 1)).toBe(5);
    expect(seekSentence(t, 6, 1)).toBe(6);
  });
});

describe("splitParagraphs", () => {
  // Makale web'den kopyalanınca paragraflar boş satırla ayrılır. Satır içi kırılmalar paragrafı bölmemeli.
  it("splits on blank lines when they exist", () => {
    const ps = splitParagraphs("Birinci paragraf\nikinci satırı.\n\n\r\nİkinci paragraf.\n");
    expect(ps.map((p) => p.text)).toEqual(["Birinci paragraf\nikinci satırı.", "İkinci paragraf."]);
    expect(ps[0].page).toBeUndefined();
  });

  // Word'den kopyalanan metinde boş satır yoktur. Her satır bir paragraftır.
  it("splits on single newlines when there is no blank line", () => {
    expect(splitParagraphs("Bir.\r\nİki.\nÜç.").map((p) => p.text)).toEqual([
      "Bir.",
      "İki.",
      "Üç."
    ]);
  });

  // Ekrandaki kelime sayısı ve süre tahmini, okuma ekranında gösterilen kelimelerle aynı olmalı.
  it("countWords matches the number of tokens shown", () => {
    const text = "Okuma — hızı, göz hareketleriyle sınırlıdır.\n\n« RSVP » bunu 2016'da ölçtü !";
    expect(countWords(text)).toBe(tokenize(splitParagraphs(text)).length);
  });
});

describe("tokenize punctuation at paragraph start", () => {
  // Paragraf başındaki tek "«" ayrı bir flaş olmamalı. "***" gibi ayırıcı paragraflar okunmaz.
  it("attaches leading punctuation to the next word and skips punctuation-only paragraphs", () => {
    const t = tokenize(splitParagraphs("« RSVP » çalışır.\n\n***\n\nSon."));
    expect(t.map((x) => x.word)).toEqual(["« RSVP »", "çalışır.", "Son."]);
    expect(t[0].pivot).toBe(3);
  });
});

describe("readingTime", () => {
  // 30 saniyelik bir metin "1 dakika" yazarsa kullanıcı süreyi 2 kat fazla sanar.
  it("does not round a short text up to a minute", () => {
    expect(readingTime(200, 400)).toBe("30 saniye");
  });
  it("switches to minutes and hours", () => {
    expect(readingTime(1850, 425)).toBe("4 dakika");
    expect(readingTime(26_000, 400)).toBe("1 saat 5 dakika");
  });
});

describe("pageText", () => {
  // "Bu sayfayı hızlı oku" sayfanın metnini bu yolla alır. Satırlar yapışırsa kelimeler birleşir, okuma bozulur.
  it("satır sonlarında kelimeleri ayırır", () => {
    const words = tokenize([
      { text: pageText([{ str: "Birinci", hasEOL: true }, { str: "satır" }]) }
    ]);
    expect(words.map((t) => t.word)).toEqual(["Birinci", "satır"]);
  });

  it("satır sonunda bölünmüş kelimeyi birleştirir", () => {
    const words = tokenize([{ text: pageText([{ str: "oku-", hasEOL: true }, { str: "ma" }]) }]);
    expect(words.map((t) => t.word)).toEqual(["okuma"]);
  });

  it("metin taşımayan işaretli içerik parçalarını atlar", () => {
    expect(pageText([{ type: "beginMarkedContent" }, { str: "metin" }])).toBe("metin");
  });
});
