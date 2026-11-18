import { pageOf } from './push';

describe('pageOf', () => {
  it('takes a page in the app from the message', () => {
    expect(pageOf({ url: '/workorders/mine' })).toBe('/workorders/mine');
    expect(pageOf({ url: '/quotes/q1' })).toBe('/quotes/q1');
  });

  it('refuses anything that is not a page of our own', () => {
    for (const url of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '', 42]) {
      expect(pageOf({ url })).toBeNull();
    }
    expect(pageOf(undefined)).toBeNull();
    expect(pageOf({})).toBeNull();
  });
});
