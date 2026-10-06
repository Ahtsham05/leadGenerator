/**
 * Minimal RFC 9309 robots.txt parser and matcher.
 * - Groups are selected by the most specific matching user-agent token, falling back to "*".
 * - The longest matching rule wins; on a tie, Allow wins.
 * - Supports "*" wildcards and "$" end anchors.
 */
export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface RobotsPolicy {
  /** "allowAll" when robots.txt is missing (4xx), "disallowAll" when unreachable (5xx). */
  mode: 'parsed' | 'allowAll' | 'disallowAll';
  groups: RobotsGroup[];
}

export function parseRobots(text: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (!current) continue;
      // An empty Disallow means "allow everything" and adds no rule.
      if (value === '') continue;
      current.rules.push({ allow: key === 'allow', pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return { mode: 'parsed', groups };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

function selectGroups(policy: RobotsPolicy, productToken: string): RobotsGroup[] {
  const token = productToken.toLowerCase();
  const specific = policy.groups.filter((g) =>
    g.agents.some((a) => a !== '*' && token.includes(a)),
  );
  if (specific.length) return specific;
  return policy.groups.filter((g) => g.agents.includes('*'));
}

/** `path` must include the query string, e.g. "/book?x=1". */
export function isPathAllowed(policy: RobotsPolicy, productToken: string, path: string): boolean {
  if (policy.mode === 'allowAll') return true;
  if (policy.mode === 'disallowAll') return false;
  if (path === '/robots.txt') return true;
  const rules = selectGroups(policy, productToken).flatMap((g) => g.rules);
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/** Product token used for robots matching, derived from the configured user agent ("LeadIntelBot/0.1 (...)" -> "LeadIntelBot"). */
export function productTokenOf(userAgent: string): string {
  return userAgent.split(/[\s/]/)[0] ?? userAgent;
}
