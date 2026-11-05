import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../lib/ai-service';
import { InferenceGuard } from '../lib/ai-guard';
import type { TabItem } from '../lib/tabs';
const tabs: TabItem[] = [
  {
    id: 1,
    windowId: 1,
    index: 0,
    title: 'React docs',
    url: 'https://react.dev/learn',
    active: true,
    loading: false,
    restricted: false,
  },
];
const service = () => {
  const s = new AiService();
  s.setGatewayKey('fixture-not-a-live-key');
  return s;
};
const response = (data: unknown) => ({ ok: true, json: async () => data });
afterEach(() => vi.unstubAllGlobals());
describe('strict authenticated decision boundaries', () => {
  it.each([401, 403, 429, 500, 503])(
    'sanitizes HTTP %i without exposing remote text',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status,
          json: async () => ({ error: 'fixture-not-a-live-key' }),
        }),
      );
      await expect(service().classifyTabs(tabs)).rejects.not.toThrow(
        'fixture-not-a-live-key',
      );
    },
  );
  it.each([
    null,
    [],
    { answers: [] },
    { answers: {} },
    {
      answers: {
        wrong: {
          type: 'choice',
          choice: 'Development',
          probabilities: { Development: 1 },
        },
      },
    },
    { answers: { classify_1: { type: 'boolean', probability: 1 } } },
    {
      answers: {
        classify_1: {
          type: 'choice',
          choice: 'Bad',
          probabilities: { Bad: 1 },
        },
      },
    },
    {
      answers: {
        classify_1: {
          type: 'choice',
          choice: 'Development',
          probabilities: { Development: 1.2 },
        },
      },
    },
  ])(
    'rejects malformed, missing, wrong-ID/type/category/probability answers %#',
    async (value) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)));
      await expect(service().classifyTabs(tabs)).rejects.toThrow();
    },
  );
  it('reports invalid JSON and network timeouts without echoing errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw Error('fixture-not-a-live-key');
        },
      }),
    );
    await expect(service().classifyTabs(tabs)).rejects.toThrow(
      'malformed JSON',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Error('fixture-not-a-live-key')),
    );
    await expect(service().classifyTabs(tabs)).rejects.toThrow('timed out');
  });
  it('requires complete grouping and cleanup answers instead of silently pretending success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ answers: {} })),
    );
    await expect(service().groupTabs(tabs)).rejects.toThrow('invalid grouping');
    await expect(service().suggestCleanup(tabs)).rejects.toThrow(
      'invalid cleanup',
    );
  });
  it('accepts interpolated rubric scores but rejects invalid rung probabilities', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          answers: {
            focus_1: {
              type: 'score',
              score: 2.97,
              probabilities: { 2: 0.03, 3: 0.97 },
            },
          },
        }),
      ),
    );
    expect((await service().scoreFocus(tabs, 'React'))[0]!.score).toBeCloseTo(
      0.594,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          answers: {
            focus_1: { type: 'score', score: 2.97, probabilities: { 6: 1 } },
          },
        }),
      ),
    );
    await expect(service().scoreFocus(tabs, 'React')).rejects.toThrow(
      'invalid focus score',
    );
  });
  it('does not let an old in-flight request populate the cache for a replacement key', async () => {
    let finish!: (v: unknown) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            finish = r;
          }),
      )
      .mockResolvedValue(
        response({
          answers: {
            classify_1: {
              type: 'choice',
              choice: 'Research',
              probabilities: { Research: 1 },
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const s = service();
    const pending = s.classifyTabs(tabs);
    s.setGatewayKey('different-fixture-key');
    finish(
      response({
        answers: {
          classify_1: {
            type: 'choice',
            choice: 'Development',
            probabilities: { Development: 1 },
          },
        },
      }),
    );
    await pending;
    expect((await s.classifyTabs(tabs))[0]!.category).toBe('Research');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
describe('inference freshness across browser changes', () => {
  it.each(['workspace', 'closed', 'url', 'title', 'superseded'])(
    'suppresses %s changes before persistence',
    (reason) => {
      const guard = new InferenceGuard(),
        check = guard.begin('window:focus', 'a', tabs);
      const current = { workspaceId: 'a', tabs: structuredClone(tabs) };
      if (reason === 'workspace') current.workspaceId = 'b';
      if (reason === 'closed') current.tabs = [];
      if (reason === 'url') current.tabs[0]!.url = 'https://example.test';
      if (reason === 'title') current.tabs[0]!.title = 'Changed';
      if (reason === 'superseded') guard.begin('window:focus', 'a', tabs);
      expect(() => check(current)).toThrow('changed');
    },
  );
  it('allows unchanged inputs and independent feature/window requests', () => {
    const g = new InferenceGuard(),
      c = g.begin('1:focus', 'a', tabs);
    g.begin('2:focus', 'b', tabs);
    g.begin('1:group', 'a', tabs);
    expect(() => c({ workspaceId: 'a', tabs })).not.toThrow();
  });
});
