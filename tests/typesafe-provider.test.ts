import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  directRequest,
  normalizeDirectResponse,
  discoverDirectModels,
} from '../lib/typesafe-provider';
import { AiService } from '../lib/ai-service';
import { aiKey, aiProvider } from '../lib/ai-settings';
import { isCommand } from '../lib/protocol';
import type { JevEvaluateRequest } from '../lib/decision-types';
const request: JevEvaluateRequest = {
  model: 'typesafe-ai/jev',
  state: 'Synthetic fixture',
  questions: {
    yes: { type: 'boolean', instructions: 'True?' },
    category: {
      type: 'choice',
      instructions: 'Pick',
      criteria: { a: 'A', b: 'B' },
    },
    focus: {
      type: 'score',
      instructions: 'Score',
      criteria: ['Low', 'Medium', 'High'],
    },
  },
};
const valid = () => ({
  model: 'jev-1.14.0',
  answers: {
    yes: { type: 'noul', noul: 0.9 },
    category: {
      type: 'choice',
      choice: 'a',
      confidence: 0.7,
      probabilities: { a: 0.8, b: 0.2 },
    },
    focus: {
      type: 'score',
      score: 1.7,
      confidence: 0.55,
      legend: { '0': 'Low', '1': 'Medium', '2': 'High' },
      probabilities: { '0': 0.1, '1': 0.1, '2': 0.8 },
    },
  },
  usage: { input_tokens: 120, output_tokens: 12 },
});
afterEach(() => vi.unstubAllGlobals());
describe('documented TypeSafe Direct boundary', () => {
  it('translates boolean to noul without Gateway options or model IDs', () => {
    expect(directRequest(request)).toMatchObject({
      model: 'jev-latest',
      questions: { yes: { type: 'noul' } },
    });
    expect(directRequest(request)).not.toHaveProperty('providerOptions');
  });
  it('normalizes noul and keeps confidence distinct from option probability', () => {
    const result = normalizeDirectResponse(valid(), request);
    expect(result.response.answers.yes).toEqual({
      type: 'boolean',
      probability: 0.9,
    });
    expect(result.response.answers.category).toMatchObject({
      probabilities: { a: 0.8 },
      providerConfidence: 0.7,
    });
    expect(result.info).toEqual({
      provider: 'typesafe',
      model: 'jev-1.14.0',
      inputTokens: 120,
      outputTokens: 12,
    });
  });
  it.each([
    [
      'missing answer',
      (r: ReturnType<typeof valid>) => {
        delete (r.answers as Record<string, unknown>).yes;
      },
    ],
    [
      'extra answer',
      (r: ReturnType<typeof valid>) => {
        Object.assign(r.answers, { unknown: { type: 'noul', noul: 1 } });
      },
    ],
    [
      'wrong noul type',
      (r: ReturnType<typeof valid>) => {
        r.answers.yes.type = 'boolean';
      },
    ],
    [
      'noul bounds',
      (r: ReturnType<typeof valid>) => {
        r.answers.yes.noul = 2;
      },
    ],
    [
      'choice confidence',
      (r: ReturnType<typeof valid>) => {
        r.answers.category.confidence = NaN;
      },
    ],
    [
      'unknown choice',
      (r: ReturnType<typeof valid>) => {
        r.answers.category.choice = 'c';
      },
    ],
    [
      'choice contradiction',
      (r: ReturnType<typeof valid>) => {
        r.answers.category.choice = 'b';
      },
    ],
    [
      'partial options',
      (r: ReturnType<typeof valid>) => {
        delete (r.answers.category.probabilities as Record<string, number>).b;
      },
    ],
    [
      'probability mass',
      (r: ReturnType<typeof valid>) => {
        r.answers.category.probabilities.b = 0.9;
      },
    ],
    [
      'negative probability',
      (r: ReturnType<typeof valid>) => {
        r.answers.category.probabilities.b = -0.2;
      },
    ],
    [
      'rubric legend',
      (r: ReturnType<typeof valid>) => {
        r.answers.focus.legend['0'] = 'Wrong';
      },
    ],
    [
      'score contradiction',
      (r: ReturnType<typeof valid>) => {
        r.answers.focus.score = 0.2;
      },
    ],
    [
      'score bounds',
      (r: ReturnType<typeof valid>) => {
        r.answers.focus.score = 3;
      },
    ],
    [
      'usage type',
      (r: ReturnType<typeof valid>) => {
        r.usage.input_tokens = 1.5;
      },
    ],
    [
      'model ID',
      (r: ReturnType<typeof valid>) => {
        r.model = 'unsupported';
      },
    ],
  ] as const)('rejects %s', (_, mutate) => {
    const raw = valid();
    mutate(raw);
    expect(() => normalizeDirectResponse(raw, request)).toThrow(
      'invalid or contradictory',
    );
  });
  it.each([
    [0.02, [1, 0, 0, 0, 0, 0]],
    [4.93, [0, 0, 0, 0, 0.06, 0.94]],
    [4.88, [0, 0, 0, 0, 0.11, 0.89]],
    [0.27, [0.76, 0.23, 0.01, 0, 0, 0]],
  ] as const)(
    'accepts observed independent score/probability rounding %s',
    (score, probabilities) => {
      const criteria = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
      const q: JevEvaluateRequest = {
        model: 'typesafe-ai/jev',
        state: 'Synthetic rounded score',
        questions: {
          focus: { type: 'score', instructions: 'Score', criteria },
        },
      };
      const raw = {
        model: 'jev-1.14.0',
        usage: { input_tokens: 10, output_tokens: 10 },
        answers: {
          focus: {
            type: 'score',
            score: Number(score),
            confidence: 0.9,
            legend: Object.fromEntries(criteria.map((v, i) => [i, v])),
            probabilities: Object.fromEntries(
              probabilities.map((v, i) => [i, v]),
            ),
          },
        },
      };
      expect(
        normalizeDirectResponse(raw, q).response.answers.focus,
      ).toMatchObject({ score });
      raw.answers.focus.score = score < 1 ? 0.1 : 4.5;
      expect(() => normalizeDirectResponse(raw, q)).toThrow(
        'invalid or contradictory',
      );
    },
  );
  it.each([401, 402, 403, 429, 500])(
    'sanitizes model discovery HTTP %i',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status,
          json: async () => ({ detail: 'private fixture' }),
        }),
      );
      await expect(
        discoverDirectModels('synthetic-direct-key'),
      ).rejects.toThrow(`HTTP ${status}`);
    },
  );
  it('requires the discovered jev-latest alias before inference', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'jev-old' }] }),
      }),
    );
    await expect(discoverDirectModels('synthetic-direct-key')).rejects.toThrow(
      'does not expose',
    );
  });
  it('never sends a Gateway key to Direct discovery', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(discoverDirectModels('vck_synthetic')).rejects.toThrow(
      'not a Vercel',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never sends a Direct key to the legacy endpoint', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const service = new AiService();
    service.configure('vercel', 'synthetic-direct-key');
    expect(
      await service.verifyConnection('synthetic-direct-key', 'vercel'),
    ).toMatchObject({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves old Gateway settings and defaults fresh profiles to Direct', () => {
    const base = { connected: false, status: 'disconnected' as const };
    expect(aiProvider(base)).toBe('typesafe');
    const old = { ...base, gatewayKey: 'vck_legacy', typesafeKey: 'dormant' };
    expect(aiProvider(old)).toBe('vercel');
    expect(aiKey(old)).toBe('vck_legacy');
    expect(aiKey({ ...old, provider: 'typesafe' })).toBe('dormant');
  });
  it('rejects mixed credentials and arbitrary settings patches', () => {
    expect(
      isCommand({
        type: 'ai.settings.update',
        patch: { provider: 'typesafe', typesafeKey: 'synthetic' },
      }),
    ).toBe(true);
    for (const patch of [
      { provider: 'typesafe', gatewayKey: 'vck_wrong' },
      { provider: 'unknown', typesafeKey: 'x' },
      { provider: 'typesafe', typesafeKey: 'x', gatewayKey: 'y' },
      { typesafeKey: 'x', connected: true },
    ])
      expect(isCommand({ type: 'ai.settings.update', patch })).toBe(false);
  });
});
