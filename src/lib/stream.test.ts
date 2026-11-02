import { describe, expect, it } from "vitest";
import { streamValues } from "./stream";

// pdf.js getTextContent() parçaları `for await` ile toplar. Polyfill bir parçayı kaçırırsa sayfa metni eksik çıkar.
const chunks = (items: string[], onCancel?: () => void) =>
  new ReadableStream<string>({
    start(c) {
      for (const i of items) c.enqueue(i);
      c.close();
    },
    cancel: onCancel
  });

describe("ReadableStream polyfill'i", () => {
  it("bütün parçaları sırayla verir", async () => {
    const out: unknown[] = [];
    for await (const v of streamValues.call(chunks(["a", "b", "c"]))) out.push(v);
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("akış bitince kilidi bırakır, akış yeniden okunabilir", async () => {
    const s = chunks(["a"]);
    for await (const _ of streamValues.call(s));
    expect(s.locked).toBe(false);
  });

  it("döngü erken biterse akışı iptal eder", async () => {
    let cancelled = false;
    const s = chunks(["a", "b"], () => void (cancelled = true));
    for await (const _ of streamValues.call(s)) break;
    expect(cancelled).toBe(true);
  });

  it("akış hatasını yutmaz", async () => {
    const s = new ReadableStream({ start: (c) => c.error(new Error("bozuk")) });
    await expect(async () => {
      for await (const _ of streamValues.call(s));
    }).rejects.toThrow("bozuk");
  });
});
