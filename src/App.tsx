import { useEffect, useRef, useState } from "react";
import { FileText, FileUp, Library, Lock, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FocusWord } from "@/components/FocusWord";
import { Reader } from "@/components/Reader";
import { TextSpeedRead } from "@/components/TextSpeedRead";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type DocMeta, type LibraryDoc, deleteDoc, listDocs, loadPdf, saveDoc } from "@/lib/store";
import { cn } from "@/lib/utils";

const TAB_KEY = "home-tab";

function readTab() {
  try {
    return localStorage.getItem(TAB_KEY) === "text" ? "text" : "pdf";
  } catch {
    return "pdf";
  }
}

const rtf = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });

/** Son bir haftada "bugün", "dün", "3 gün önce". Daha eskisinde tarih. */
function openedLabel(t: number) {
  const day = (x: number) => new Date(x).setHours(0, 0, 0, 0);
  const days = Math.round((day(t) - day(Date.now())) / 86_400_000);
  if (days > -7) return rtf.format(days, "day");
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/** Hızlı okuma ekranındaki odak çerçevesinin küçük hâli. */
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
      <path d="M3 5h18M3 19h18M12 5v3M12 16v3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.5" y="9.5" width="3" height="5" rx="1" className="fill-red-500" />
    </svg>
  );
}

export default function App() {
  const [open, setOpen] = useState<{ meta: DocMeta; file: Blob } | null>(null);
  const [docs, setDocs] = useState<LibraryDoc[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState(readTab);
  const [filter, setFilter] = useState("");
  // Silinen PDF 6 saniye boyunca geri alınabilir. Süre dolana kadar depoda durur, listeden gizlenir.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = docs?.filter((d) => !hidden.has(d.id));
  const shown = (visible ?? []).filter((d) =>
    d.name.toLocaleLowerCase("tr").includes(filter.trim().toLocaleLowerCase("tr"))
  );

  const refresh = () => listDocs().then(setDocs);
  useEffect(() => {
    if (!open) refresh();
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      // Depolama kapalıysa sekme tercihi yalnız bu oturumda kalır.
    }
  }, [tab]);

  const restore = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setHidden((h) => new Set([...h].filter((x) => x !== id)));
  };

  const removeDoc = (d: LibraryDoc) => {
    setHidden((h) => new Set(h).add(d.id));
    timers.current.set(
      d.id,
      setTimeout(async () => {
        timers.current.delete(d.id);
        await deleteDoc(d.id);
        refresh();
      }, 6000)
    );
    toast(`${d.name.replace(/\.pdf$/i, "")} silindi.`, {
      duration: 6000,
      description: "PDF ve notları silinecek.",
      action: { label: "Geri al", onClick: () => restore(d.id) }
    });
  };

  const openFile = async (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return toast.error(`${file.name} bir PDF değil. Yalnız PDF dosyaları açılır.`);
    }
    let meta: DocMeta;
    try {
      meta = await saveDoc(file);
    } catch (e) {
      // Depo dolu veya tarayıcı yazmayı engelliyor (gizli pencere gibi). Hata adı sebebi gösterir.
      // PDF yine de açılır. Kitaplığa girmez, işaretler kaydedilmez.
      const now = Date.now();
      toast.warning("PDF tarayıcı deposuna kaydedilemedi. PDF yine de açıldı.", {
        description: `Kitaplığa eklenmedi ve işaretlerin kaydedilmeyecek. Depo doluysa kitaplıktan bir PDF sil. Gizli sekmede depo kapalı olabilir. Hata kodu: ${e instanceof Error ? e.name : "bilinmiyor"}.`,
        duration: 10_000
      });
      return setOpen({
        meta: {
          id: crypto.randomUUID(),
          name: file.name,
          addedAt: now,
          openedAt: now,
          lastPage: 1
        },
        file
      });
    }
    // Az önce silinen PDF yeniden açıldıysa zamanlanmış silme iptal olur.
    restore(meta.id);
    // Depodan açılır. Kayıt okunamıyorsa elindeki dosya açılır.
    return openSaved(meta, file);
  };

  const openSaved = async (meta: DocMeta, fallback?: Blob) => {
    const file = (await loadPdf(meta.id).catch(() => undefined)) ?? fallback;
    if (!file) return toast.error("PDF tarayıcı deposunda bulunamadı. Dosyayı tekrar aç.");
    setOpen({ meta, file });
  };

  if (open) {
    return (
      <>
        <Toaster />
        <Reader key={open.meta.id} {...open} onClose={() => setOpen(null)} />
      </>
    );
  }

  return (
    <div
      className="min-h-dvh"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
        setTab("pdf");
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        openFile(e.dataTransfer.files[0]);
      }}
    >
      <Toaster />
      <header className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 pt-6 sm:px-6">
        <Mark className="size-6" />
        <h1 className="font-display text-lg">PDF Okuyucu</h1>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="grid items-start gap-x-12 gap-y-14 pt-12 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-3">
            <section className="mb-9 flex flex-col items-center gap-5 text-center">
              <FocusWord />
              <p className="text-muted-foreground max-w-md text-base leading-relaxed text-pretty">
                Bir PDF aç ya da bir metin yapıştır. Önemli yerleri işaretle, notlarını al,
                istediğin hızda oku.
              </p>
            </section>
            <Card className="gap-0 py-0">
              <Tabs value={tab} onValueChange={setTab} className="gap-0">
                <div className="border-b px-4 pt-3">
                  <TabsList variant="line" className="h-10">
                    <TabsTrigger value="pdf">PDF aç</TabsTrigger>
                    <TabsTrigger value="text">Metin yapıştır</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="pdf" className="p-4">
                  <button
                    onClick={() => inputRef.current?.click()}
                    className={cn(
                      "group/drop hover:bg-muted/50 focus-visible:ring-ring/50 flex h-64 w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed transition-colors outline-none focus-visible:ring-[3px]",
                      dragging && "border-primary bg-muted/70"
                    )}
                  >
                    <span className="bg-muted text-foreground flex size-12 items-center justify-center rounded-xl">
                      <FileUp className="size-6" />
                    </span>
                    <span className="flex flex-col items-center gap-1">
                      <span className="text-base font-medium">
                        {dragging ? "Bırak, PDF açılsın" : "PDF'i buraya bırak"}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        ya da bilgisayarından seç
                      </span>
                    </span>
                    <span className={buttonVariants({ variant: "outline", size: "sm" })}>
                      PDF seç
                    </span>
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(e) => openFile(e.target.files?.[0])}
                  />
                </TabsContent>
                <TabsContent value="text" className="p-4">
                  <TextSpeedRead />
                </TabsContent>
              </Tabs>
            </Card>
            <p className="text-muted-foreground flex items-center gap-2 px-1 text-sm">
              <Lock className="size-3.5 shrink-0" />
              Dosyaların ve notların yalnız bu tarayıcıda kalır. Hiçbir sunucuya yüklenmez.
            </p>
          </div>

          <aside aria-labelledby="library-title" className="flex flex-col gap-3">
            <h2 id="library-title" className="font-display flex items-baseline gap-2 text-lg">
              Kitaplığın
              {!!visible?.length && (
                <span className="text-muted-foreground font-sans text-sm tabular-nums">
                  {visible.length}
                </span>
              )}
            </h2>

            {visible && !visible.length && (
              <Empty className="border p-6 md:p-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Library />
                  </EmptyMedia>
                  <EmptyTitle>Kitaplığın boş</EmptyTitle>
                  <EmptyDescription>
                    Açtığın PDF'ler işaretleri ve notlarıyla birlikte burada durur. Kaldığın sayfa
                    da saklanır.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            {!!visible && visible.length >= 5 && (
              <label className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Kitaplıkta ara…"
                  aria-label="Kitaplıkta ara"
                  className="bg-background focus-visible:ring-ring/50 h-8 w-full rounded-md border pr-2 pl-8 text-sm outline-none focus-visible:ring-[3px]"
                />
              </label>
            )}

            {!!visible?.length && !shown.length && (
              <p className="text-muted-foreground px-1 text-sm">
                "{filter.trim()}" ile eşleşen PDF yok.
              </p>
            )}

            {!!shown.length && (
              <ul className="-mx-2 flex flex-col">
                {shown.map((d) => {
                  const pct = d.numPages ? Math.round((d.lastPage / d.numPages) * 100) : 0;
                  return (
                    <li
                      key={d.id}
                      className="group hover:bg-muted/60 relative flex items-start gap-3 rounded-lg p-2 transition-colors"
                    >
                      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                        <FileText className="size-4" />
                      </span>
                      <button
                        className="focus-visible:after:ring-ring/50 min-w-0 flex-1 cursor-pointer text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-[3px]"
                        onClick={() => openSaved(d)}
                      >
                        <span
                          className="font-display line-clamp-2 text-[15px] leading-snug break-words"
                          title={d.name}
                        >
                          {d.name.replace(/\.pdf$/i, "")}
                        </span>
                        <span className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                          {d.numPages ? (
                            <span className="flex items-center gap-2">
                              <Progress
                                value={pct}
                                indicatorColor="bg-red-500"
                                className="bg-muted h-1 w-14"
                                aria-label="Okuma ilerlemesi"
                              />
                              Sayfa {d.lastPage} / {d.numPages}
                              <span className="text-foreground/70">%{pct}</span>
                            </span>
                          ) : (
                            <span>Sayfa {d.lastPage}</span>
                          )}
                          {d.highlights > 0 && (
                            <span className="flex items-center gap-1.5">
                              <span className="size-2 rounded-[2px] bg-yellow-300" />
                              {d.highlights} işaret
                            </span>
                          )}
                          <span>{openedLabel(d.openedAt)}</span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="PDF'i ve notlarını sil"
                        aria-label={`${d.name} dosyasını sil`}
                        className="relative z-10 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                        onClick={() => removeDoc(d)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
