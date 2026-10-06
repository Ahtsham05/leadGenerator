import type { TechCategory } from '@lead/shared';

/**
 * Technology signatures. To add a technology, append an entry here; no code changes needed.
 *
 * Each matcher list is OR-ed. Evidence recorded is the first exact match found.
 * Keep patterns specific: a false positive becomes a false claim in a report.
 */
export interface TechSignature {
  name: string;
  category: TechCategory;
  scriptSrc?: RegExp[];
  linkHref?: RegExp[];
  iframeSrc?: RegExp[];
  anchorHref?: RegExp[];
  /** Raw HTML (markup, class names, data attributes). */
  html?: RegExp[];
  inlineScript?: RegExp[];
  /** <meta name|property=...> content matchers, e.g. generator. */
  meta?: Array<{ name: string; content: RegExp }>;
  headers?: Array<{ name: string; value: RegExp }>;
  /** Matched against cookie names in Set-Cookie headers. */
  cookies?: RegExp[];
  /** Other technologies this one implies (added with "implied by" evidence). */
  implies?: string[];
}

export const TECH_SIGNATURES: TechSignature[] = [
  // ---------------------------------------------------------------- CMS
  {
    name: 'WordPress',
    category: 'cms',
    meta: [{ name: 'generator', content: /WordPress/i }],
    scriptSrc: [/\/wp-(?:content|includes)\//i],
    linkHref: [/\/wp-(?:content|includes)\//i, /\/wp-json\//i],
    headers: [
      { name: 'link', value: /wp-json/i },
      { name: 'x-pingback', value: /xmlrpc\.php/i },
    ],
  },
  { name: 'Joomla', category: 'cms', meta: [{ name: 'generator', content: /Joomla/i }] },
  {
    name: 'Drupal',
    category: 'cms',
    meta: [{ name: 'generator', content: /Drupal/i }],
    headers: [
      { name: 'x-generator', value: /Drupal/i },
      { name: 'x-drupal-cache', value: /.+/ },
    ],
  },

  // ---------------------------------------------------- Site / page builders
  {
    name: 'Elementor',
    category: 'builder',
    meta: [{ name: 'generator', content: /Elementor/i }],
    scriptSrc: [/\/plugins\/elementor(?:-pro)?\//i],
    linkHref: [/\/plugins\/elementor(?:-pro)?\//i],
    html: [/class="[^"]*\belementor-(?:section|element|widget)\b/i],
    implies: ['WordPress'],
  },
  {
    name: 'Divi',
    category: 'builder',
    meta: [{ name: 'generator', content: /Divi/i }],
    scriptSrc: [/\/themes\/Divi\//i, /\/plugins\/divi-builder\//i],
    linkHref: [/\/themes\/Divi\//i],
    html: [/class="[^"]*\bet_pb_(?:section|row|module)\b/i],
    implies: ['WordPress'],
  },
  {
    name: 'Wix',
    category: 'builder',
    meta: [{ name: 'generator', content: /Wix\.com/i }],
    scriptSrc: [/static\.parastorage\.com/i, /static\.wixstatic\.com/i],
    headers: [{ name: 'x-wix-request-id', value: /.+/ }],
    html: [/static\.wixstatic\.com/i],
  },
  {
    name: 'Squarespace',
    category: 'builder',
    meta: [{ name: 'generator', content: /Squarespace/i }],
    scriptSrc: [/static1\.squarespace\.com/i, /assets\.squarespace\.com/i],
    linkHref: [/static1\.squarespace\.com/i],
    headers: [{ name: 'server', value: /Squarespace/i }],
    html: [/<!-- This is Squarespace\. -->/i, /images\.squarespace-cdn\.com/i],
  },
  {
    name: 'Webflow',
    category: 'builder',
    meta: [{ name: 'generator', content: /Webflow/i }],
    html: [/data-wf-(?:page|site)="/i],
    scriptSrc: [/website-files\.com\/.+webflow/i],
  },
  {
    name: 'GoDaddy Website Builder',
    category: 'builder',
    meta: [{ name: 'generator', content: /GoDaddy Website Builder|Starfield Technologies/i }],
    scriptSrc: [/img1\.wsimg\.com\/(?:blobby|ceph-p3-01|poly)/i],
    html: [/img1\.wsimg\.com\/isteam/i],
  },
  {
    name: 'Weebly',
    category: 'builder',
    meta: [{ name: 'generator', content: /Weebly/i }],
    scriptSrc: [/editmysite\.com/i],
  },
  {
    name: 'Duda',
    category: 'builder',
    scriptSrc: [/irp\.cdn-website\.com/i, /static\.cdn-website\.com/i],
    html: [/dmAlbum|data-dm-widget|cdn-website\.com/i],
  },

  // ------------------------------------------------------------ eCommerce
  {
    name: 'Shopify',
    category: 'ecommerce',
    scriptSrc: [/cdn\.shopify\.com/i],
    linkHref: [/cdn\.shopify\.com/i],
    headers: [
      { name: 'x-shopid', value: /.+/ },
      { name: 'x-shopify-stage', value: /.+/ },
    ],
    inlineScript: [/Shopify\.shop\s*=/],
  },
  {
    name: 'WooCommerce',
    category: 'ecommerce',
    scriptSrc: [/\/plugins\/woocommerce\//i],
    linkHref: [/\/plugins\/woocommerce\//i],
    implies: ['WordPress'],
  },

  // ----------------------------------------------------------- Frameworks
  {
    name: 'Next.js',
    category: 'framework',
    html: [/<script id="__NEXT_DATA__"/i, /\/_next\/static\//],
    headers: [{ name: 'x-powered-by', value: /Next\.js/i }],
    implies: ['React'],
  },
  {
    name: 'Nuxt',
    category: 'framework',
    html: [/window\.__NUXT__|\/_nuxt\//],
    implies: ['Vue'],
  },
  { name: 'Gatsby', category: 'framework', html: [/id="___gatsby"/], implies: ['React'] },
  {
    name: 'React',
    category: 'framework',
    html: [/data-reactroot/i],
    scriptSrc: [/\breact(?:-dom)?(?:\.production)?(?:\.min)?\.js/i],
  },
  {
    name: 'Vue',
    category: 'framework',
    html: [/\bdata-v-[0-9a-f]{8}\b/, /data-v-app/],
    scriptSrc: [/\bvue(?:\.runtime)?(?:\.global)?(?:\.prod)?(?:\.min)?\.js/i],
  },
  {
    name: 'Angular',
    category: 'framework',
    html: [/\bng-version="/i, /\b_nghost-[a-z0-9-]+/i, /\bng-app=/i],
  },

  // ------------------------------------------------------- Hosting and CDN
  {
    name: 'Cloudflare',
    category: 'cdn',
    headers: [
      { name: 'server', value: /cloudflare/i },
      { name: 'cf-ray', value: /.+/ },
    ],
    cookies: [/^__cf_bm$/, /^__cflb$/, /^cf_clearance$/],
  },
  {
    name: 'Amazon CloudFront',
    category: 'cdn',
    headers: [
      { name: 'x-amz-cf-id', value: /.+/ },
      { name: 'via', value: /CloudFront/i },
    ],
  },
  {
    name: 'Vercel',
    category: 'hosting',
    headers: [
      { name: 'server', value: /Vercel/i },
      { name: 'x-vercel-id', value: /.+/ },
    ],
  },
  {
    name: 'Netlify',
    category: 'hosting',
    headers: [
      { name: 'server', value: /Netlify/i },
      { name: 'x-nf-request-id', value: /.+/ },
    ],
  },
  {
    name: 'WP Engine',
    category: 'hosting',
    headers: [
      { name: 'x-powered-by', value: /WP Engine/i },
      { name: 'wpe-backend', value: /.+/ },
    ],
    implies: ['WordPress'],
  },
  { name: 'Kinsta', category: 'hosting', headers: [{ name: 'x-kinsta-cache', value: /.+/ }] },

  // ------------------------------------------------------------ Analytics
  {
    name: 'Google Analytics',
    category: 'analytics',
    scriptSrc: [
      /google-analytics\.com\/(?:analytics|ga)\.js/i,
      /googletagmanager\.com\/gtag\/js\?id=(?:G|UA)-/i,
    ],
    inlineScript: [
      /gtag\(\s*['"]config['"]\s*,\s*['"](?:G|UA)-[A-Z0-9-]+['"]/i,
      /ga\(\s*['"]create['"]\s*,\s*['"]UA-/i,
    ],
  },
  {
    name: 'Google Tag Manager',
    category: 'analytics',
    scriptSrc: [/googletagmanager\.com\/gtm\.js/i],
    inlineScript: [/googletagmanager\.com\/gtm\.js/i],
    iframeSrc: [/googletagmanager\.com\/ns\.html/i],
  },
  {
    name: 'Google Ads',
    category: 'analytics',
    scriptSrc: [
      /googleadservices\.com\/pagead\/conversion/i,
      /googletagmanager\.com\/gtag\/js\?id=AW-/i,
    ],
    inlineScript: [/gtag\(\s*['"]config['"]\s*,\s*['"]AW-\d+/i],
  },
  {
    name: 'Facebook Pixel',
    category: 'analytics',
    scriptSrc: [/connect\.facebook\.net\/[^/]+\/fbevents\.js/i],
    inlineScript: [/fbq\(\s*['"]init['"]/, /connect\.facebook\.net\/[^/]+\/fbevents\.js/i],
    html: [/facebook\.com\/tr\?id=\d+/i],
  },
  {
    name: 'Hotjar',
    category: 'analytics',
    scriptSrc: [/static\.hotjar\.com/i],
    inlineScript: [/static\.hotjar\.com/i],
  },
  {
    name: 'Microsoft Clarity',
    category: 'analytics',
    scriptSrc: [/clarity\.ms\/tag/i],
    inlineScript: [/clarity\.ms\/tag/i],
  },

  // ------------------------------------------------------------- Payments
  {
    name: 'Stripe',
    category: 'payment',
    scriptSrc: [/js\.stripe\.com/i],
    iframeSrc: [/js\.stripe\.com/i],
    anchorHref: [/(?:buy|checkout)\.stripe\.com\//i],
  },
  {
    name: 'PayPal',
    category: 'payment',
    scriptSrc: [/paypal\.com\/sdk\/js/i, /paypalobjects\.com\/api\/checkout/i],
    anchorHref: [/paypal\.me\//i, /paypal\.com\/(?:cgi-bin\/webscr|paypalme|donate|ncp\/payment)/i],
    html: [/<form[^>]+action="https:\/\/www\.paypal\.com\/cgi-bin\/webscr"/i],
  },
  {
    name: 'Square',
    category: 'payment',
    scriptSrc: [/js\.squareup\.com/i, /web\.squarecdn\.com/i],
    anchorHref: [/square\.link\//i, /checkout\.square\.site/i],
  },
  { name: 'Braintree', category: 'payment', scriptSrc: [/js\.braintreegateway\.com/i] },
  {
    name: 'Authorize.net',
    category: 'payment',
    scriptSrc: [/js\.authorize\.net\/v1\/Accept\.js/i],
  },

  // ----------------------------- Marketing automation / CRM (follow-up evidence)
  {
    name: 'Mailchimp',
    category: 'marketing',
    scriptSrc: [/chimpstatic\.com/i, /list-manage\.com/i],
    html: [/list-manage\.com\/subscribe/i, /id="mc-embedded-subscribe-form"/i],
  },
  {
    name: 'Klaviyo',
    category: 'marketing',
    scriptSrc: [/static\.klaviyo\.com/i, /klaviyo\.com\/onsite/i],
  },
  {
    name: 'HubSpot',
    category: 'marketing',
    scriptSrc: [/js\.hs-scripts\.com/i, /js\.hsforms\.net/i, /js\.hs-analytics\.net/i],
  },
  {
    name: 'ActiveCampaign',
    category: 'marketing',
    scriptSrc: [/trackcmp\.net/i, /\.activehosted\.com/i],
  },
  {
    name: 'Constant Contact',
    category: 'marketing',
    scriptSrc: [/ctctcdn\.com/i],
    html: [/constantcontact\.com\/sl\//i],
  },
  {
    name: 'Brevo',
    category: 'marketing',
    scriptSrc: [/sibforms\.com/i, /sendinblue\.com/i, /brevo\.com/i],
  },
  {
    name: 'GoHighLevel',
    category: 'marketing',
    scriptSrc: [/leadconnectorhq\.com/i, /msgsndr\.com/i],
    iframeSrc: [/leadconnectorhq\.com/i, /msgsndr\.com/i],
  },
  {
    name: 'Zoho CRM',
    category: 'marketing',
    scriptSrc: [/crm\.zoho\.(?:com|eu)/i],
    html: [/crm\.zoho\.(?:com|eu)\/crm\/WebToLeadForm/i],
  },
];
