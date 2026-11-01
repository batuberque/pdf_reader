import { useEffect, useState } from "react";
import { pivotIndex } from "@/lib/rsvp";

const WORDS = ["Oku.", "İşaretle.", "Not al.", "Hızlan."];

/**
 * Hızlı okuma ekranındaki odak çerçevesinin aynısı. Uygulamanın ne yaptığını kendi yöntemiyle gösterir.
 * "Hareketi azalt" ayarı açıksa ilk kelimede durur.
 */
export function FocusWord() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % WORDS.length), 1400);
    return () => clearInterval(id);
  }, []);

  const word = WORDS[i];
  const p = pivotIndex(word);
  const pivot = [...word.slice(p)][0];

  return (
    <div aria-hidden className="relative w-full py-6 select-none">
      <div className="border-border absolute inset-x-0 top-0 border-t" />
      <div className="bg-border absolute top-0 left-1/2 h-2.5 w-px" />
      <div className="font-display grid grid-cols-[1fr_auto_1fr] text-5xl whitespace-pre sm:text-7xl">
        <span className="text-right">{word.slice(0, p)}</span>
        <span className="text-red-500">{pivot}</span>
        <span className="text-left">{word.slice(p + pivot.length)}</span>
      </div>
      <div className="bg-border absolute bottom-0 left-1/2 h-2.5 w-px" />
      <div className="border-border absolute inset-x-0 bottom-0 border-t" />
    </div>
  );
}
