import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Outline, Page, Thumbnail, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Minus,
  MoveHorizontal,
  Plus,
  Search,
  Trash2,
  X
} from "lucide-react";
import { toast } from "sonner";
import { NotesPanel } from "@/components/NotesPanel";
import { SpeedReader } from "@/components/SpeedReader";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COLORS, type Highlight, type Rect, selectionRects, sortHighlights } from "@/lib/highlight";
import { markMatches, matchRanges } from "@/lib/search";
import { type DocMeta, loadHighlights, saveHighlights, touchDoc } from "@/lib/store";

// react-pdf: worker ayarı Document/Page kullanan modülde olmalı.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type Pending = { page: number; rects: Rect[]; text: string; x: number; y: number };
type Editing = { id: string; x: number; y: number };
type Pdf = pdfjs.PDFDocumentProxy;

const clampScale = (s: number) => Math.min(3, Math.max(0.5, Math.round(s * 10) / 10));

export function Reader({
  meta,
  file,
  onClose
}: {
  meta: DocMeta;
  file: Blob;
  onClose: () => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [page, setPage] = useState(meta.lastPage);
  const [highlights, setHighlights] = useState<Highlight[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasOutline, setHasOutline] = useState(true);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ page: number; count: number }[]>([]);
  const [hitIdx, setHitIdx] = useState(0);
  const pageWidth = useRef(0);
  const pageTexts = useRef(new Map<number, string[]>());
  const searchRef = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedPages = useRef(0);
  const ordered = useMemo(() => sortHighlights(highlights ?? []), [highlights]);
  const speedSources = useMemo(
    () => (speedOpen ? ordered.map((h) => ({ text: h.text, page: h.page })) : []),
    [speedOpen, ordered]
  );

  const goTo = (n: number) => {
    const target = Math.min(Math.max(1, n), numPages || 1);
    // IntersectionObserver geç güncellenir. Hızlı basılan tuşlar eski sayfadan saymasın.
    setPage(target);
    document.getElementById(`page-${target}`)?.scrollIntoView({ block: "start" });
  };

  // Sayfa metinleri bir kez okunur. Her tuşta yalnız sayım yeniden yapılır.
  useEffect(() => {
    if (!pdf || !q) return setHits([]);
    let stale = false;
    (async () => {
      const out: { page: number; count: number }[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        let items = pageTexts.current.get(p);
        if (!items) {
          const tc = await (await pdf.getPage(p)).getTextContent();
          items = tc.items.map((i) => ("str" in i ? i.str : ""));
          pageTexts.current.set(p, items);
        }
        if (stale) return;
        const count = items.reduce((n, s) => n + matchRanges(s, q).length, 0);
        if (count) out.push({ page: p, count });
      }
      setHits(out);
      setHitIdx(0);
      if (out[0]) goTo(out[0].page);
    })();
    return () => {
      stale = true;
    };
    // goTo her çizimde yeniden oluşur. Arama yalnız pdf ve sorgu değişince çalışır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, q]);

  const stepHit = (d: number) => {
    if (!hits.length) return;
    const i = (hitIdx + d + hits.length) % hits.length;
    setHitIdx(i);
    goTo(hits[i].page);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  // shortcut: yalnız tek metin parçası içindeki eşleşmeler boyanır. Parçalar arası eşleşme sayılmaz, gerekirse text layer birleştirilir.
  const renderText = useCallback(
    ({ str }: { str: string }) => (q ? markMatches(str, q) : str),
    [q]
  );

  const fitWidth = () => {
    const box = scrollRef.current;
    if (box && pageWidth.current) setScale(clampScale((box.clientWidth - 32) / pageWidth.current));
  };

  useEffect(() => {
    loadHighlights(meta.id).then(setHighlights);
  }, [meta.id]);

  useEffect(() => {
    if (highlights) saveHighlights(meta.id, highlights);
  }, [meta.id, highlights]);

  useEffect(() => {
    touchDoc(meta.id, { lastPage: page });
  }, [meta.id, page]);

  // Ekranın dikey ortasından geçen sayfa, geçerli sayfadır.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !numPages) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setPage(Number(e.target.id.slice(5)));
      },
      { root, rootMargin: "-50% 0px -50% 0px" }
    );
    root.querySelectorAll("[id^=page-]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [numPages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!speedOpen && (e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        searchRef.current?.select();
        return;
      }
      if (speedOpen || t.closest("textarea, input") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "j") goTo(page + 1);
      else if (e.key === "ArrowLeft" || e.key === "k") goTo(page - 1);
      else if (e.key === "+" || e.key === "=") setScale((s) => clampScale(s + 0.1));
      else if (e.key === "-") setScale((s) => clampScale(s - 0.1));
      else if (e.key === "w") fitWidth();
      else if (e.key === "Escape") {
        setPending(null);
        setEditing(null);
      } else if (e.key === "r" && ordered.length) setSpeedOpen(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Seçimsiz tıklama bir işaretin üstündeyse renk ve silme çubuğunu açar. */
  const openEditor = (e: MouseEvent) => {
    for (const el of document.querySelectorAll<HTMLElement>(".react-pdf__Page")) {
      const b = el.getBoundingClientRect();
      const n = Number(el.dataset.pageNumber);
      const x = (e.clientX - b.left) / b.width;
      const y = (e.clientY - b.top) / b.height;
      const hit = ordered.find((h) =>
        h.rects.some(
          (r) => r.page === n && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
        )
      );
      if (hit) {
        setActiveId(hit.id);
        return setEditing({
          id: hit.id,
          x: Math.min(Math.max(e.clientX, 80), window.innerWidth - 80),
          y: Math.min(e.clientY + 16, window.innerHeight - 48)
        });
      }
    }
    setEditing(null);
  };

  const removeHighlight = (id: string) => {
    const h = highlights?.find((x) => x.id === id);
    if (!h) return;
    setHighlights((hs) => hs?.filter((x) => x.id !== id) ?? hs);
    setEditing(null);
    toast("İşaret silindi.", {
      action: { label: "Geri al", onClick: () => setHighlights((hs) => [...(hs ?? []), h]) }
    });
  };

  const onMouseUp = (e: MouseEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setPending(null);
      return openEditor(e);
    }
    setEditing(null);
    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    if (!text) return setPending(null);
    // Seçim birden fazla sayfaya yayılabilir. Seçimin dikey aralığına giren bütün sayfalara bak.
    const span = range.getBoundingClientRect();
    const pages = [...document.querySelectorAll<HTMLElement>(".react-pdf__Page")]
      .map((el) => ({ number: Number(el.dataset.pageNumber), box: el.getBoundingClientRect() }))
      .filter((p) => p.box.bottom >= span.top && p.box.top <= span.bottom);
    const rects = selectionRects([...range.getClientRects()], pages);
    if (!rects.length) return setPending(null);
    // Çubuk fareyi bıraktığın noktada çıkar. Seçimin kutusu ekranın dışına taşabilir.
    setPending({
      page: rects[0].page,
      rects,
      text,
      x: Math.min(Math.max(e.clientX, 80), window.innerWidth - 80),
      y: Math.min(e.clientY + 16, window.innerHeight - 48)
    });
  };

  const addHighlight = (color: string) => {
    if (!pending) return;
    const h: Highlight = {
      id: crypto.randomUUID(),
      page: pending.page,
      rects: pending.rects,
      text: pending.text,
      color,
      note: "",
      createdAt: Date.now()
    };
    setHighlights((hs) => [...(hs ?? []), h]);
    setActiveId(h.id);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  const onPageLoaded = (p: { originalWidth: number }) => {
    pageWidth.current ||= p.originalWidth;
    loadedPages.current += 1;
    // Bütün sayfaların boyu belli olunca son okunan sayfaya dön.
    if (loadedPages.current === numPages && meta.lastPage > 1) goTo(meta.lastPage);
  };

  return (
    <Document
      file={file}
      suspense={false}
      onLoadSuccess={(pdf) => {
        setPdf(pdf);
        setNumPages(pdf.numPages);
        touchDoc(meta.id, { numPages: pdf.numPages });
      }}
      onItemClick={({ pageNumber }) => goTo(pageNumber)}
      loading={<p className="text-muted-foreground p-8">PDF yükleniyor…</p>}
      error={<p className="text-destructive p-8">PDF açılamadı.</p>}
      className="flex h-dvh flex-col"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Kitaplığa dön">
          <ArrowLeft />
        </Button>
        <span className="truncate text-sm font-medium">{meta.name}</span>
        <div className="ml-auto flex items-center gap-1 text-sm">
          {searchOpen ? (
            <div className="flex items-center gap-1">
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") stepHit(e.shiftKey ? -1 : 1);
                  else if (e.key === "Escape") closeSearch();
                }}
                placeholder="PDF'te ara…"
                className="bg-background focus-visible:ring-ring/50 h-7 w-44 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
              />
              <span className="text-muted-foreground w-14 text-center text-xs tabular-nums">
                {q ? (hits.length ? `${hitIdx + 1}/${hits.length} sf.` : "yok") : ""}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => stepHit(-1)}
                title="Önceki (Shift+Enter)"
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => stepHit(1)}
                title="Sonraki (Enter)"
              >
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={closeSearch}
                title="Aramayı kapat (Esc)"
              >
                <X />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSearchOpen(true)}
              title="Ara (Ctrl/⌘+F)"
            >
              <Search />
            </Button>
          )}
          <span className="text-muted-foreground tabular-nums">
            {page} / {numPages}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setScale((s) => clampScale(s - 0.1))}
            title="Uzaklaştır (-)"
          >
            <Minus />
          </Button>
          <span className="w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setScale((s) => clampScale(s + 0.1))}
            title="Yakınlaştır (+)"
          >
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={fitWidth} title="Genişliğe sığdır (w)">
            <MoveHorizontal />
          </Button>
        </div>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="18%" minSize="10%" collapsible>
          <Tabs defaultValue="outline" className="flex h-full flex-col p-2">
            <TabsList className="w-full">
              <TabsTrigger value="outline">İçindekiler</TabsTrigger>
              <TabsTrigger value="pages">Sayfalar</TabsTrigger>
            </TabsList>
            <TabsContent value="outline" className="min-h-0">
              <ScrollArea className="h-full">
                {!hasOutline && (
                  <p className="text-muted-foreground p-2 text-sm">Bu PDF'te içindekiler yok.</p>
                )}
                <Outline
                  className="outline-list text-sm"
                  onLoadSuccess={(o) => setHasOutline(!!o?.length)}
                />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="pages" className="min-h-0">
              <ScrollArea className="h-full">
                <div className="flex flex-col items-center gap-3 py-2">
                  {Array.from({ length: numPages }, (_, i) => (
                    <div
                      key={i}
                      className={i + 1 === page ? "ring-primary rounded ring-2" : undefined}
                    >
                      <Thumbnail pageNumber={i + 1} width={120} />
                      <p className="text-muted-foreground text-center text-xs">{i + 1}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle withHandle />

        <ResizablePanel minSize="30%">
          <div ref={scrollRef} onMouseUp={onMouseUp} className="bg-muted h-full overflow-auto">
            {/* ponytail: bütün sayfalar render edilir. 300+ sayfada yavaşlarsa sanallaştır. */}
            <div className="flex w-max min-w-full flex-col items-center gap-4 p-4">
              {Array.from({ length: numPages }, (_, i) => (
                <div key={i} id={`page-${i + 1}`} className="shadow-md">
                  <Page
                    pageNumber={i + 1}
                    scale={scale}
                    onLoadSuccess={onPageLoaded}
                    customTextRenderer={renderText}
                  >
                    {highlights?.flatMap((h) =>
                      h.rects.map((r, j) =>
                        r.page !== i + 1 ? null : (
                          <div
                            key={`${h.id}-${j}`}
                            className="hl-rect"
                            style={{
                              left: `${r.x * 100}%`,
                              top: `${r.y * 100}%`,
                              width: `${r.w * 100}%`,
                              height: `${r.h * 100}%`,
                              background: h.color,
                              outline: h.id === activeId ? `2px solid ${h.color}` : undefined,
                              outlineOffset: 2
                            }}
                          />
                        )
                      )
                    )}
                  </Page>
                </div>
              ))}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="25%" minSize="15%" collapsible>
          <NotesPanel
            docName={meta.name}
            highlights={highlights ?? []}
            activeId={activeId}
            onSpeedRead={() => setSpeedOpen(true)}
            onSelect={(h) => {
              setActiveId(h.id);
              goTo(h.page);
            }}
            onChange={(id, patch) =>
              setHighlights((hs) => hs?.map((h) => (h.id === id ? { ...h, ...patch } : h)) ?? hs)
            }
            onDelete={removeHighlight}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {speedOpen && (
        <SpeedReader
          sources={speedSources}
          onClose={(source) => {
            setSpeedOpen(false);
            const h = ordered[source];
            if (h) {
              setActiveId(h.id);
              goTo(h.page);
            }
          }}
        />
      )}

      {(pending || editing) && (
        <div
          className="bg-popover fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border p-1 shadow-lg"
          style={{ left: (pending ?? editing)!.x, top: (pending ?? editing)!.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                if (pending) return addHighlight(c);
                setHighlights(
                  (hs) => hs?.map((h) => (h.id === editing!.id ? { ...h, color: c } : h)) ?? hs
                );
                setEditing(null);
              }}
              className="size-6 cursor-pointer rounded-full border"
              style={{ background: c }}
              title={pending ? "İşaretle" : "Rengi değiştir"}
            />
          ))}
          {editing && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => removeHighlight(editing.id)}
              title="İşareti sil"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      )}
    </Document>
  );
}
