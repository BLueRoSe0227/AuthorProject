// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadDomScripts } from './helpers/loadDomApp.js';

beforeAll(() => {
  loadDomScripts(['js/theme.js']);
});

describe('Theme.hexToHsl / hslToHex round trip', () => {
  it('recovers approximately the same hex after converting to HSL and back', () => {
    ['#8b7bff', '#ffffff', '#000000', '#fff2cc', '#ff5e7e'].forEach((hex) => {
      const { h, s, l } = Theme.hexToHsl(hex);
      const back = Theme.hslToHex(h, s, l);
      // Rounding through float HSL math can be off by a shade — assert per-channel closeness.
      const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const b = [1, 3, 5].map((i) => parseInt(back.slice(i, i + 2), 16));
      a.forEach((channel, i) => expect(Math.abs(channel - b[i])).toBeLessThanOrEqual(2));
    });
  });
});

describe('Theme.adjustForContrast', () => {
  it('returns the color unchanged when it already clears the contrast threshold', () => {
    // A near-black color against a white background already has very high contrast.
    expect(Theme.adjustForContrast('#111111', '#ffffff')).toBe('#111111');
  });

  it('darkens a near-white pastel color until it clears WCAG AA (4.5:1) against a light background', () => {
    const adjusted = Theme.adjustForContrast('#fff2cc', '#ffffff');
    expect(Theme.contrastRatio(adjusted, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('lightens a near-black color until it clears WCAG AA against a dark background', () => {
    const adjusted = Theme.adjustForContrast('#1a1a1e', '#161922');
    expect(Theme.contrastRatio(adjusted, '#161922')).toBeGreaterThanOrEqual(4.5);
  });

  it('preserves hue while adjusting lightness', () => {
    const original = Theme.hexToHsl('#fff2cc');
    const adjusted = Theme.hexToHsl(Theme.adjustForContrast('#fff2cc', '#ffffff'));
    expect(Math.abs(adjusted.h - original.h)).toBeLessThan(0.02);
  });

  it('every pastel palette color is readable as text against a white card background', () => {
    THEME_PALETTES.pastel.forEach((palette) => {
      palette.colors.forEach((c) => {
        const adjusted = Theme.adjustForContrast(c, '#ffffff');
        expect(Theme.contrastRatio(adjusted, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      });
    });
  });
});

describe('Theme.apply', () => {
  it('sets a --palette-N-text custom property for every palette slot', () => {
    localStorage.setItem('sw-theme-style', 'pastel');
    localStorage.setItem('sw-theme-palette', '0');
    localStorage.setItem('sw-theme-mode', 'light');
    Theme.apply();
    for (let i = 1; i <= 5; i++) {
      const val = document.documentElement.style.getPropertyValue(`--palette-${i}-text`);
      expect(val).toBeTruthy();
    }
  });
});
