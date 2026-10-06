import type { SourcePatterns } from './detectionContext.js';

/**
 * Chat widget signatures.
 * - liveChat: the product supports a human agent chatting live.
 * - aiFirst: the product is explicitly an AI-first chatbot/agent builder. Only these
 *   produce aiAssistant "detected"; every other widget is "unknown" because its AI
 *   features may or may not be switched on.
 */
export interface ChatProvider {
  name: string;
  liveChat: boolean;
  aiFirst: boolean;
  patterns: SourcePatterns;
}

const src = (...res: RegExp[]): SourcePatterns => ({
  scriptSrc: res,
  iframeSrc: res,
  inlineScript: res,
});

export const CHAT_PROVIDERS: ChatProvider[] = [
  {
    name: 'Intercom',
    liveChat: true,
    aiFirst: false,
    patterns: src(/widget\.intercom\.io/i, /js\.intercomcdn\.com/i),
  },
  {
    name: 'Drift',
    liveChat: true,
    aiFirst: false,
    patterns: src(/js\.driftt\.com/i, /drift\.com\/(?:core|include)/i),
  },
  { name: 'Tidio', liveChat: true, aiFirst: false, patterns: src(/code\.tidio\.co/i) },
  { name: 'Crisp', liveChat: true, aiFirst: false, patterns: src(/client\.crisp\.chat/i) },
  { name: 'HubSpot Chat', liveChat: true, aiFirst: false, patterns: src(/js\.usemessages\.com/i) },
  {
    name: 'Zendesk Chat',
    liveChat: true,
    aiFirst: false,
    patterns: src(/static\.zdassets\.com\/ekr\/snippet\.js/i, /v2\.zopim\.com/i),
  },
  { name: 'LiveChat', liveChat: true, aiFirst: false, patterns: src(/cdn\.livechatinc\.com/i) },
  { name: 'Tawk.to', liveChat: true, aiFirst: false, patterns: src(/embed\.tawk\.to/i) },
  {
    name: 'Freshchat',
    liveChat: true,
    aiFirst: false,
    patterns: src(
      /wchat\.freshchat\.com/i,
      /\.freshchat\.com\/js\/widget\.js/i,
      /fw-cdn\.com\/.+widget/i,
    ),
  },
  {
    name: 'Gorgias',
    liveChat: true,
    aiFirst: false,
    patterns: src(/config\.gorgias\.chat/i, /gorgias-chat/i),
  },
  { name: 'Olark', liveChat: true, aiFirst: false, patterns: src(/static\.olark\.com/i) },
  { name: 'Smartsupp', liveChat: true, aiFirst: false, patterns: src(/smartsuppchat\.com/i) },
  {
    name: 'JivoChat',
    liveChat: true,
    aiFirst: false,
    patterns: src(/code\.jivosite\.com/i, /code\.jivo\.ru/i),
  },
  {
    name: 'Zoho SalesIQ',
    liveChat: true,
    aiFirst: false,
    patterns: src(/salesiq\.zoho\.(?:com|eu)/i),
  },
  { name: 'Podium', liveChat: true, aiFirst: false, patterns: src(/connect\.podium\.com/i) },
  {
    name: 'LeadConnector Chat',
    liveChat: true,
    aiFirst: false,
    patterns: src(/widgets\.leadconnectorhq\.com\/loader\.js/i, /chat-widget.*leadconnector/i),
  },
  {
    name: 'Facebook Messenger Chat',
    liveChat: true,
    aiFirst: false,
    patterns: src(/xfbml\.customerchat\.js/i),
  },
  {
    name: 'ManyChat',
    liveChat: false,
    aiFirst: false,
    patterns: src(/widget\.manychat\.com/i, /mccdn\.me/i),
  },
  {
    name: 'Landbot',
    liveChat: false,
    aiFirst: false,
    patterns: src(/cdn\.landbot\.io/i, /static\.landbot\.io/i),
  },
  // AI-first products:
  {
    name: 'Botpress',
    liveChat: false,
    aiFirst: true,
    patterns: src(/cdn\.botpress\.cloud/i, /mediafiles\.botpress\.cloud/i),
  },
  { name: 'Voiceflow', liveChat: false, aiFirst: true, patterns: src(/cdn\.voiceflow\.com/i) },
  { name: 'Chatbase', liveChat: false, aiFirst: true, patterns: src(/chatbase\.co\/embed/i) },
  { name: 'Ada', liveChat: false, aiFirst: true, patterns: src(/static\.ada\.support/i) },
  { name: 'SiteGPT', liveChat: false, aiFirst: true, patterns: src(/sitegpt\.ai\/widget/i) },
  { name: 'Chatling', liveChat: false, aiFirst: true, patterns: src(/chatling\.ai\/js\/embed/i) },
  { name: 'DocsBot', liveChat: false, aiFirst: true, patterns: src(/widget\.docsbot\.ai/i) },
];
