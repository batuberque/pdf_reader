/**
 * Safari (iOS dahil) ReadableStream'i `for await` ile okuyamaz. pdf.js 6 sayfa metnini bu yolla okur.
 * Bu olmadan Safari'de metin katmanı boş kalır: metin seçilmez, işaret konmaz, arama sonuç vermez.
 */
export async function* streamValues<T>(this: ReadableStream<T>): AsyncGenerator<T, void> {
  const reader = this.getReader();
  let done = false;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) {
        done = true;
        return;
      }
      yield r.value;
    }
  } finally {
    // Döngü erken biterse akış iptal edilir. Standarttaki davranış budur.
    if (done) reader.releaseLock();
    else await reader.cancel().catch(() => {});
  }
}

const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
proto[Symbol.asyncIterator] ??= streamValues;
