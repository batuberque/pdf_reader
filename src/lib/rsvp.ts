/**
 * RSVP (Rapid Serial Visual Presentation): kelimeler ekranın aynı noktasında tek tek gösterilir.
 * Göz satırda gezinmez, okuma hızı WPM ile ayarlanır.
 */

/** `page` yalnız PDF alıntılarında var. Yapıştırılan metinde yok. */
export type Source = { text: string; page?: number };

export type Token = {
  word: string;
  /** Odak harfinin `word` içindeki indeksi (ORP, optimal recognition point). */
  pivot: number;
  /** Göreli gösterim süresi. Bütün token'ların ortalaması 1'dir. */
  weight: number;
  /** Token'ın geldiği alıntının `sources` içindeki indeksi. */
  source: number;
  /** Cümlenin ya da alıntının ilk kelimesi. Geri/ileri atlama bu noktalara gider. */
  sentenceStart: boolean;
};

const ALNUM = /[\p{L}\p{N}]/u;
const SENTENCE_END = /[.!?…]["'”’»)\]]*$/u;
const CLAUSE_END = /[,;:—–]["'”’»)\]]*$/u;

/** PDF metninde satır sonunda bölünmüş kelimeleri birleştirir ve boşlukları sadeleştirir. */
export function cleanText(text: string): string {
  return text
    .replace(/(\p{L})[-­]\s*\n\s*(\p{Ll})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Odak harfi kelimenin ortasının biraz solundadır. Baştaki noktalama işaretleri atlanır. */
export function pivotIndex(word: string): number {
  const chars = [...word];
  const first = chars.findIndex((c) => ALNUM.test(c));
  if (first < 0) return 0;
  let last = chars.length - 1;
  while (last > first && !ALNUM.test(chars[last])) last--;
  const n = last - first + 1;
  const orp = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  // `word` içindeki UTF-16 indeksi: Türkçe harfler tek birimdir, emoji gibi karakterler iki.
  return chars.slice(0, first + orp).join("").length;
}

/** Normalize edilmeden önceki süre çarpanı. */
function rawWeight(word: string, sourceEnd: boolean): number {
  const letters = [...word].filter((c) => ALNUM.test(c)).length;
  let w = 1 + Math.min(0.6, 0.04 * Math.max(0, letters - 6));
  if (/\p{N}/u.test(word)) w += 0.3;
  if (sourceEnd) w += 1.5;
  else if (SENTENCE_END.test(word)) w += 1.2;
  else if (CLAUSE_END.test(word)) w += 0.5;
  return w;
}

/**
 * Yapıştırılan metni paragraflara böler. Her paragraf sonunda uzun bir duraklama olur.
 * Boş satır varsa paragraf ayırıcı odur. Yoksa (Word'den kopyalanan metin gibi) her satır bir paragraftır.
 */
export function splitParagraphs(text: string): Source[] {
  const sep = /\n\s*\n/.test(text) ? /\n\s*\n/ : /\n/;
  return text
    .split(sep)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ text: t }));
}

/** Gösterilecek kelime sayısı. `tokenize` ile aynı sonucu verir, ama süre hesaplamaz. */
export const countWords = (text: string) =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function tokenize(sources: Source[]): Token[] {
  const tokens: Token[] = [];
  sources.forEach((src, si) => {
    const words: string[] = [];
    // Tek başına duran "—" ya da "«" ekranda boş bir an gibi görünür. Önceki kelimeye ekle.
    // Önünde kelime yoksa (paragraf başı) sonraki kelimeye ekle. Yalnız işaretten oluşan paragraf atlanır.
    let carry = "";
    for (const w of cleanText(src.text).split(" ")) {
      if (!w) continue;
      if (ALNUM.test(w)) {
        words.push(carry + w);
        carry = "";
      } else if (words.length) words[words.length - 1] += " " + w;
      else carry += w + " ";
    }
    words.forEach((word, i) => {
      const prev = tokens[tokens.length - 1];
      tokens.push({
        word,
        pivot: pivotIndex(word),
        weight: rawWeight(word, i === words.length - 1),
        source: si,
        sentenceStart: i === 0 || (!!prev && SENTENCE_END.test(prev.word))
      });
    });
  });
  // Ortalama 1 olunca seçilen WPM gerçek ortalama hızla aynı olur. Duraklamalar hızı düşürmez.
  const mean = tokens.reduce((s, t) => s + t.weight, 0) / (tokens.length || 1);
  for (const t of tokens) t.weight /= mean;
  return tokens;
}

/** Oynatma başladıktan sonraki ilk kelimeler daha yavaş gelir. Göz hıza alışır. */
export const RAMP_WORDS = 5;

export function durationMs(token: Token, wpm: number, sinceStart = RAMP_WORDS): number {
  const ramp = sinceStart < RAMP_WORDS ? 2 - sinceStart / RAMP_WORDS : 1;
  return (token.weight * 60000 * ramp) / wpm;
}

/** Bir sonraki/önceki cümle başı. Cümlenin ortasındaysan `-1` aynı cümlenin başına döner. */
export function seekSentence(tokens: Token[], index: number, dir: 1 | -1): number {
  if (dir === 1) {
    for (let i = index + 1; i < tokens.length; i++) if (tokens[i].sentenceStart) return i;
    return tokens.length - 1;
  }
  let i = index;
  // Zaten cümle başındaysan bir önceki cümleye git.
  if (tokens[i]?.sentenceStart) i--;
  while (i > 0 && !tokens[i].sentenceStart) i--;
  return Math.max(0, i);
}

export function remainingMs(tokens: Token[], index: number, wpm: number): number {
  let total = 0;
  for (let i = index; i < tokens.length; i++) total += durationMs(tokens[i], wpm);
  return total;
}

/** "40 saniye", "4 dakika", "1 saat 5 dakika". Bir dakikadan kısa süre dakikaya yuvarlanmaz. */
export function readingTime(words: number, wpm: number): string {
  const sec = (words / wpm) * 60;
  if (sec < 60) return `${Math.max(5, Math.round(sec / 5) * 5)} saniye`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} dakika`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} saat ${min % 60} dakika` : `${h} saat`;
}

/**
 * pdf.js sayfa metni parçalarını tek metne çevirir. Satır sonu (`hasEOL`) yeni satır olur.
 * `cleanText` sonra satır sonunda bölünmüş kelimeleri birleştirir.
 * İşaretli içerik parçalarında (`str` yok) metin yoktur, atlanır.
 */
export const pageText = (items: ({ str: string; hasEOL?: boolean } | object)[]) =>
  items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : "") : "")).join("");
