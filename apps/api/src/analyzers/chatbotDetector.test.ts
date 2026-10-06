import { describe, expect, it } from 'vitest';
import { fixtureAssets } from '../../test/fixtures.js';
import { detectChatbot } from './chatbotDetector.js';

describe('chatbotDetector', () => {
  it('detects Tidio; AI is unknown (not AI-first)', () => {
    const page = fixtureAssets('tidio-squarespace.html');
    const r = detectChatbot({ static: page, staticComplete: true, rendered: page });
    expect(r.chatbot).toMatchObject({ status: 'yes', chatbotProvider: 'Tidio' });
    expect(r.chatbot.evidence).toContain('code.tidio.co');
    expect(r.liveChat.status).toBe('yes');
    expect(r.aiAssistant.status).toBe('unknown');
  });

  it('AI-first products are "detected"', () => {
    const page = fixtureAssets('wordpress-elementor.html');
    const rendered = {
      ...page,
      scriptSrcs: [...page.scriptSrcs, 'https://www.chatbase.co/embed.min.js'],
    };
    const r = detectChatbot({ static: page, staticComplete: true, rendered });
    expect(r.chatbot.chatbotProvider).toBe('Chatbase');
    expect(r.aiAssistant.status).toBe('detected');
  });

  it('never returns notDetected when the page was not rendered', () => {
    const page = fixtureAssets('wordpress-elementor.html');
    const r = detectChatbot({ static: page, staticComplete: true, rendered: null });
    expect(r.chatbot.status).toBe('unknown');
    expect(r.aiAssistant.status).toBe('unknown');
  });

  it('returns no / notDetected for a rendered page without widgets', () => {
    const page = fixtureAssets('wordpress-elementor.html');
    const r = detectChatbot({ static: page, staticComplete: true, rendered: page });
    expect(r.chatbot.status).toBe('no');
    expect(r.aiAssistant.status).toBe('notDetected');
  });

  it.each([
    ['https://widget.intercom.io/widget/abc', 'Intercom'],
    ['https://js.driftt.com/include/1.js', 'Drift'],
    ['https://client.crisp.chat/l.js', 'Crisp'],
    ['https://js.usemessages.com/conversations-embed.js', 'HubSpot Chat'],
    ['https://static.zdassets.com/ekr/snippet.js?key=x', 'Zendesk Chat'],
    ['https://cdn.livechatinc.com/tracking.js', 'LiveChat'],
    ['https://embed.tawk.to/5f/default', 'Tawk.to'],
    ['https://cdn.botpress.cloud/webchat/v1/inject.js', 'Botpress'],
    ['https://cdn.voiceflow.com/widget/bundle.mjs', 'Voiceflow'],
    ['https://widget.manychat.com/123.js', 'ManyChat'],
    ['https://wchat.freshchat.com/js/widget.js', 'Freshchat'],
    ['https://config.gorgias.chat/bundle-loader/abc', 'Gorgias'],
  ])('recognises %s as %s', (src, name) => {
    const page = fixtureAssets('no-booking.html');
    const r = detectChatbot({
      static: null,
      staticComplete: false,
      rendered: { ...page, scriptSrcs: [src] },
    });
    expect(r.chatbot.chatbotProvider).toBe(name);
  });
});
