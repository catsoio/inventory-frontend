import { describe, expect, it } from 'vitest';
import { agoText } from './ago';

describe('agoText', () => {
  const now = new Date('2026-11-07T12:00:00Z');
  it('säger idag, igår och antal dagar', () => {
    expect(agoText('2026-11-07T08:00:00Z', now)).toBe('idag');
    expect(agoText('2026-11-06T08:00:00Z', now)).toBe('igår');
    expect(agoText('2026-11-02T12:00:00Z', now)).toBe('5 dagar sedan');
  });
});
