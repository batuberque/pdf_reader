const norm = (s: string) => s.toLocaleLowerCase("tr");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Büyük/küçük harfe bakmadan (Türkçe kurallarıyla) eşleşmelerin [başlangıç, bitiş) aralıkları. */
export function matchRanges(text: string, query: string): [number, number][] {
  const t = norm(text);
  const q = norm(query);
  const out: [number, number][] = [];
  if (!q) return out;
  for (let i = t.indexOf(q); i >= 0; i = t.indexOf(q, i + q.length)) out.push([i, i + q.length]);
  return out;
}

/** pdf.js text layer `innerHTML` olarak yazdığı için metin kaçırılır. */
export function markMatches(text: string, query: string): string {
  let out = "";
  let last = 0;
  for (const [a, b] of matchRanges(text, query)) {
    out += `${esc(text.slice(last, a))}<mark>${esc(text.slice(a, b))}</mark>`;
    last = b;
  }
  return out + esc(text.slice(last));
}
