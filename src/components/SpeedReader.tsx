import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  type Source,
  type Token,
  durationMs,
  remainingMs,
  seekSentence,
  tokenize
} from "@/lib/rsvp";
import { cn } from "@/lib/utils";

export const WPM_KEY = "rsvp-wpm";
const PANEL_KEY = "rsvp-text-panel";
export const MIN_WPM = 100;
export const MAX_WPM = 1500;
export const clampWpm = (n: number) => Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(n / 25) * 25));

export function readWpm() {
  try {
    const n = Number(localStorage.getItem(WPM_KEY));
    return n ? clampWpm(n) : 400;
  } catch {
    return 400;
  }
}

function readPanel() {
  try {
    const v = localStorage.getItem(PANEL_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

/**
 * Yan paneldeki bir paragraf. Okuma sırasında yalnız geçerli paragraf yeniden çizilir.
 * Diğer paragrafların props'u değişmez. 20.000 kelimelik bir metinde de panel akıcı kalır.
 */
const Paragraph = memo(function Paragraph({
  words,
  start,
  active,
  read,
  label
}: {
  words: Token[];
  /** İlk kelimenin bütün metindeki indeksi. */
  start: number;
  /** Bu paragraftaki geçerli kelimenin indeksi. Paragraf geçerli değilse `-1`. */
  active: number;
  /** Paragrafın tamamı okundu. */
  read: boolean;
  label?: string;
}) {
  return (
    <p className={cn("mb-3", read && "opacity-50")}>
      {label && (
        <span className="text-muted-foreground mb-0.5 block text-[10px] tracking-wide uppercase">
          {label}
        </span>
      )}
      {words.map((t, i) => {
        const gi = start + i;
        return (
          <span
            key={i}
            data-i={gi}
            className={cn(
              "hover:text-foreground",
              gi === active && "text-foreground rounded-sm bg-yellow-200/60 dark:bg-yellow-500/30",
              active >= 0 && gi < active && "opacity-50"
            )}
          >
            {t.word}{" "}
          </span>
        );
      })}
    </p>
  );
});

const formatTime = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type Props = {
  sources: Source[];
  /** Başlıkta bir kaynağın adı: PDF'te "Alıntı", yapıştırılan metinde "Paragraf". */
  unit?: string;
  onClose: (source: number) => void;
};

export function SpeedReader({ sources, unit = "Alıntı", onClose }: Props) {
  const tokens = useMemo(() => tokenize(sources), [sources]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const [wpm, setWpm] = useState(readWpm);
  const [showText, setShowText] = useState(readPanel);
  const textRef = useRef<HTMLElement>(null);
  const paragraphs = useMemo(() => {
    // Yalnız işaretten oluşan kaynaklar ("***") token vermez. Paragraf sırası kaynak sırası değildir.
    const out: { source: number; start: number; words: Token[] }[] = [];
    tokens.forEach((t, i) => {
      if (out.at(-1)?.source !== t.source) out.push({ source: t.source, start: i, words: [] });
      out[out.length - 1].words.push(t);
    });
    return out;
  }, [tokens]);
  const sinceStart = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  /** `shownIdx` kelimesinin ekrana geldiği planlanan an. `null`: bir sonraki kelimede şimdiden başla. */
  const shownAt = useRef<number | null>(null);
  const shownIdx = useRef(-1);

  const token = tokens[index];
  const close = () => onClose(token?.source ?? 0);

  useEffect(() => {
    try {
      localStorage.setItem(WPM_KEY, String(wpm));
    } catch {
      // Gizli pencerede depolama kapalı olabilir. Hız yalnız bu oturumda kalır.
    }
  }, [wpm]);

  // Her kelimenin bitişi, önceki kelimenin planlanan bitişinden hesaplanır.
  // setTimeout ve React çizimi her kelimede birkaç ms geç kalır. Bu gecikme böylece birikmez.
  useEffect(() => {
    if (!playing || !token) return;
    const now = performance.now();
    if (shownIdx.current !== index || shownAt.current === null) {
      shownAt.current = now;
      shownIdx.current = index;
    }
    // Hız oynatma sırasında değişirse, aynı kelimenin bitişi yeni hızla yeniden hesaplanır.
    const due = shownAt.current + durationMs(token, wpm, sinceStart.current);
    const id = setTimeout(
      () => {
        const late = performance.now() - due;
        // Sekme ya da tarayıcı uzun süre takıldıysa kaçan kelimeleri art arda gösterme.
        shownAt.current = late > 200 ? null : due;
        shownIdx.current = index + 1;
        sinceStart.current++;
        if (index + 1 < tokens.length) setIndex(index + 1);
        else {
          setPlaying(false);
          setDone(true);
        }
      },
      Math.max(0, due - now)
    );
    return () => clearTimeout(id);
  }, [playing, index, wpm, token, tokens.length]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, showText ? "1" : "0");
    } catch {
      // Depolama kapalıysa panel tercihi yalnız bu oturumda kalır.
    }
  }, [showText]);

  // Geçerli kelime panelin orta bandından çıkınca paneli kaydır. Bant içindeyken panel kıpırdamaz.
  useEffect(() => {
    const box = textRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    if (!box || !el) return;
    const h = box.clientHeight;
    if (el.offsetTop < box.scrollTop + h * 0.15 || el.offsetTop > box.scrollTop + h * 0.85) {
      box.scrollTop = el.offsetTop - h / 3;
    }
  }, [index, showText]);

  // Odak arkadaki bir düğmede ya da metin alanında kalırsa Boşluk tuşu onları da tetikler.
  useEffect(() => dialogRef.current?.focus(), []);

  // Sekme arka plandayken tarayıcı zamanlayıcıları yavaşlatır. Okuma da zaten durmuştur.
  useEffect(() => {
    const onHide = () => document.hidden && setPlaying(false);
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const jump = (i: number) => {
    setIndex(Math.min(Math.max(0, i), tokens.length - 1));
    setDone(false);
    sinceStart.current = 0;
    shownAt.current = null;
  };

  const toggle = () => {
    if (done) jump(0);
    else {
      sinceStart.current = 0;
      shownAt.current = null;
    }
    setPlaying((p) => !p || done);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t.closest("[role=slider]") && e.key.startsWith("Arrow")) return;
      if (e.key === " ") toggle();
      else if (e.key === "ArrowLeft") jump(seekSentence(tokens, index, -1));
      else if (e.key === "ArrowRight") jump(seekSentence(tokens, index, 1));
      else if (e.key === "ArrowUp") setWpm((w) => clampWpm(w + 25));
      else if (e.key === "ArrowDown") setWpm((w) => clampWpm(w - 25));
      else if (e.key === "Escape") close();
      else if (e.key === "t") setShowText((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!token) return null;
  const left = token.word.slice(0, token.pivot);
  const pivotChar = [...token.word.slice(token.pivot)][0] ?? "";
  const right = token.word.slice(token.pivot + pivotChar.length);
  // Başlıktaki sayı paneldeki paragraf sırasıdır. Atlanan "***" kaynakları sayılmaz.
  const paraIndex = paragraphs.findIndex((p) => p.source === token.source);
  const { words: context, start: contextStart } = paragraphs[paraIndex];

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Hızlı okuma"
      className="bg-background fixed inset-0 z-50 flex flex-col outline-none"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-sm font-medium">Hızlı okuma</span>
        <span className="text-muted-foreground text-sm">
          {/* Tek parça okunuyorsa (tek işaret ya da tek sayfa) "1 / 1" bilgi vermez. */}
          {paragraphs.length > 1 && `${unit} ${paraIndex + 1} / ${paragraphs.length}`}
          {paragraphs.length > 1 && sources[token.source].page !== undefined && " · "}
          {sources[token.source].page !== undefined && `Sayfa ${sources[token.source].page}`}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto max-md:hidden"
          onClick={() => setShowText((v) => !v)}
          title={showText ? "Metni gizle (T)" : "Metni göster (T)"}
          aria-pressed={showText}
        >
          {showText ? <PanelRightClose /> : <PanelRightOpen />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={close} title="Kapat (Esc)">
          <X />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-10 px-4">
          <div className="relative w-full max-w-3xl py-8">
            {/* Odak çizgileri: odak harfi her kelimede bu iki çizginin arasında kalır. */}
            <div className="border-border absolute inset-x-0 top-0 border-t" />
            <div className="bg-border absolute top-0 left-1/2 h-3 w-px" />
            <div
              aria-live="off"
              className="grid grid-cols-[1fr_auto_1fr] text-4xl font-medium whitespace-pre sm:text-6xl"
            >
              <span className="text-right">{left}</span>
              <span className="text-red-500">{pivotChar}</span>
              <span className="text-left">{right}</span>
            </div>
            <div className="bg-border absolute bottom-0 left-1/2 h-3 w-px" />
            <div className="border-border absolute inset-x-0 bottom-0 border-t" />
          </div>

          {/* Duraklatınca alıntının tamamı görünür. Okuyucu bağlamı kontrol edip devam eder. */}
          <p className="text-muted-foreground h-32 max-w-2xl overflow-auto text-center leading-relaxed">
            {!playing &&
              context.map((t, i) => (
                <span key={i}>
                  <button
                    className={
                      contextStart + i === index
                        ? "text-foreground cursor-pointer rounded bg-yellow-200/60 dark:bg-yellow-500/30"
                        : "hover:text-foreground cursor-pointer"
                    }
                    onClick={() => jump(contextStart + i)}
                  >
                    {t.word}
                  </button>{" "}
                </span>
              ))}
          </p>
        </main>

        {showText && (
          <aside
            ref={textRef}
            aria-label="Metnin tamamı"
            className="text-muted-foreground relative w-80 shrink-0 cursor-pointer overflow-y-auto border-l p-4 text-xs leading-relaxed max-md:hidden xl:w-96"
            onClick={(e) => {
              const i = (e.target as HTMLElement).closest("[data-i]")?.getAttribute("data-i");
              if (i) jump(Number(i));
            }}
          >
            {paragraphs.map((p) => (
              <Paragraph
                key={p.source}
                words={p.words}
                start={p.start}
                active={p.source === token.source ? index : -1}
                read={p.source < token.source}
                label={
                  sources[p.source].page !== undefined
                    ? `Sayfa ${sources[p.source].page}`
                    : undefined
                }
              />
            ))}
          </aside>
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-4 border-t p-4">
        <div className="flex items-center gap-3 text-sm tabular-nums">
          <span className="text-muted-foreground w-24">
            {index + 1} / {tokens.length}
          </span>
          <Slider
            aria-label="Konum"
            value={[index]}
            min={0}
            max={Math.max(0, tokens.length - 1)}
            onValueChange={([v]) => jump(v)}
          />
          <span className="text-muted-foreground w-24 text-right">
            −{formatTime(remainingMs(tokens, index, wpm))}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => jump(seekSentence(tokens, index, -1))}
              title="Önceki cümle (←)"
            >
              <SkipBack />
            </Button>
            <Button size="icon-lg" onClick={toggle} title="Oynat / duraklat (Boşluk)">
              {done ? <RotateCcw /> : playing ? <Pause /> : <Play />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => jump(seekSentence(tokens, index, 1))}
              title="Sonraki cümle (→)"
            >
              <SkipForward />
            </Button>
          </div>
          <div className="flex w-72 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setWpm((w) => clampWpm(w - 25))}
              title="Yavaşlat (↓)"
            >
              <Minus />
            </Button>
            <Slider
              aria-label="Okuma hızı"
              value={[wpm]}
              min={MIN_WPM}
              max={MAX_WPM}
              step={25}
              onValueChange={([v]) => setWpm(v)}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setWpm((w) => clampWpm(w + 25))}
              title="Hızlandır (↑)"
            >
              <Plus />
            </Button>
            <span className="w-24 text-right text-sm whitespace-nowrap tabular-nums">
              {wpm} WPM
            </span>
          </div>
        </div>
        {/* Klavye kısayolları dokunmatik ekranda işe yaramaz. */}
        <p className="text-muted-foreground text-center text-xs pointer-coarse:hidden">
          Boşluk: oynat/duraklat · ← →: cümle · ↑ ↓: hız · T: metin · Esc: kapat
        </p>
      </footer>
    </div>
  );
}
