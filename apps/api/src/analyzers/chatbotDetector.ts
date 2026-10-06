import type { AiAssistantState, TriState } from '@lead/shared';
import { CHAT_PROVIDERS, type ChatProvider } from './chatbotProviders.js';
import { describeHit, findHit, type DetectionContext } from './detectionContext.js';

export interface ChatbotResult {
  chatbot: { status: TriState; evidence: string; chatbotProvider: string | null };
  liveChat: { status: TriState; evidence: string };
  aiAssistant: { status: AiAssistantState; evidence: string };
  providers: string[];
}

/**
 * Detects chat widgets. A confident "no" / "notDetected" requires the rendered page,
 * because nearly every chat widget is injected by JavaScript.
 */
export function detectChatbot(
  ctx: DetectionContext,
  providers: ChatProvider[] = CHAT_PROVIDERS,
): ChatbotResult {
  const hits = providers
    .map((p) => ({ p, hit: findHit(ctx, p.patterns) }))
    .filter((x): x is { p: ChatProvider; hit: NonNullable<typeof x.hit> } => x.hit !== null);

  if (hits.length > 0) {
    const primary = hits.find((h) => h.p.aiFirst) ?? hits[0]!;
    const live = hits.find((h) => h.p.liveChat);
    const evidence = `${primary.p.name} widget: ${describeHit(primary.hit)}`;
    return {
      chatbot: { status: 'yes', evidence, chatbotProvider: primary.p.name },
      liveChat: live
        ? {
            status: 'yes',
            evidence: `${live.p.name} supports live agents: ${describeHit(live.hit)}`,
          }
        : {
            status: 'unknown',
            evidence: `${primary.p.name} found; live agent support not determined`,
          },
      aiAssistant: primary.p.aiFirst
        ? {
            status: 'detected',
            evidence: `${primary.p.name} is an AI-first chatbot product: ${describeHit(primary.hit)}`,
          }
        : {
            status: 'unknown',
            evidence: `${primary.p.name} widget found; whether it uses AI is not known`,
          },
      providers: hits.map((h) => h.p.name),
    };
  }

  if (!ctx.rendered) {
    const why =
      'No chat widget in static HTML, but the page could not be rendered to check for script-injected widgets';
    return {
      chatbot: { status: 'unknown', evidence: why, chatbotProvider: null },
      liveChat: { status: 'unknown', evidence: why },
      aiAssistant: { status: 'unknown', evidence: why },
      providers: [],
    };
  }
  const evidence = 'No known chat widget found on the rendered homepage';
  return {
    chatbot: { status: 'no', evidence, chatbotProvider: null },
    liveChat: { status: 'no', evidence },
    aiAssistant: { status: 'notDetected', evidence: `${evidence}; no AI assistant detected` },
    providers: [],
  };
}
