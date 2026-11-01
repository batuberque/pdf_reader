const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

/** Yakınlaştırma adımı 0,1'dir. */
export const clampScale = (s: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 10) / 10));

/**
 * Sayfayı kutunun genişliğine sığdıran ölçek. Aşağı yuvarlanır.
 * Yukarı yuvarlanırsa sayfa taşar ve yatay kaydırma çıkar.
 */
export const fitScale = (boxWidth: number, pageWidth: number, pad: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.floor(((boxWidth - pad) / pageWidth) * 100) / 100));
