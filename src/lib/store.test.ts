import { beforeEach, describe, expect, it, vi } from "vitest";

const db = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => void db.set(k, v),
  update: async () => undefined,
  keys: async () => [...db.keys()],
  delMany: async () => undefined
}));

const { loadPdf, saveDoc } = await import("./store");

const pdf = () =>
  new File([new Uint8Array([37, 80, 68, 70])], "a.pdf", { type: "application/pdf" });

describe("PDF deposu", () => {
  beforeEach(() => db.clear());

  it("PDF'i File olarak değil bayt olarak yazar", async () => {
    // iOS Safari, File/Blob'u IndexedDB'ye yazarken hata verebilir. ArrayBuffer her yerde çalışır.
    const meta = await saveDoc(pdf());
    const stored = db.get(`pdf:${meta.id}`);
    expect(stored).toBeInstanceOf(ArrayBuffer);
    expect(stored).not.toBeInstanceOf(Blob);
  });

  it("yeni kaydı Blob olarak geri verir", async () => {
    const meta = await saveDoc(pdf());
    const blob = await loadPdf(meta.id);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.size).toBe(4);
    expect(blob!.type).toBe("application/pdf");
  });

  it("eski Blob kaydını da açar", async () => {
    // Bu değişiklikten önce kaydedilen PDF'ler Blob olarak durur. Kitaplıkta kaybolmamalı.
    const legacy = pdf();
    db.set("pdf:old", legacy);
    expect(await loadPdf("old")).toBe(legacy);
  });

  it("olmayan PDF için undefined verir", async () => {
    expect(await loadPdf("yok")).toBeUndefined();
  });
});
