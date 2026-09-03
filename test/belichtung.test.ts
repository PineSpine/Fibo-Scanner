import { describe, expect, it } from 'vitest';
import { BELICHTUNG_STANDARD, createBelichtungswaechter } from '../src/camera/belichtung.ts';

const SCHRITT = 1000 / 30;

function bild(helligkeit: number, groesse = 512): Uint8Array {
  return new Uint8Array(groesse * groesse).fill(helligkeit);
}

describe('Belichtungswächter', () => {
  it('gilt nicht sofort als eingependelt, auch bei ruhigem Bild', () => {
    const w = createBelichtungswaechter();
    const bericht = w.beobachte(bild(120), 0);
    expect(bericht.eingependelt).toBe(false);
  });

  it('wartet, solange die Automatik das Bild noch aufhellt', () => {
    // So verhält sich ein Telefon nach dem Einschalten: dunkel, dann heller.
    const w = createBelichtungswaechter();
    let bericht = w.beobachte(bild(5), 0);
    for (let i = 1; i <= 30; i++) {
      bericht = w.beobachte(bild(Math.min(5 + i * 4, 125)), i * SCHRITT);
      if (i < 25) expect(bericht.eingependelt).toBe(false);
    }
  });

  it('meldet eingependelt, sobald die Helligkeit steht', () => {
    const w = createBelichtungswaechter();
    let bericht = w.beobachte(bild(5), 0);
    // Aufhellphase
    for (let i = 1; i <= 30; i++) bericht = w.beobachte(bild(Math.min(5 + i * 4, 125)), i * SCHRITT);
    // Ruhephase
    for (let i = 31; i <= 60; i++) bericht = w.beobachte(bild(125), i * SCHRITT);
    expect(bericht.eingependelt).toBe(true);
    expect(bericht.helligkeit).toBeCloseTo(125, 6);
  });

  it('gibt nach der Höchstwartezeit auf, damit flackerndes Licht nicht blockiert', () => {
    const w = createBelichtungswaechter();
    let bericht = w.beobachte(bild(100), 0);
    // Dauerndes Flackern: nie zwei ruhige Bilder in Folge.
    for (let i = 1; i <= 200; i++) {
      bericht = w.beobachte(bild(i % 2 === 0 ? 100 : 140), i * SCHRITT);
    }
    expect(bericht.sekunden).toBeGreaterThan(BELICHTUNG_STANDARD.hoechstensSekunden);
    expect(bericht.eingependelt).toBe(true);
  });

  it('erkennt ein zu dunkles Bild', () => {
    const w = createBelichtungswaechter();
    const dunkel = w.beobachte(bild(10), 0);
    expect(dunkel.zuDunkel).toBe(true);
    w.reset();
    const hell = w.beobachte(bild(90), 0);
    expect(hell.zuDunkel).toBe(false);
  });

  it('fängt nach reset() von vorn an', () => {
    const w = createBelichtungswaechter();
    for (let i = 0; i <= 100; i++) w.beobachte(bild(120), i * SCHRITT);
    expect(w.beobachte(bild(120), 101 * SCHRITT).eingependelt).toBe(true);
    w.reset();
    expect(w.beobachte(bild(120), 0).eingependelt).toBe(false);
  });
});
