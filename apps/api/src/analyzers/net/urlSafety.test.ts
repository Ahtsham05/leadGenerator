import { describe, expect, it } from 'vitest';
import {
  assertPublicHost,
  isPrivateIp,
  isSameSite,
  normalizeUrl,
  websiteKey,
} from './urlSafety.js';

describe('normalizeUrl', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['  Example.COM/path#frag ', 'https://example.com/path'],
    ['http://example.com:80/x', 'http://example.com/x'],
    ['example.com:8443/a', 'https://example.com:8443/a'],
    ['//example.com', 'https://example.com/'],
  ])('%s -> %s', (input, out) => {
    const r = normalizeUrl(input);
    expect(r.ok && r.url.toString()).toBe(out);
  });

  it.each([
    ['ftp://example.com', /Scheme/],
    ['javascript:alert(1)', /Scheme/],
    ['file:///etc/passwd', /Scheme/],
    ['http://user:pass@example.com', /credentials/],
    ['http://localhost:3000', /Local/],
    ['http://printer.local', /Local/],
    ['http://intranet', /public domain/],
    ['', /empty/],
  ])('rejects %s', (input, msg) => {
    const r = normalizeUrl(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.5.4',
    '172.31.255.255',
    '192.168.1.1',
    '100.64.0.1',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
  ])('%s is private', (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(['8.8.8.8', '172.32.0.1', '104.20.23.154', '2606:4700:10::6814:179a'])(
    '%s is public',
    (ip) => expect(isPrivateIp(ip)).toBe(false),
  );
});

describe('assertPublicHost', () => {
  it.each(['127.0.0.1', '10.1.2.3', '169.254.169.254', '[::1]', '::ffff:10.0.0.1'])(
    'rejects private literal %s without DNS',
    async (host) => {
      await expect(assertPublicHost(host)).rejects.toThrow(/private/);
    },
  );
  it('rejects local names', async () => {
    await expect(assertPublicHost('localhost')).rejects.toThrow(/local/);
    await expect(assertPublicHost('nas.local')).rejects.toThrow(/local/);
  });
});

describe('site helpers', () => {
  it('websiteKey strips www and trailing slash', () => {
    expect(websiteKey('https://www.Example.com/rentals/')).toBe('example.com/rentals');
  });
  it('isSameSite handles www and subdomains', () => {
    expect(isSameSite('https://www.a.com', 'https://a.com/book')).toBe(true);
    expect(isSameSite('https://a.com', 'https://book.a.com/')).toBe(true);
    expect(isSameSite('https://a.com', 'https://evil-a.com/')).toBe(false);
  });
});
