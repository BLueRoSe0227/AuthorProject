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

describe('Theme.onColorFor', () => {
  it('picks near-black text for light/pastel fills', () => {
    // .btn--pal-work-style buttons paint this color as TEXT on top of a solid `c`
    // fill — distinct from adjustForContrast, which nudges `c` itself for use as
    // text against a neutral page background. A near-white pastel fill needs dark
    // text, not white-on-white.
    expect(Theme.onColorFor('#fff2cc')).toBe('#1a1a1a');
  });

  it('picks white text for dark/saturated fills', () => {
    expect(Theme.onColorFor('#263238')).toBe('#ffffff');
  });

  it('every palette color (any style) picks whichever of black/white contrasts better against it', () => {
    // onColorFor doesn't guarantee it clears WCAG AA (a mid-tone fill can't hit
    // 4.5:1 against either black or white) — only that it picks the better of the
    // two, which is what actually fixes near-white pastel fills getting white text.
    Object.values(THEME_PALETTES).forEach((list) => {
      list.forEach((palette) => {
        palette.colors.forEach((c) => {
          const onColor = Theme.onColorFor(c);
          const other = onColor === '#ffffff' ? '#1a1a1a' : '#ffffff';
          expect(Theme.contrastRatio(onColor, c)).toBeGreaterThanOrEqual(Theme.contrastRatio(other, c));
        });
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

  it('sets a --palette-N-oncolor custom property usable as text on top of the palette fill itself', () => {
    localStorage.setItem('sw-theme-style', 'pastel');
    localStorage.setItem('sw-theme-palette', '0');
    localStorage.setItem('sw-theme-mode', 'light');
    Theme.apply();
    const palette = THEME_PALETTES.pastel[0];
    palette.colors.forEach((c, i) => {
      const onColor = document.documentElement.style.getPropertyValue(`--palette-${i + 1}-oncolor`);
      expect(onColor).toBeTruthy();
      expect(Theme.contrastRatio(onColor, c)).toBeGreaterThanOrEqual(3); // pastel fills are inherently low-max-contrast; still must beat the opposite choice
    });
  });
});
