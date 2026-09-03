import type { Frame } from '../metrics/types.ts';
import {
  createContext,
  createProgram,
  createTarget,
  createVideoTexture,
  GpuError,
  type RenderTarget,
} from './context.ts';
import { DOWNSAMPLE_SHADER, PRESENT_SHADER, SOBEL_SHADER, VERTEX_SHADER } from './shaders.ts';

/** Wie viele Auslesevorgaenge gleichzeitig unterwegs sein duerfen. */
const SLOTS = 3;

interface Slot {
  buffer: WebGLBuffer;
  sync: WebGLSync | null;
  timestamp: number;
}

export interface Pipeline {
  /** Kantenlaenge des Messbildes in Pixeln. */
  readonly size: number;
  /** Bild in die Kette geben. Gibt false zurueck, wenn kein Platz frei ist. */
  submit(source: TexImageSource, timestamp: number): boolean;
  /** Fertiges Ergebnis abholen, sonst null. */
  poll(): Frame | null;
  /** Kantenbild in den sichtbaren Puffer zeichnen (Kontrollansicht). */
  present(width: number, height: number, schwelle: number): void;
  dispose(): void;
}

/**
 * Zwei Durchgaenge auf der Grafikkarte, danach ein Rueckweg in den Hauptspeicher.
 *
 * Der Rueckweg ist die eigentliche Schwierigkeit. Ein direktes readPixels haelt
 * die CPU an, bis die Grafikkarte fertig ist; bei 512x512 kostet das je nach
 * Geraet mehrere Millisekunden pro Frame und damit die dreissig Bilder. Deshalb
 * wird in einen Pixelpuffer gelesen, ein Zaun gesetzt und das Ergebnis erst
 * geholt, wenn der Zaun faellt -- ein bis zwei Frames spaeter. Fuer eine
 * Messung, die ohnehin ueber Sekunden gemittelt wird, ist der Versatz belanglos.
 */
export function createPipeline(canvas: HTMLCanvasElement, size = 512): Pipeline {
  const gl = createContext(canvas);

  const downsample = createProgram(gl, VERTEX_SHADER, DOWNSAMPLE_SHADER);
  const sobel = createProgram(gl, VERTEX_SHADER, SOBEL_SHADER);
  const present = createProgram(gl, VERTEX_SHADER, PRESENT_SHADER);

  const gray: RenderTarget = createTarget(gl, size, gl.R8);
  const edges: RenderTarget = createTarget(gl, size, gl.RGBA8);
  const videoTexture = createVideoTexture(gl);
  const vao = gl.createVertexArray();
  if (!vao) throw new GpuError('Vertex-Array konnte nicht angelegt werden.');

  const bytes = size * size * 4;
  const slots: Slot[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const buffer = gl.createBuffer();
    if (!buffer) throw new GpuError('Pixelpuffer konnte nicht angelegt werden.');
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
    slots.push({ buffer, sync: null, timestamp: 0 });
  }
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

  const interleaved = new Uint8Array(bytes);
  let writeIndex = 0;
  let readIndex = 0;
  let inFlight = 0;

  const uDownsample = {
    source: gl.getUniformLocation(downsample, 'uSource'),
    cropOrigin: gl.getUniformLocation(downsample, 'uCropOrigin'),
    cropSize: gl.getUniformLocation(downsample, 'uCropSize'),
    texel: gl.getUniformLocation(downsample, 'uTexel'),
    taps: gl.getUniformLocation(downsample, 'uTaps'),
  };
  const uSobel = {
    gray: gl.getUniformLocation(sobel, 'uGray'),
    size: gl.getUniformLocation(sobel, 'uSize'),
  };
  const uPresent = {
    edges: gl.getUniformLocation(present, 'uEdges'),
    schwelle: gl.getUniformLocation(present, 'uSchwelle'),
    farbe: gl.getUniformLocation(present, 'uFarbe'),
  };

  function sourceDimensions(source: TexImageSource): [number, number] {
    if (source instanceof HTMLVideoElement) return [source.videoWidth, source.videoHeight];
    if (source instanceof HTMLImageElement) return [source.naturalWidth, source.naturalHeight];
    const anySource = source as { width?: number; height?: number };
    return [anySource.width ?? 0, anySource.height ?? 0];
  }

  function submit(source: TexImageSource, timestamp: number): boolean {
    if (inFlight >= SLOTS) return false;
    const [sw, sh] = sourceDimensions(source);
    if (sw === 0 || sh === 0) return false;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // Mittiger quadratischer Ausschnitt in Texturkoordinaten.
    const crop = Math.min(sw, sh);
    const originX = (sw - crop) / 2 / sw;
    const originY = (sh - crop) / 2 / sh;
    // Mindestens zwei Abtastungen je Achse: ein einzelner bilinearer Griff
    // trifft bei nicht ganzzahliger Verkleinerung je Frame andere Quellpixel.
    const taps = Math.max(2, Math.min(8, Math.round(crop / size)));

    gl.useProgram(downsample);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.uniform1i(uDownsample.source, 0);
    gl.uniform2f(uDownsample.cropOrigin, originX, originY);
    gl.uniform2f(uDownsample.cropSize, crop / sw, crop / sh);
    gl.uniform2f(uDownsample.texel, 1 / size, 1 / size);
    gl.uniform1i(uDownsample.taps, taps);
    gl.bindFramebuffer(gl.FRAMEBUFFER, gray.framebuffer);
    gl.viewport(0, 0, size, size);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(sobel);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gray.texture);
    gl.uniform1i(uSobel.gray, 0);
    gl.uniform1i(uSobel.size, size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, edges.framebuffer);
    gl.viewport(0, 0, size, size);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const slot = slots[writeIndex]!;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buffer);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    slot.timestamp = timestamp;
    gl.flush();

    writeIndex = (writeIndex + 1) % SLOTS;
    inFlight++;
    return true;
  }

  function poll(): Frame | null {
    if (inFlight === 0) return null;
    const slot = slots[readIndex]!;
    if (!slot.sync) return null;

    const state = gl.clientWaitSync(slot.sync, 0, 0);
    if (state !== gl.ALREADY_SIGNALED && state !== gl.CONDITION_SATISFIED) return null;

    gl.deleteSync(slot.sync);
    slot.sync = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, interleaved);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    readIndex = (readIndex + 1) % SLOTS;
    inFlight--;

    const count = size * size;
    const grayOut = new Uint8Array(count);
    const edgeOut = new Uint8Array(count);
    for (let i = 0, j = 0; i < count; i++, j += 4) {
      grayOut[i] = interleaved[j]!;
      edgeOut[i] = interleaved[j + 1]!;
    }

    return { gray: grayOut, edges: edgeOut, width: size, height: size, timestamp: slot.timestamp };
  }

  function presentEdges(width: number, height: number, schwelle: number): void {
    canvas.width = width;
    canvas.height = height;
    gl.bindVertexArray(vao);
    gl.useProgram(present);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, edges.texture);
    gl.uniform1i(uPresent.edges, 0);
    gl.uniform1f(uPresent.schwelle, schwelle);
    // Gruenspan aus dem Stylesheet, als Anteile von eins.
    gl.uniform3f(uPresent.farbe, 0.306, 0.478, 0.42);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    for (const slot of slots) {
      if (slot.sync) gl.deleteSync(slot.sync);
      gl.deleteBuffer(slot.buffer);
    }
    gl.deleteTexture(gray.texture);
    gl.deleteTexture(edges.texture);
    gl.deleteTexture(videoTexture);
    gl.deleteFramebuffer(gray.framebuffer);
    gl.deleteFramebuffer(edges.framebuffer);
    gl.deleteProgram(downsample);
    gl.deleteProgram(sobel);
    gl.deleteProgram(present);
    gl.deleteVertexArray(vao);
  }

  return { size, submit, poll, present: presentEdges, dispose };
}
