import { describe, expect, it } from 'vitest';
import { onCustomDomain } from './site-context';

describe('onCustomDomain', () => {
  it('is a customer domain when it is not ours', () => {
    expect(onCustomDomain('dackmaster.se')).toBe(true);
    expect(onCustomDomain('www.dackmaster.se')).toBe(true);
    expect(onCustomDomain('xn--dckmstarn-v2ad.se')).toBe(true);
  });

  it('is the app on our own hosts, localhost and IP addresses', () => {
    expect(onCustomDomain('inventory.catso.io')).toBe(false);
    expect(onCustomDomain('catso.io')).toBe(false);
    expect(onCustomDomain('localhost')).toBe(false);
    expect(onCustomDomain('192.168.1.20')).toBe(false);
    expect(onCustomDomain('')).toBe(false);
  });
});
