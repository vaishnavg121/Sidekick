import type { AiSettings, AiProvider } from './models';
/** Old connected Gateway installations retain their provider until the user changes it. */
export function aiProvider(settings: AiSettings): AiProvider {
  return settings.provider ?? (settings.gatewayKey ? 'vercel' : 'typesafe');
}
export function aiKey(settings: AiSettings): string | undefined {
  return aiProvider(settings) === 'typesafe'
    ? settings.typesafeKey
    : settings.gatewayKey;
}
