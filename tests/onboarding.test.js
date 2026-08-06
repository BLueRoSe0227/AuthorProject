// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadDomScripts } from './helpers/loadDomApp.js';

beforeAll(() => {
  loadDomScripts(['js/utils.js', 'js/onboarding.js']);
});

beforeEach(() => {
  localStorage.removeItem(Onboarding.FUNNEL_KEY);
});

describe('Onboarding funnel counters', () => {
  it('counts how many times each step is reached', () => {
    Onboarding._recordStep(0);
    Onboarding._recordStep(1);
    Onboarding._recordStep(1);
    const stats = Onboarding.getFunnelStats();
    expect(stats.stepsReached[0]).toBe(1);
    expect(stats.stepsReached[1]).toBe(2);
  });

  it('counts end reasons separately from step reaches', () => {
    Onboarding._recordEnd('completed');
    Onboarding._recordEnd('skipped');
    Onboarding._recordEnd('skipped');
    const stats = Onboarding.getFunnelStats();
    expect(stats.endReasons.completed).toBe(1);
    expect(stats.endReasons.skipped).toBe(2);
  });

  it('starts empty when nothing has run yet', () => {
    const stats = Onboarding.getFunnelStats();
    expect(stats.stepsReached).toEqual({});
    expect(stats.endReasons).toEqual({});
  });

  it('survives malformed localStorage content instead of throwing', () => {
    localStorage.setItem(Onboarding.FUNNEL_KEY, '{not json');
    expect(() => Onboarding.getFunnelStats()).not.toThrow();
    expect(() => Onboarding._recordStep(0)).not.toThrow();
    expect(Onboarding.getFunnelStats().stepsReached[0]).toBe(1);
  });
});
