import { delMany, get, keys, set, update } from "idb-keyval";
import { type Highlight, migrateHighlight } from "@/lib/highlight";

export type DocMeta = {
  id: string;
  name: string;
  addedAt: number;
  openedAt: number;
  lastPage: number;
  /** PDF ilk kez okuyucuda açılınca kaydedilir. Eski kayıtlarda yok. */
  numPages?: number;
};

export type LibraryDoc = DocMeta & { highlights: number };

/** Aynı PDF farklı adla açılsa da aynı notlara ulaşır. */
export async function hashFile(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function saveDoc(file: File): Promise<DocMeta> {
  // iOS Safari, File ya da Blob'u IndexedDB'ye yazarken hata verebilir. Baytlar ArrayBuffer olarak yazılır.
  const data = await file.arrayBuffer();
  const id = await hashFile(data);
  const now = Date.now();
  const meta = (await get<DocMeta>(`doc:${id}`)) ?? {
    id,
    name: file.name,
    addedAt: now,
    openedAt: now,
    lastPage: 1
  };
  meta.openedAt = now;
  // Önce büyük PDF yazılır. Depo dolarsa kitaplıkta PDF'siz kayıt kalmaz.
  await set(`pdf:${id}`, data);
  await set(`doc:${id}`, meta);
  return meta;
}

export async function listDocs(): Promise<LibraryDoc[]> {
  const ids = (await keys()).map(String).filter((k) => k.startsWith("doc:"));
  const docs = (await Promise.all(ids.map((k) => get<DocMeta>(k)))).filter(
    (d): d is DocMeta => !!d
  );
  const hls = await Promise.all(docs.map((d) => get<Highlight[]>(`hl:${d.id}`)));
  return docs
    .map((d, i) => ({ ...d, highlights: hls[i]?.length ?? 0 }))
    .sort((a, b) => b.openedAt - a.openedAt);
}

/** Eski kayıtlar Blob, yenileri ArrayBuffer. İkisi de Blob olarak döner. */
export async function loadPdf(id: string): Promise<Blob | undefined> {
  const stored = await get<Blob | ArrayBuffer>(`pdf:${id}`);
  return !stored || stored instanceof Blob
    ? stored
    : new Blob([stored], { type: "application/pdf" });
}

/** Okuma ve yazma tek işlemdedir. Aynı anda gelen iki güncelleme birbirini silmez. */
export const touchDoc = (id: string, patch: Partial<DocMeta>) =>
  update<DocMeta | undefined>(`doc:${id}`, (meta) => meta && { ...meta, ...patch }).catch(() => {
    // Kaldığın sayfa ve sayfa sayısı yalnız kolaylıktır. Depo kapalıysa okumayı bozma.
    // Asıl veri (işaretler) kaydedilemezse Reader kullanıcıya bildirir.
  });

export const deleteDoc = (id: string) => delMany([`doc:${id}`, `pdf:${id}`, `hl:${id}`]);

export const loadHighlights = async (id: string) =>
  ((await get<Highlight[]>(`hl:${id}`)) ?? []).map(migrateHighlight);
export const saveHighlights = (id: string, hls: Highlight[]) => set(`hl:${id}`, hls);
