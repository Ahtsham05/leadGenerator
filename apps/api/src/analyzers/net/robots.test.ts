import { describe, expect, it } from 'vitest';
import { isPathAllowed, parseRobots, productTokenOf } from './robots.js';

const ROBOTS = `
# comment
User-agent: *
Disallow: /admin
Allow: /admin/public
Disallow: /*.pdf$
Disallow: /search?

User-agent: LeadIntelBot
User-agent: OtherBot
Disallow: /private
Disallow:

User-agent: BlockedBot
Disallow: /
`;

describe('robots', () => {
  const policy = parseRobots(ROBOTS);

  it('uses the * group when no specific group matches', () => {
    expect(isPathAllowed(policy, 'SomeBot', '/admin')).toBe(false);
    expect(isPathAllowed(policy, 'SomeBot', '/admin/public/x')).toBe(true);
    expect(isPathAllowed(policy, 'SomeBot', '/docs/a.pdf')).toBe(false);
    expect(isPathAllowed(policy, 'SomeBot', '/docs/a.pdf?x=1')).toBe(true);
    expect(isPathAllowed(policy, 'SomeBot', '/search?q=1')).toBe(false);
    expect(isPathAllowed(policy, 'SomeBot', '/')).toBe(true);
  });

  it('uses the specific group for our token and ignores *', () => {
    expect(isPathAllowed(policy, 'LeadIntelBot', '/admin')).toBe(true);
    expect(isPathAllowed(policy, 'LeadIntelBot', '/private/x')).toBe(false);
    expect(isPathAllowed(policy, 'BlockedBot', '/anything')).toBe(false);
  });

  it('allowAll / disallowAll modes', () => {
    expect(isPathAllowed({ mode: 'allowAll', groups: [] }, 'x', '/a')).toBe(true);
    expect(isPathAllowed({ mode: 'disallowAll', groups: [] }, 'x', '/a')).toBe(false);
  });

  it('extracts product token from UA', () => {
    expect(productTokenOf('LeadIntelBot/0.1 (+https://x)')).toBe('LeadIntelBot');
  });
});
