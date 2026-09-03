/**
 * Ein Dreieck, das den ganzen Bildschirm ueberdeckt. Groesser als der Viewport,
 * dafuer ohne Vertexpuffer: die Eckpunkte stehen im Shader.
 */
export const VERTEX_SHADER = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Erster Durchgang: aus dem Kamerabild einen mittigen quadratischen Ausschnitt
 * herausschneiden, auf Messaufloesung mitteln und in Graustufen wandeln.
 *
 * Gemittelt wird ueber ein Raster von uTaps x uTaps Abtastungen mit linearer
 * Filterung. Ohne diese Mittelung entstehen beim Verkleinern Treppenmuster, und
 * die Kantenzaehlung reagiert dann auf jede Handbewegung, weil bei jedem Frame
 * andere Quellpixel getroffen werden.
 *
 * Helligkeitsgewichte nach Rec. 709 (BT.709-6, Abschnitt 3.2).
 */
export const DOWNSAMPLE_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uCropOrigin;
uniform vec2 uCropSize;
uniform vec2 uTexel;
uniform int uTaps;
out vec4 outColor;

void main() {
  float n = float(uTaps);
  float acc = 0.0;
  for (int j = 0; j < 8; j++) {
    if (j >= uTaps) break;
    for (int i = 0; i < 8; i++) {
      if (i >= uTaps) break;
      vec2 jitter = (vec2(float(i), float(j)) + 0.5) / n - 0.5;
      vec2 uv = uCropOrigin + (vUv + jitter * uTexel) * uCropSize;
      vec3 c = texture(uSource, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
      acc += dot(c, vec3(0.2126, 0.7152, 0.0722));
    }
  }
  float g = acc / (n * n);
  outColor = vec4(g, g, g, 1.0);
}`;

/**
 * Zweiter Durchgang: Sobel auf dem bereits verkleinerten Graubild.
 *
 * Muss Zeile fuer Zeile dasselbe rechnen wie sobelMagnitude() in
 * metrics/sobel.ts -- diese Fassung laeuft im Betrieb, jene wird getestet.
 * Kern nach Sobel/Feldman (1968), Betrag durch 4 geteilt, Rand geklemmt.
 *
 * R traegt das Graubild weiter, G den Kantenbetrag. Beide zusammen in einem
 * Ziel, damit nur einmal statt zweimal aus dem Grafikspeicher gelesen wird.
 */
export const SOBEL_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uGray;
uniform int uSize;
out vec4 outColor;

float at(ivec2 p) {
  ivec2 c = clamp(p, ivec2(0), ivec2(uSize - 1));
  return texelFetch(uGray, c, 0).r;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float tl = at(p + ivec2(-1, -1));
  float tc = at(p + ivec2( 0, -1));
  float tr = at(p + ivec2( 1, -1));
  float ml = at(p + ivec2(-1,  0));
  float mr = at(p + ivec2( 1,  0));
  float bl = at(p + ivec2(-1,  1));
  float bc = at(p + ivec2( 0,  1));
  float br = at(p + ivec2( 1,  1));

  float gx = tr + 2.0 * mr + br - tl - 2.0 * ml - bl;
  float gy = bl + 2.0 * bc + br - tl - 2.0 * tc - tr;
  float mag = min(length(vec2(gx, gy)) * 0.25, 1.0);

  outColor = vec4(at(p), mag, 0.0, 1.0);
}`;

/**
 * Zeichnet nach, was gezaehlt wurde: genau die Pixel oberhalb des
 * Schwellwerts, in Gruenspan, alles andere durchsichtig.
 *
 * Der Schwellwert kommt als Uniform von der CPU -- er stammt aus Otsu und ist
 * derselbe, mit dem die Kaestchen gezaehlt wurden. Ohne ihn zeigte die
 * Ueberlagerung ein anderes Bild als die Messung, und das waere schlimmer als
 * gar keine Ueberlagerung.
 */
export const PRESENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uEdges;
uniform float uSchwelle;
uniform vec3 uFarbe;
out vec4 outColor;
void main() {
  float m = texture(uEdges, vUv).g;
  // Weicher Einsatz knapp unter der Schwelle, damit die Linien nicht ausfransen.
  float a = smoothstep(uSchwelle - 0.02, uSchwelle + 0.02, m);
  outColor = vec4(uFarbe * a, a);
}`;
