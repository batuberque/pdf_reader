import {
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Document, Outline, Page, Thumbnail, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  List,
  Minus,
  MoveHorizontal,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X
} from "lucide-react";
import { toast } from "sonner";
import { InView } from "@/components/InView";
import { NotesPanel } from "@/components/NotesPanel";
import { SpeedReader } from "@/components/SpeedReader";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COLORS, type Highlight, type Rect, selectionRects, sortHighlights } from "@/lib/highlight";
import { useMobile } from "@/lib/media";
import { markMatches, matchRanges } from "@/lib/search";
import { type DocMeta, loadHighlights, saveHighlights, touchDoc } from "@/lib/store";
import { cn } from "@/lib/utils";
import { canvasDpr, clampScale, fitScale } from "@/lib/zoom";

// react-pdf: worker ayarı Document/Page kullanan modülde olmalı.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type Pending = { page: number; rects: Rect[]; text: string; x: number; y: number };
type Editing = { id: string; x: number; y: number };
type Pdf = pdfjs.PDFDocumentProxy;

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
  const mobile = useMobile();
  // Mobilde yan paneller çekmecedir. Aynı anda yalnız biri açık olur.
  const [sheet, setSheet] = useState<"nav" | "notes" | null>(null);
  // İlk yüklenen sayfanın boyu. Yüklenmeyen sayfaların yer tutucusu bu boyu kullanır.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const pageW = dims?.w ?? 0;
  const est = dims ?? { w: 612, h: 792 };
  const anchor = useRef<{ x: number; page: string | null; f: number } | null>(null);
  const restored = useRef(false);
  // Kullanıcı elle yakınlaştırdıysa ekran dönünce sayfa yeniden sığdırılmaz.
  const zoomed = useRef(false);
  const loadedHighlights = useRef<Highlight[] | null>(null);
  const pageTexts = useRef(new Map<number, string[]>());
  const searchRef = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const padding = mobile ? 16 : 32;

  /** Ölçeği değiştirir ve ekranın ortasındaki noktayı yerinde tutar. Yoksa her + ya da − okunan yeri kaydırır. */
  const rescale = (next: number | ((s: number) => number)) => {
    const b = scrollRef.current;
    if (b) {
      // Konum sayfa numarası ve sayfa içi kesirle tutulur. Sayfa araları sabit px olduğu için toplam yükseklik oranı ölçekle orantılı değildir.
      const top = b.getBoundingClientRect().top;
      const mid = top + b.clientHeight / 2;
      let hit: HTMLElement | null = null;
      for (const el of b.querySelectorAll<HTMLElement>("[id^=page-]")) {
        hit = el;
        if (el.getBoundingClientRect().bottom >= mid) break;
      }
      anchor.current = {
        x: (b.scrollLeft + b.clientWidth / 2) / (b.scrollWidth || 1),
        page: hit?.id ?? null,
        f: hit ? (mid - hit.getBoundingClientRect().top) / (hit.offsetHeight || 1) : 0
      };
    }
    setScale(next);
  };

  useLayoutEffect(() => {
    const b = scrollRef.current;
    const a = anchor.current;
    if (!b || !a) return;
    anchor.current = null;
    b.scrollLeft = a.x * b.scrollWidth - b.clientWidth / 2;
    const el = a.page ? document.getElementById(a.page) : null;
    if (el) {
      const y = el.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop;
      b.scrollTop = y + a.f * el.offsetHeight - b.clientHeight / 2;
    }
  }, [scale]);

  const fitWidth = () => {
    zoomed.current = false;
    const box = scrollRef.current;
    if (box && pageW) rescale(fitScale(box.clientWidth, pageW, padding));
  };

  const zoom = (d: number) => {
    zoomed.current = true;
    rescale((s) => clampScale(s + d));
  };

  // Sayfalar yer tutucuyla boyutlanır. İlk sayfanın boyu belli olunca son okunan sayfaya dön.
  useEffect(() => {
    if (!dims || restored.current) return;
    restored.current = true;
    if (meta.lastPage > 1) goTo(meta.lastPage);
    // goTo her çizimde yeniden oluşur. Dönüş yalnız ilk boy belli olunca bir kez yapılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims]);

  // Mobilde sayfa ekranın genişliğine sığar. Ekran dönünce de sığar, elle yakınlaştırılmadıysa.
  useEffect(() => {
    const box = scrollRef.current;
    if (!mobile || !box || !pageW) return;
    zoomed.current = false;
    const ro = new ResizeObserver(() => {
      if (!zoomed.current) rescale(fitScale(box.clientWidth, pageW, 16));
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [mobile, pageW]);

  useEffect(() => {
    loadHighlights(meta.id).then((h) => {
      loadedHighlights.current = h;
      setHighlights(h);
    });
  }, [meta.id]);

  useEffect(() => {
    // Yüklenen liste olduğu gibi geri yazılmaz. Gereksiz yazma olur, kapalı depoda da yanlış alarm verir.
    if (!highlights || highlights === loadedHighlights.current) return;
    saveHighlights(meta.id, highlights).catch(() =>
      // Aynı `id` ile her yazmada yeni bildirim açılmaz.
      toast.error("İşaretler kaydedilemedi.", {
        id: "save-failed",
        description: "Depo kapalı ya da dolu. Sekmeyi kapatınca işaretler kaybolur."
      })
    );
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
    // shortcut: mobil ile masaüstü arası geçişte kaydırma kutusu yeniden oluşur ve konum başa döner. Telefon yan çevrilince geçiş olmaz. Yalnız masaüstünde pencereyi daraltmak ya da tablette bölünmüş ekran geçiş yapar. Gerekirse goTo(page) çağır.
  }, [numPages, mobile]);

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
      else if (e.key === "+" || e.key === "=") zoom(0.1);
      else if (e.key === "-") zoom(-0.1);
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

  /** Seçili metinden bekleyen işareti çıkarır. Seçim boşsa hiçbir şey yapmaz. */
  const captureSelection = (clientX: number, clientY: number) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
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
      x: Math.min(Math.max(clientX, 80), window.innerWidth - 80),
      y: Math.min(clientY + 16, window.innerHeight - 48)
    });
  };

  // Pointer olayı mouseup'ın aksine iOS Safari'de dokunuşta da gelir. Fare ve parmak aynı yoldan geçer.
  const onPointerUp = (e: MouseEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setPending(null);
      return openEditor(e);
    }
    captureSelection(e.clientX, e.clientY);
  };

  // Dokunmatik seçimde parmak kalkınca olay gelmez. Tutamaçları sürüklemek yalnız selectionchange üretir.
  // Bekleyen işaret burada silinmez. Renk düğmesine basmak seçimi bozabilir. Sayfaya dokunmak onPointerUp'ta siler.
  useEffect(() => {
    if (!mobile) return;
    let t: ReturnType<typeof setTimeout>;
    const onChange = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const sel = window.getSelection();
        if (
          sel?.rangeCount &&
          scrollRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)
        ) {
          captureSelection(0, 0);
        }
      }, 250);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      clearTimeout(t);
      document.removeEventListener("selectionchange", onChange);
    };
    // captureSelection yalnız state setter'larını ve DOM'u kullanır. Eski kapanış zarar vermez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);

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

  const onPageLoaded = (p: { originalWidth: number; originalHeight: number }) =>
    setDims((d) => d ?? { w: p.originalWidth, h: p.originalHeight });

  // Mobilde canvas'ın piksel sayısı sınırlanır. Masaüstü olduğu gibi kalır.
  const pageDpr = mobile
    ? canvasDpr(window.devicePixelRatio || 1, est.w * scale, est.h * scale)
    : undefined;

  const compactSearch = mobile && searchOpen;
  const bar = pending ?? editing;

  // Mobilde sidebar ve notes çekmecede, masaüstünde panelde durur. Aynı JSX, tek kopya.
  const sidebar = (
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
              <InView
                key={i}
                minWidth={120}
                minHeight={(120 * est.h) / est.w + 20}
                className={i + 1 === page ? "ring-primary rounded ring-2" : undefined}
              >
                <Thumbnail pageNumber={i + 1} width={120} />
                <p className="text-muted-foreground text-center text-xs">{i + 1}</p>
              </InView>
            ))}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );

  const notes = (
    <NotesPanel
      docName={meta.name}
      highlights={highlights ?? []}
      activeId={activeId}
      onSpeedRead={() => {
        // Açık çekmece Hızlı okuma ekranının odağını çalar. Önce kapat.
        setSheet(null);
        setSpeedOpen(true);
      }}
      onSelect={(h, jump) => {
        setActiveId(h.id);
        goTo(h.page);
        // Çekmece sayfayı örter. Listeden atlayınca kapat. Not alanına odaklanınca açık kalmalı.
        if (jump) setSheet(null);
      }}
      onChange={(id, patch) =>
        setHighlights((hs) => hs?.map((h) => (h.id === id ? { ...h, ...patch } : h)) ?? hs)
      }
      onDelete={removeHighlight}
    />
  );

  const pdfView = (
    <div
      ref={scrollRef}
      data-scroll-root
      onPointerUp={onPointerUp}
      className="bg-muted h-full overflow-auto"
    >
      <div className="mobile:p-2 flex w-max min-w-full flex-col items-center gap-4 p-4">
        {Array.from({ length: numPages }, (_, i) => (
          <InView
            key={i}
            id={`page-${i + 1}`}
            className="bg-white shadow-md"
            minWidth={est.w * scale}
            minHeight={est.h * scale}
          >
            <Page
              pageNumber={i + 1}
              scale={scale}
              devicePixelRatio={pageDpr}
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
          </InView>
        ))}
      </div>
    </div>
  );

  return (
    <Document
      file={file}
      suspense={false}
      onLoadSuccess={(pdf) => {
        setPdf(pdf);
        setNumPages(pdf.numPages);
        touchDoc(meta.id, { numPages: pdf.numPages });
      }}
      onItemClick={({ pageNumber }) => {
        setSheet(null);
        goTo(pageNumber);
      }}
      loading={<p className="text-muted-foreground p-8">PDF yükleniyor…</p>}
      error={<p className="text-destructive p-8">PDF açılamadı.</p>}
      className="flex h-dvh flex-col"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="mobile:size-11"
          onClick={onClose}
          title="Kitaplığa dön"
          aria-label="Kitaplığa dön"
        >
          <ArrowLeft />
        </Button>
        {!compactSearch && <span className="truncate text-sm font-medium">{meta.name}</span>}
        <div
          className={cn(
            "ml-auto flex items-center gap-1 text-sm",
            compactSearch && "min-w-0 flex-1"
          )}
        >
          {searchOpen ? (
            <div className="mobile:flex-1 flex min-w-0 items-center gap-1">
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
                // 16 px altı yazı iOS Safari'de odaklanınca sayfayı yakınlaştırır.
                className="bg-background focus-visible:ring-ring/50 mobile:h-9 mobile:min-w-0 mobile:flex-1 mobile:text-base h-7 w-44 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
              />
              <span className="text-muted-foreground mobile:w-auto w-14 text-center text-xs whitespace-nowrap tabular-nums">
                {q ? (hits.length ? `${hitIdx + 1}/${hits.length}` : "yok") : ""}
                {!!hits.length && <span className="mobile:hidden"> sf.</span>}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="mobile:size-11"
                onClick={() => stepHit(-1)}
                title="Önceki (Shift+Enter)"
                aria-label="Önceki eşleşme"
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="mobile:size-11"
                onClick={() => stepHit(1)}
                title="Sonraki (Enter)"
                aria-label="Sonraki eşleşme"
              >
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="mobile:size-11"
                onClick={closeSearch}
                title="Aramayı kapat (Esc)"
                aria-label="Aramayı kapat"
              >
                <X />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              className="mobile:size-11"
              onClick={() => setSearchOpen(true)}
              title="Ara (Ctrl/⌘+F)"
              aria-label="Ara"
            >
              <Search />
            </Button>
          )}
          {!compactSearch && (
            <span className="text-muted-foreground tabular-nums">
              {page} / {numPages}
            </span>
          )}
          {/* Mobilde yakınlaştırma düğmeleri alt çubukta. */}
          <div className="mobile:hidden flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => zoom(-0.1)}
              title="Uzaklaştır (-)"
            >
              <Minus />
            </Button>
            <span className="w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => zoom(0.1)}
              title="Yakınlaştır (+)"
            >
              <Plus />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={fitWidth} title="Genişliğe sığdır (w)">
              <MoveHorizontal />
            </Button>
          </div>
        </div>
      </header>

      {mobile ? (
        <>
          <div className="min-h-0 flex-1">{pdfView}</div>
          <nav className="flex h-14 shrink-0 items-center justify-between border-t px-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              onClick={() => setSheet("nav")}
              aria-label="İçindekiler ve sayfalar"
            >
              <List />
            </Button>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                onClick={() => zoom(-0.1)}
                aria-label="Uzaklaştır"
              >
                <Minus />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                onClick={fitWidth}
                aria-label="Genişliğe sığdır"
              >
                <MoveHorizontal />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                onClick={() => zoom(0.1)}
                aria-label="Yakınlaştır"
              >
                <Plus />
              </Button>
            </div>
            <Button variant="ghost" className="h-11 px-3" onClick={() => setSheet("notes")}>
              <StickyNote /> Notlar ({highlights?.length ?? 0})
            </Button>
          </nav>
          <Sheet open={sheet === "nav"} onOpenChange={(o) => !o && setSheet(null)}>
            <SheetContent side="left" title="İçindekiler ve sayfalar">
              {sidebar}
            </SheetContent>
          </Sheet>
          <Sheet open={sheet === "notes"} onOpenChange={(o) => !o && setSheet(null)}>
            <SheetContent side="bottom" title="Notlar">
              {notes}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="18%" minSize="10%" collapsible>
            {sidebar}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel minSize="30%">{pdfView}</ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="25%" minSize="15%" collapsible>
            {notes}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

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

      {bar && (
        <div
          // Mobilde çubuk alt çubuğun üstünde sabittir. Parmağın ve yerel kopyala menüsünün altında kalmaz.
          className={cn(
            "bg-popover fixed z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border p-1 shadow-lg select-none",
            mobile && "bottom-16 left-1/2"
          )}
          style={mobile ? undefined : { left: bar.x, top: bar.y }}
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
              className="mobile:size-11 size-6 cursor-pointer rounded-full border"
              style={{ background: c }}
              title={pending ? "İşaretle" : "Rengi değiştir"}
              aria-label={pending ? "İşaretle" : "Rengi değiştir"}
            />
          ))}
          {editing && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="mobile:size-11"
              onClick={() => removeHighlight(editing.id)}
              title="İşareti sil"
              aria-label="İşareti sil"
            >
              <Trash2 />
            </Button>
          )}
        </div>
      )}
    </Document>
  );
}
