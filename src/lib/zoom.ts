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

/**
 * iOS Safari tek canvas'ta yaklaşık 16,7 milyon pikseli aşınca çizimi bırakır. Bellek dolunca sekmeyi öldürür.
 * Yakınlaştırınca canvas piksel sayısı ölçeğin karesiyle büyür.
 * 5.242.880, pdf.js'in iOS için kullandığı `maxCanvasPixels` değeridir.
 */
const MAX_CANVAS_PX = 5_242_880;

/** Cihaz oranı en çok 2 olur. Canvas MAX_CANVAS_PX'i aşacaksa oran düşer. */
export const canvasDpr = (deviceDpr: number, cssW: number, cssH: number) =>
  Math.min(deviceDpr, 2, Math.sqrt(MAX_CANVAS_PX / (cssW * cssH)));
