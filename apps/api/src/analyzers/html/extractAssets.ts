import * as cheerio from 'cheerio';

export interface FormField {
  tag: 'input' | 'select' | 'textarea';
  type: string;
  name: string;
  id: string;
  placeholder: string;
  label: string;
  /** class + autocomplete attributes, lower-cased (datepickers often only show up here). */
  classes: string;
  /** For selects: visible option texts (first 30). */
  options: string[];
}

export interface FormInfo {
  action: string | null;
  method: string;
  fields: FormField[];
  /** Visible text inside the form (labels, headings, buttons), lower-cased and capped. */
  text: string;
  classes: string;
}

export interface AnchorInfo {
  href: string;
  /** Absolute URL when resolvable. */
  url: string | null;
  text: string;
}

/** Everything the detectors need from a page, extracted once. */
export interface PageAssets {
  url: string;
  title: string;
  scriptSrcs: string[];
  /** Concatenated inline script contents, capped. */
  inlineScripts: string;
  linkHrefs: string[];
  iframeSrcs: string[];
  anchors: AnchorInfo[];
  metas: Array<{ name: string; content: string }>;
  forms: FormInfo[];
  /** Fields not wrapped in a <form> element (common in JS booking widgets). */
  looseFields: FormField[];
  buttonsText: string[];
  /** Visible body text, whitespace-collapsed and capped. */
  bodyText: string;
  /** Raw HTML, capped, for signature regexes that need markup (class names, data attributes). */
  html: string;
  hasViewportMeta: boolean;
}

const MAX_INLINE_SCRIPT = 400_000;
const MAX_TEXT = 200_000;
const MAX_HTML = 3_000_000;

function abs(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function clean(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export function extractAssets(html: string, pageUrl: string): PageAssets {
  const $ = cheerio.load(html);

  const scriptSrcs: string[] = [];
  let inlineScripts = '';
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      const a = abs(src, pageUrl);
      if (a) scriptSrcs.push(a);
    } else if (inlineScripts.length < MAX_INLINE_SCRIPT) {
      inlineScripts += `${$(el).html() ?? ''}\n`;
    }
  });

  const linkHrefs = $('link[href]')
    .map((_, el) => abs($(el).attr('href') ?? '', pageUrl))
    .get()
    .filter((x): x is string => Boolean(x));

  const iframeSrcs = $('iframe')
    .map((_, el) => abs($(el).attr('src') ?? $(el).attr('data-src') ?? '', pageUrl))
    .get()
    .filter((x): x is string => Boolean(x) && x !== pageUrl);

  const anchors: AnchorInfo[] = $('a[href]')
    .map((_, el) => {
      const href = ($(el).attr('href') ?? '').trim();
      return {
        href,
        url: /^(javascript|data):/i.test(href) ? null : abs(href, pageUrl),
        text: clean($(el).text() || $(el).attr('aria-label') || $(el).attr('title')).slice(0, 200),
      };
    })
    .get();

  const metas = $('meta')
    .map((_, el) => ({
      name: (
        $(el).attr('name') ??
        $(el).attr('property') ??
        $(el).attr('http-equiv') ??
        ''
      ).toLowerCase(),
      content: $(el).attr('content') ?? '',
    }))
    .get()
    .filter((m) => m.name);

  const labelFor = new Map<string, string>();
  $('label[for]').each((_, el) => {
    labelFor.set($(el).attr('for') ?? '', clean($(el).text()));
  });

  const fieldOf = (el: Parameters<typeof $>[0]): FormField => {
    const node = $(el);
    const tagName = (node.prop('tagName') as string | undefined)?.toLowerCase();
    const tag: FormField['tag'] =
      tagName === 'select' ? 'select' : tagName === 'textarea' ? 'textarea' : 'input';
    const id = node.attr('id') ?? '';
    const wrappingLabel = clean(node.closest('label').text());
    return {
      tag,
      type: (node.attr('type') ?? (tag === 'input' ? 'text' : tag)).toLowerCase(),
      name: node.attr('name') ?? '',
      id,
      placeholder: node.attr('placeholder') ?? '',
      label: (labelFor.get(id) || wrappingLabel || node.attr('aria-label') || '').slice(0, 120),
      classes: `${node.attr('class') ?? ''} ${node.attr('autocomplete') ?? ''}`
        .toLowerCase()
        .trim(),
      options:
        tag === 'select'
          ? node
              .find('option')
              .map((_, o) => clean($(o).text()))
              .get()
              .slice(0, 30)
          : [],
    };
  };

  const forms: FormInfo[] = $('form')
    .map((_, form) => ({
      action: $(form).attr('action') ? abs($(form).attr('action') ?? '', pageUrl) : null,
      method: ($(form).attr('method') ?? 'get').toLowerCase(),
      fields: $(form)
        .find('input, select, textarea')
        .map((__, el) => fieldOf(el))
        .get()
        .filter((f) => f.type !== 'hidden'),
      text: clean($(form).text()).toLowerCase().slice(0, 4000),
      classes: `${$(form).attr('class') ?? ''} ${$(form).attr('id') ?? ''}`.toLowerCase(),
    }))
    .get();

  const looseFields = $('input, select, textarea')
    .filter((_, el) => $(el).closest('form').length === 0)
    .map((_, el) => fieldOf(el))
    .get()
    .filter((f) => f.type !== 'hidden');

  const buttonsText = $(
    'button, input[type=submit], [role=button], a.button, a.btn, .wp-block-button a, .elementor-button',
  )
    .map((_, el) => clean($(el).text() || $(el).attr('value')))
    .get()
    .filter(Boolean)
    .slice(0, 200);

  const hasViewportMeta = metas.some((m) => m.name === 'viewport' && /width\s*=/.test(m.content));
  const title = clean($('title').first().text());

  $('script, style, noscript, template, svg').remove();
  const bodyText = clean($('body').text() || $.root().text()).slice(0, MAX_TEXT);

  return {
    url: pageUrl,
    title,
    scriptSrcs,
    inlineScripts,
    linkHrefs,
    iframeSrcs,
    anchors,
    metas,
    forms,
    looseFields,
    buttonsText,
    bodyText,
    html: html.slice(0, MAX_HTML),
    hasViewportMeta,
  };
}
