/**
 * Referenzimplementierung des Sobel-Operators auf der CPU.
 *
 * Im Betrieb rechnet der Shader in gpu/shaders.ts dasselbe. Diese Fassung ist
 * die Vorlage dafuer und die Grundlage der Tests: eine GPU laesst sich nicht
 * ohne Browser pruefen, ein Array schon.
 *
 * Kern nach Sobel/Feldman (1968), wie in Gonzalez/Woods, Digital Image
 * Processing, Kap. 10.2:
 *   gx = [-1 0 1; -2 0 2; -1 0 1]   gy = gx transponiert
 * Der Betrag wird durch 4 geteilt -- die Summe der positiven Gewichte --, damit
 * eine ideale Schwarz-Weiss-Kante genau 255 ergibt und nicht ueberlaeuft.
 * Am Bildrand werden die Randpixel wiederholt.
 */
export function sobelMagnitude(
  gray: Uint8Array,
  width: number,
  height: number,
  out = new Uint8Array(width * height),
): Uint8Array {
  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return gray[cy * width + cx]!;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = at(x - 1, y - 1);
      const tc = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const ml = at(x - 1, y);
      const mr = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const bc = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const gx = tr + 2 * mr + br - tl - 2 * ml - bl;
      const gy = bl + 2 * bc + br - tl - 2 * tc - tr;
      const m = Math.sqrt(gx * gx + gy * gy) / 4;
      out[y * width + x] = m > 255 ? 255 : m;
    }
  }
  return out;
}
