import { useSyncExternalStore } from "react";

// `mobile:` varyantıyla aynı olmalı (src/index.css). Dar ekran ya da yan çevrilmiş telefon.
// Yükseklik kuralı 1024 px ile sınırlı. Tablette ekran klavyesi yüksekliği düşürür, düzen yerinden oynamasın.
const MOBILE = "(max-width: 767px), (max-height: 499px) and (max-width: 1023px)";

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export const useMobile = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE).matches,
    () => false
  );
