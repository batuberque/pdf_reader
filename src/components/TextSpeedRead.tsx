import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  MAX_WPM,
  MIN_WPM,
  SpeedReader,
  WPM_KEY,
  clampWpm,
  readWpm
} from "@/components/SpeedReader";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { type Source, countWords, readingTime, splitParagraphs } from "@/lib/rsvp";

const DRAFT_KEY = "rsvp-draft";

function readDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

/** PDF'ten bağımsız hızlı okuma: yapıştırılan metni paragraf paragraf okur. */
export function TextSpeedRead() {
  const [text, setText] = useState(readDraft);
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [wpm, setWpm] = useState(readWpm);

  // Seçim varsa yalnız seçim okunur. Düğme ve istatistik aynı metne bakar.
  const selected = text.slice(sel[0], sel[1]);
  const selWords = useMemo(() => countWords(selected), [selected]);
  const target = selWords ? selected : text;
  const totalWords = useMemo(() => countWords(text), [text]);
  const words = selWords || totalWords;
  const paragraphs = useMemo(() => splitParagraphs(target).length, [target]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, text);
    } catch {
      // Depolama kapalıysa metin yalnız bu sekmede kalır.
    }
  }, [text]);

  const changeWpm = (v: number) => {
    const n = clampWpm(v);
    setWpm(n);
    try {
      // Hızlı okuma ekranı açılırken bu değeri okur. İki yerdeki hız hep aynıdır.
      localStorage.setItem(WPM_KEY, String(n));
    } catch {
      // Depolama kapalıysa hız yalnız bu oturumda kalır.
    }
  };

  const start = () => {
    if (words) setSources(splitParagraphs(target));
  };

  const clear = () => {
    const prev = text;
    setText("");
    setSel([0, 0]);
    toast("Metin temizlendi.", { action: { label: "Geri al", onClick: () => setText(prev) } });
  };

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) return toast.error("Panoda metin yok. Önce bir metin kopyala.");
      setText(clip);
    } catch {
      toast.error("Tarayıcı panoyu okutmadı. Metni alana ⌘/Ctrl+V ile yapıştır.");
    }
  };

  const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        aria-label="Hızlı okunacak metin"
        // Uzun bir makale kartı uzatmasın. Metin alanın içinde kayar.
        className="field-sizing-fixed h-64 resize-none text-sm leading-relaxed"
        placeholder="Bir makaleyi ya da herhangi bir metni buraya yapıştır. Paragraflar ayrı ayrı okunur. Bir bölümü seçersen yalnız o bölüm okunur."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onSelect={(e) => setSel([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            start();
          }
        }}
      />

      <p
        className="text-muted-foreground flex flex-wrap gap-x-4 text-sm tabular-nums"
        data-testid="text-stats"
      >
        {totalWords ? (
          <>
            <span className={selWords ? "text-foreground" : undefined}>
              {selWords
                ? `${words.toLocaleString("tr-TR")} / ${totalWords.toLocaleString("tr-TR")} kelime seçili`
                : `${words.toLocaleString("tr-TR")} kelime`}
            </span>
            <span>{paragraphs} paragraf</span>
            <span>yaklaşık {readingTime(words, wpm)}</span>
          </>
        ) : (
          <span>Henüz metin yok</span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-52 flex-1 items-center gap-3">
          <span className="text-muted-foreground text-sm">Hız</span>
          <Slider
            aria-label="Okuma hızı"
            value={[wpm]}
            min={MIN_WPM}
            max={MAX_WPM}
            step={25}
            onValueChange={([v]) => changeWpm(v)}
          />
          <span className="w-16 text-right text-sm tabular-nums">{wpm} WPM</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {text ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              Temizle
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={paste}>
              <ClipboardPaste /> Panodan yapıştır
            </Button>
          )}
          <Button disabled={!words} onClick={start}>
            <Zap /> {selWords ? "Seçimi hızlı oku" : "Hızlı oku"}
            <KbdGroup aria-hidden className="ml-1 max-sm:hidden">
              <Kbd className="bg-primary-foreground/15 text-primary-foreground">
                {mac ? "⌘" : "Ctrl"}
              </Kbd>
              <Kbd className="bg-primary-foreground/15 text-primary-foreground">↵</Kbd>
            </KbdGroup>
          </Button>
        </div>
      </div>
      {sources && (
        <SpeedReader
          sources={sources}
          unit="Paragraf"
          onClose={() => {
            setSources(null);
            // Hız okuma ekranında değişmiş olabilir.
            setWpm(readWpm());
          }}
        />
      )}
    </div>
  );
}
