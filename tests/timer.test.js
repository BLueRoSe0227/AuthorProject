// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadDomScripts } from './helpers/loadDomApp.js';

beforeAll(() => {
  loadDomScripts(['js/utils.js', 'js/timer.js']);
});

beforeEach(() => {
  localStorage.removeItem(Timer.FOCUS_KEY);
});

describe('Timer focus-time accumulation', () => {
  it('accumulates seconds added on the same day', () => {
    Timer._addFocusSeconds(30);
    Timer._addFocusSeconds(45);
    expect(Timer.getTodayFocusSeconds()).toBe(75);
  });

  it('returns 0 when nothing has been recorded yet', () => {
    expect(Timer.getTodayFocusSeconds()).toBe(0);
  });

  it('does not carry yesterday\'s total into today', () => {
    localStorage.setItem(Timer.FOCUS_KEY, JSON.stringify({ date: '2020-01-01', seconds: 999 }));
    expect(Timer.getTodayFocusSeconds()).toBe(0);
  });

  it('starts a fresh count for today instead of adding onto a stale stored date', () => {
    localStorage.setItem(Timer.FOCUS_KEY, JSON.stringify({ date: '2020-01-01', seconds: 999 }));
    Timer._addFocusSeconds(10);
    expect(Timer.getTodayFocusSeconds()).toBe(10);
  });

  it('survives malformed localStorage content instead of throwing', () => {
    localStorage.setItem(Timer.FOCUS_KEY, '{not json');
    expect(() => Timer.getTodayFocusSeconds()).not.toThrow();
    expect(Timer.getTodayFocusSeconds()).toBe(0);
    expect(() => Timer._addFocusSeconds(5)).not.toThrow();
    expect(Timer.getTodayFocusSeconds()).toBe(5);
  });
});

describe('Timer.getScale / setScale clamping', () => {
  it('clamps below TIMER_SCALE_MIN up to the minimum', () => {
    expect(Timer.setScale(0.1)).toBe(TIMER_SCALE_MIN);
  });

  it('clamps above TIMER_SCALE_MAX down to the maximum', () => {
    expect(Timer.setScale(5)).toBe(TIMER_SCALE_MAX);
  });

  it('passes through an in-range value unchanged', () => {
    expect(Timer.setScale(1.2)).toBe(1.2);
  });
});
