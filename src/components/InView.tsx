import { type ComponentProps, useEffect, useRef, useState } from "react";

/**
 * Çocukları yalnız kaydırma kutusunda ekrana yakınken bağlar. Uzaktaki sayfaların canvas'ı bellekten çıkar.
 * Yer tutucu `minWidth` ve `minHeight` ile yerini korur. Ölçülen en/boy oranı hatırlanır, sayfa boyları farklı olabilir.
 */
export function InView({
  minWidth,
  minHeight,
  children,
  ...props
}: ComponentProps<"div"> & { minWidth: number; minHeight: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const ratio = useRef(0);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    // Kenar boşluğu yalnız kök kutuya uygulanır. Kök, en yakın kaydırma kutusu olmalı.
    const root = el.closest("[data-scroll-root], [data-slot=scroll-area-viewport]");
    const io = new IntersectionObserver(
      ([e]) => {
        // Çocuklar kalkmadan önce gerçek boyu ölç. İlk çağrıda yer tutucunun kendi boyu ölçülmesin: canvas varsa çizilmiştir.
        if (!e.isIntersecting && el.querySelector("canvas") && el.offsetWidth) {
          ratio.current = el.offsetHeight / el.offsetWidth;
        }
        setNear(e.isIntersecting);
      },
      { root, rootMargin: "100% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ minWidth, minHeight: ratio.current ? minWidth * ratio.current : minHeight }}
      {...props}
    >
      {near && children}
    </div>
  );
}
