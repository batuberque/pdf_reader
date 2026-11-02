import { Download, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { type Highlight, pageLabel, sortHighlights, toMarkdown } from "@/lib/highlight";
import { cn } from "@/lib/utils";

type Props = {
  docName: string;
  highlights: Highlight[];
  activeId: string | null;
  /** `jump`: kullanıcı listeden işarete atlamak istedi. Not alanına odaklanmak atlama değildir. */
  onSelect: (h: Highlight, jump?: boolean) => void;
  /** `from` verilirse okuma o işaretten başlar. Yoksa ilk işaretten. */
  onSpeedRead: (from?: Highlight) => void;
  onChange: (id: string, patch: Partial<Highlight>) => void;
  onDelete: (id: string) => void;
};

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function NotesPanel({
  docName,
  highlights,
  activeId,
  onSelect,
  onSpeedRead,
  onChange,
  onDelete
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-medium">Notlar ({highlights.length})</span>
        <div className="flex gap-1">
          <Button
            size="sm"
            disabled={!highlights.length}
            onClick={() => onSpeedRead()}
            title="Bütün işaretleri baştan hızlı oku (r)"
          >
            <Zap /> Hızlı oku
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!highlights.length}
            onClick={() =>
              download(
                docName.replace(/\.pdf$/i, "") + "-notlar.md",
                toMarkdown(docName, highlights)
              )
            }
          >
            <Download /> Markdown
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {!highlights.length && (
          <p className="text-muted-foreground p-4 text-sm">
            PDF'te bir metin seç ve bir renk seç. İşaretlediğin yerler burada listelenir.
          </p>
        )}
        <ul className="flex flex-col gap-3 p-3">
          {sortHighlights(highlights).map((h) => (
            <li
              key={h.id}
              className={cn(
                "bg-card rounded-lg border p-3",
                h.id === activeId && "ring-ring ring-1"
              )}
            >
              {/* `block` şart: Safari satır içi düğmede kısaltılmamış metnin boyu kadar boşluk bırakır. Uzun işaret kartı ekran boyu uzar. */}
              <button
                className="block w-full cursor-pointer border-l-4 pl-2 text-left text-sm"
                style={{ borderColor: h.color }}
                onClick={() => onSelect(h, true)}
              >
                <span className="line-clamp-4">{h.text}</span>
              </button>
              <Textarea
                className="mt-2 min-h-16 text-sm"
                placeholder="Not ekle…"
                value={h.note}
                onFocus={() => onSelect(h)}
                onChange={(e) => onChange(h.id, { note: e.target.value })}
              />
              <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
                <span className="mr-auto">Sayfa {pageLabel(h)}</span>
                {/* Üstteki "Hızlı oku" hep ilk işaretten başlar. Kullanıcı ortadaki bir işarete buradan döner. */}
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-foreground mobile:h-11 mobile:px-3 mobile:text-sm"
                  onClick={() => onSpeedRead(h)}
                  title="Bu işaretten başlayarak hızlı oku"
                >
                  <Zap /> Buradan oku
                </Button>
                {/* Yalnız simge, telefonda silmenin yeri belli olmuyordu. Yazı ve geniş dokunma alanı. */}
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-destructive mobile:h-11 mobile:px-3 mobile:text-sm"
                  onClick={() => onDelete(h.id)}
                >
                  <Trash2 /> İşareti sil
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
