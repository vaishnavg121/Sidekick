import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../lib/ai-service';
import type { TabItem } from '../lib/tabs';
import type {
  TabCategory,
  TabClassification,
  CleanupSuggestion,
  WorkspaceRecommendation,
  FocusRelevance,
  RelatedTabGroup,
} from '../lib/models';

function createMockTabs(): TabItem[] {
  return [
    {
      id: 1,
      windowId: 1,
      index: 0,
      title: 'GitHub - microsoft/vscode',
      url: 'https://github.com/microsoft/vscode',
      favicon: 'https://github.githubassets.com/favicon.ico',
      active: true,
      loading: false,
      restricted: false,
    },
    {
      id: 2,
      windowId: 1,
      index: 1,
      title: 'YouTube - Home',
      url: 'https://www.youtube.com/',
      favicon: 'https://www.youtube.com/favicon.ico',
      active: false,
      loading: false,
      restricted: false,
    },
    {
      id: 3,
      windowId: 1,
      index: 2,
      title: 'Gmail - Inbox',
      url: 'https://mail.google.com/mail/u/0/',
      favicon: 'https://mail.google.com/favicon.ico',
      active: false,
      loading: false,
      restricted: false,
    },
  ];
}

function makeChoiceAnswer(choice: string, prob: number) {
  return { type: 'choice', choice, probabilities: { [choice]: prob } };
}

function makeScoreAnswer(score: number, normalized: number, prob: number) {
  return { type: 'score', score, normalized, probabilities: { [score]: prob } };
}

describe('AiService - per-tab classification', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('classifies each tab independently with different categories', async () => {
    const tabs = createMockTabs();

    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        const questions = body.questions;

        // Verify instructions include tab ID and title
        expect(questions['classify_1']?.instructions).toContain('ID 1');
        expect(questions['classify_1']?.instructions).toContain('GitHub');
        expect(questions['classify_2']?.instructions).toContain('ID 2');
        expect(questions['classify_2']?.instructions).toContain('YouTube');
        expect(questions['classify_3']?.instructions).toContain('ID 3');
        expect(questions['classify_3']?.instructions).toContain('Gmail');

        const answers: Record<string, ReturnType<typeof makeChoiceAnswer>> = {};

        if (questions['classify_1'])
          answers['classify_1'] = makeChoiceAnswer('Development', 0.95);
        if (questions['classify_2'])
          answers['classify_2'] = makeChoiceAnswer('Entertainment', 0.95);
        if (questions['classify_3'])
          answers['classify_3'] = makeChoiceAnswer('Communication', 0.95);

        return {
          ok: true,
          json: async () => ({ model: 'typesafe-ai/jev', answers }),
        };
      });

    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');

    const results: TabClassification[] = await service.classifyTabs(tabs);

    expect(results).toHaveLength(3);
    const github = results.find((r) => r.tabId === 1);
    const youtube = results.find((r) => r.tabId === 2);
    const gmail = results.find((r) => r.tabId === 3);

    expect(github?.category).toBe('Development');
    expect(youtube?.category).toBe('Entertainment');
    expect(gmail?.category).toBe('Communication');

    expect(github?.confidence).toBeGreaterThan(0.9);
    expect(youtube?.confidence).toBeGreaterThan(0.9);
    expect(gmail?.confidence).toBeGreaterThan(0.9);
  });

  it('rejects missing classifications without inventing a category', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ model: 'typesafe-ai/jev', answers: {} }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs();

    await expect(service.classifyTabs(tabs)).rejects.toThrow(
      'invalid classification',
    );
  });

  it('preserves user overrides over AI classifications', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          classify_1: makeChoiceAnswer('Entertainment', 0.9),
          classify_2: makeChoiceAnswer('Development', 0.9),
          classify_3: makeChoiceAnswer('Communication', 0.8),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs();

    const existingClassifications = {
      1: {
        tabId: 1,
        category: 'Development' as TabCategory,
        confidence: 1,
        reasoning: 'User override',
      },
    };

    const results = await service.classifyTabs(
      tabs,
      undefined,
      existingClassifications,
    );

    // Tab 1 should keep user's classification
    const tab1 = results.find((r) => r.tabId === 1);
    expect(tab1?.category).toBe('Development');
  });

  it('includes custom categories and overrides in cache key', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: { classify_1: makeChoiceAnswer('Development', 0.9) },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    // First call with default categories
    await service.classifyTabs(tabs);

    // Second call with custom categories - should not use cache
    const customCategories: TabCategory[] = ['Development', 'Research'];
    const results2 = await service.classifyTabs(tabs, customCategories);

    expect(results2).toHaveLength(1);
    // Should fall back to Other since no valid answer
    expect(results2[0]!.category).toBe('Development');
  });
});

describe('AiService - per-tab workspace routing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('routes each tab to different workspaces independently', async () => {
    const workspaces = [
      {
        id: 'ws-1',
        name: 'Development',
        color: '#ff0000',
        createdAt: '',
        icon: 'D',
      },
      {
        id: 'ws-2',
        name: 'Entertainment',
        color: '#00ff00',
        createdAt: '',
        icon: 'E',
      },
      {
        id: 'ws-3',
        name: 'Communication',
        color: '#0000ff',
        createdAt: '',
        icon: 'C',
      },
    ];

    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        const questions = body.questions;

        // Verify instructions include tab ID and title
        expect(questions['route_1']?.instructions).toContain('ID 1');
        expect(questions['route_1']?.instructions).toContain('GitHub');
        expect(questions['route_2']?.instructions).toContain('ID 2');
        expect(questions['route_2']?.instructions).toContain('YouTube');
        expect(questions['route_3']?.instructions).toContain('ID 3');
        expect(questions['route_3']?.instructions).toContain('Gmail');

        const answers: Record<string, ReturnType<typeof makeChoiceAnswer>> = {};

        // Choices must match the format "workspaceId:workspaceName"
        if (questions['route_1'])
          answers['route_1'] = makeChoiceAnswer('ws-1', 0.9);
        if (questions['route_2'])
          answers['route_2'] = makeChoiceAnswer('ws-2', 0.9);
        if (questions['route_3'])
          answers['route_3'] = makeChoiceAnswer('ws-3', 0.9);

        return {
          ok: true,
          json: async () => ({ model: 'typesafe-ai/jev', answers }),
        };
      });

    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs();

    const results: WorkspaceRecommendation[] = await service.routeTabs(
      tabs,
      workspaces,
    );

    expect(results).toHaveLength(3);
    const github = results.find((r) => r.tabId === 1);
    const youtube = results.find((r) => r.tabId === 2);
    const gmail = results.find((r) => r.tabId === 3);

    expect(github?.workspaceId).toBe('ws-1');
    expect(youtube?.workspaceId).toBe('ws-2');
    expect(gmail?.workspaceId).toBe('ws-3');
  });

  it('skips routing when no suitable workspace', async () => {
    const workspaces = [
      {
        id: 'ws-1',
        name: 'Development',
        color: '#ff0000',
        createdAt: '',
        icon: 'D',
      },
    ];

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          route_1: makeChoiceAnswer('ws-99', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs();

    const results: WorkspaceRecommendation[] = await service.routeTabs(
      tabs,
      workspaces,
    );

    // Should skip invalid workspace
    expect(results).toHaveLength(0);
  });

  it('includes workspace definitions in cache key', async () => {
    const workspaces = [
      {
        id: 'ws-1',
        name: 'Development',
        color: '#ff0000',
        createdAt: '',
        icon: 'D',
      },
      {
        id: 'ws-2',
        name: 'Personal',
        color: '#abcdef',
        createdAt: '',
        icon: 'P',
      },
    ];

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          route_1: makeChoiceAnswer('ws-1', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    // First call
    const results1 = await service.routeTabs(tabs, workspaces);
    expect(results1).toHaveLength(1);

    // Clear cache manually (simulating workspace change)
    service.clearCache();

    // Second call should work without cache
    const results2 = await service.routeTabs(tabs, workspaces);
    expect(results2).toHaveLength(1);
  });
});

describe('AiService - per-tab focus relevance', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns different relevance scores per tab', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        const questions = body.questions;

        // Verify instructions include tab ID and title
        expect(questions['focus_1']?.instructions).toContain('ID 1');
        expect(questions['focus_1']?.instructions).toContain('GitHub');
        expect(questions['focus_2']?.instructions).toContain('ID 2');
        expect(questions['focus_2']?.instructions).toContain('YouTube');
        expect(questions['focus_3']?.instructions).toContain('ID 3');
        expect(questions['focus_3']?.instructions).toContain('Gmail');
        expect(questions['focus_1']?.instructions).toContain(
          'C++ Limit Order Book',
        );

        const answers: Record<string, ReturnType<typeof makeScoreAnswer>> = {};

        if (questions['focus_1'])
          answers['focus_1'] = makeScoreAnswer(5, 1.0, 0.9);
        if (questions['focus_2'])
          answers['focus_2'] = makeScoreAnswer(2, 0.4, 0.7);
        if (questions['focus_3'])
          answers['focus_3'] = makeScoreAnswer(1, 0.2, 0.8);

        return {
          ok: true,
          json: async () => ({ model: 'typesafe-ai/jev', answers }),
        };
      });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs();

    const results: FocusRelevance[] = await service.scoreFocus(
      tabs,
      'C++ Limit Order Book project',
    );

    expect(results).toHaveLength(3);

    const github = results.find((r) => r.tabId === 1);
    const youtube = results.find((r) => r.tabId === 2);
    const gmail = results.find((r) => r.tabId === 3);

    // GitHub should be highly relevant
    expect(github?.score).toBe(1.0);
    expect(github?.reason).toBe('Critically relevant to focus goal');

    // YouTube should be moderately relevant
    expect(youtube?.score).toBe(0.4);
    expect(youtube?.reason).toBe('Moderately relevant');

    // Gmail should be slightly relevant
    expect(gmail?.score).toBe(0.2);
    expect(gmail?.reason).toBe('Slightly relevant');
  });

  it('handles invalid score answers gracefully', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          focus_1: {
            type: 'score',
            score: 10,
            normalized: 2.0,
            probabilities: { '10': 0.9 },
          }, // invalid score > 5
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    await expect(service.scoreFocus(tabs, 'test goal')).rejects.toThrow(
      'invalid focus score',
    );
  });

  it('persists focus preferences per workspace via cache', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          focus_1: makeScoreAnswer(3, 0.6, 0.8),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    await service.scoreFocus(tabs, 'C++ project');

    // Second call with same goal should use cache
    const results2 = await service.scoreFocus(tabs, 'C++ project');

    expect(results2).toHaveLength(1);
  });
});

describe('AiService - semantic grouping', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('groups tabs with same topic together', async () => {
    const tabs = [
      {
        id: 1,
        windowId: 1,
        index: 0,
        title: 'GitHub - microsoft/vscode',
        url: 'https://github.com/microsoft/vscode',
        active: true,
        loading: false,
        restricted: false,
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        title: 'GitHub - facebook/react',
        url: 'https://github.com/facebook/react',
        active: false,
        loading: false,
        restricted: false,
      },
      {
        id: 3,
        windowId: 1,
        index: 2,
        title: 'YouTube - Home',
        url: 'https://www.youtube.com/',
        active: false,
        loading: false,
        restricted: false,
      },
    ];

    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        const questions = body.questions;

        // Verify instructions include tab ID and title
        expect(questions['topic_1']?.instructions).toContain('ID 1');
        expect(questions['topic_2']?.instructions).toContain('ID 2');
        expect(questions['topic_3']?.instructions).toContain('ID 3');

        const answers: Record<string, ReturnType<typeof makeChoiceAnswer>> = {};

        if (questions['topic_1'])
          answers['topic_1'] = makeChoiceAnswer('TypeScript development', 0.9);
        if (questions['topic_2'])
          answers['topic_2'] = makeChoiceAnswer('TypeScript development', 0.9);
        if (questions['topic_3'])
          answers['topic_3'] = makeChoiceAnswer('Entertainment', 0.9);

        return {
          ok: true,
          json: async () => ({ model: 'typesafe-ai/jev', answers }),
        };
      });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');

    const results: RelatedTabGroup[] = await service.groupTabs(tabs);

    expect(results).toHaveLength(1);
    const group = results[0]!;
    expect(group.topic).toBe('TypeScript development');
    expect(group.tabs).toEqual([1, 2]);
    expect(group.tabs).not.toContain(3);
  });

  it('excludes none and Other from generated groups', async () => {
    const tabs = createMockTabs();

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          topic_1: makeChoiceAnswer('none', 0.9),
          topic_2: makeChoiceAnswer('Other', 0.9),
          topic_3: makeChoiceAnswer('Documentation', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const results: RelatedTabGroup[] = await service.groupTabs(tabs);

    // No groups with 2+ tabs sharing the same topic (and none/Other excluded)
    expect(results).toHaveLength(0);
  });

  it('returns empty groups for single-topic tabs', async () => {
    const tabs = createMockTabs();

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          topic_1: makeChoiceAnswer('TypeScript development', 0.9),
          topic_2: makeChoiceAnswer('Entertainment', 0.9),
          topic_3: makeChoiceAnswer('Email', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const results: RelatedTabGroup[] = await service.groupTabs(tabs);

    // No groups with 2+ tabs sharing the same topic
    expect(results).toHaveLength(0);
  });
});

describe('AiService - safe cleanup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('detects exact URL duplicates locally without Jev', async () => {
    const tabs = [
      {
        id: 1,
        windowId: 1,
        index: 0,
        title: 'GitHub',
        url: 'https://github.com/repo',
        active: true,
        loading: false,
        restricted: false,
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        title: 'GitHub',
        url: 'https://github.com/repo',
        active: false,
        loading: false,
        restricted: false,
      },
      {
        id: 3,
        windowId: 1,
        index: 2,
        title: 'YouTube',
        url: 'https://youtube.com/',
        active: false,
        loading: false,
        restricted: false,
      },
    ];

    const service = new AiService();
    service.setGatewayKey('vck_test-key');

    // Mock Jev to return keep for all
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          cleanup_1: makeChoiceAnswer('keep', 0.9),
          cleanup_2: makeChoiceAnswer('keep', 0.9),
          cleanup_3: makeChoiceAnswer('keep', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const results: CleanupSuggestion[] = await service.suggestCleanup(tabs);

    // Should only find exact duplicate (tab 2 is duplicate of tab 1)
    expect(results).toHaveLength(1);
    const dup = results[0]!;
    expect(dup.type).toBe('duplicate');
    expect(dup.tabIds).toEqual([2]);
  });

  it('treats query parameter differences as distinct URLs', async () => {
    const tabs = [
      {
        id: 1,
        windowId: 1,
        index: 0,
        title: 'Search',
        url: 'https://google.com/search?q=test',
        active: true,
        loading: false,
        restricted: false,
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        title: 'Search',
        url: 'https://google.com/search?q=other',
        active: false,
        loading: false,
        restricted: false,
      },
    ];

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          cleanup_1: makeChoiceAnswer('keep', 0.9),
          cleanup_2: makeChoiceAnswer('keep', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const results: CleanupSuggestion[] = await service.suggestCleanup(tabs);

    // Different query params = different URLs = not exact duplicates
    expect(results).toHaveLength(0);
  });

  it('requires explicit confirmation for cleanup actions', async () => {
    const tabs = createMockTabs();

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          cleanup_1: makeChoiceAnswer('stale', 0.9),
          cleanup_2: makeChoiceAnswer('keep', 0.9),
          cleanup_3: makeChoiceAnswer('keep', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const results: CleanupSuggestion[] = await service.suggestCleanup(tabs);

    // Only stale tab should be suggested for cleanup
    expect(results).toHaveLength(1);
    const stale = results[0]!;
    expect(stale.type).toBe('stale');
    expect(stale.tabIds).toEqual([1]);
    expect(stale.description).toContain('stale');
  });

  it('validates cleanup answer choices', async () => {
    const tabs = createMockTabs().slice(0, 1);

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          cleanup_1: makeChoiceAnswer('invalid-choice', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    await expect(service.suggestCleanup(tabs)).rejects.toThrow(
      'invalid cleanup',
    );
  });
});

describe('AiService - cache invalidation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('invalidates cache when workspace definitions change', async () => {
    const workspaces = [
      {
        id: 'ws-1',
        name: 'Development',
        color: '#ff0000',
        createdAt: '',
        icon: 'D',
      },
      {
        id: 'ws-2',
        name: 'Personal',
        color: '#abcdef',
        createdAt: '',
        icon: 'P',
      },
    ];

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          route_1: makeChoiceAnswer('ws-1', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    // First call
    const results1 = await service.routeTabs(tabs, workspaces);
    expect(results1).toHaveLength(1);

    // Clear cache manually (simulating workspace change)
    service.clearCache();

    // Second call should work without cache
    const results2 = await service.routeTabs(tabs, workspaces);
    expect(results2).toHaveLength(1);
  });

  it('invalidates classification cache when categories change', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          classify_1: makeChoiceAnswer('Development', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    // First call with default categories
    await service.classifyTabs(tabs);

    // Second call with custom categories - should not use cache
    const customCategories: TabCategory[] = ['Development', 'Research'];
    await service.classifyTabs(tabs, customCategories);

    // Both calls should have been made (fetchMock called twice)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('invalidates classification cache when overrides change', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          classify_1: makeChoiceAnswer('Development', 0.9),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    // First call without overrides
    await service.classifyTabs(tabs);

    // Second call with overrides - should not use cache
    const overrides = {
      1: {
        tabId: 1,
        category: 'Development' as TabCategory,
        confidence: 1,
        reasoning: 'User override',
      },
    };
    await service.classifyTabs(tabs, undefined, overrides);

    // Both calls should have been made
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('AiService - contract validation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects malformed Jev responses', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ model: 'typesafe-ai/jev', answers: 'invalid' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    await expect(service.classifyTabs(tabs)).rejects.toThrow(
      'Invalid Jev response',
    );
  });

  it('handles missing answers gracefully', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ model: 'typesafe-ai/jev', answers: {} }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    await expect(service.classifyTabs(tabs)).rejects.toThrow(
      'invalid classification',
    );
  });

  it('handles rate limits and timeouts', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Rate limited'));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    await expect(service.classifyTabs(tabs)).rejects.toThrow('timed out');
  });

  it('validates choice answer type and probabilities', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          classify_1: { type: 'score', score: 5 }, // wrong type
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    await expect(service.classifyTabs(tabs)).rejects.toThrow(
      'invalid classification',
    );
  });

  it('validates choice answer probabilities range', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          classify_1: makeChoiceAnswer('Development', 1.5), // invalid probability > 1
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    await expect(service.classifyTabs(tabs)).rejects.toThrow(
      'invalid classification',
    );
  });

  it('validates score answer range', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        model: 'typesafe-ai/jev',
        answers: {
          focus_1: {
            type: 'score',
            score: -1,
            normalized: -0.2,
            probabilities: { '-1': 0.9 },
          }, // invalid negative score
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    const tabs = createMockTabs().slice(0, 1);

    await expect(service.scoreFocus(tabs, 'test goal')).rejects.toThrow(
      'invalid focus score',
    );
  });
});

describe('AiService - input sanitization and security', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sanitizes tab URLs and titles', async () => {
    const tabs = [
      {
        id: 1,
        windowId: 1,
        index: 0,
        title: '<script>alert(1)</script>',
        url: 'https://example.com/?q=<script>',
        active: true,
        loading: false,
        restricted: false,
      },
    ];

    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        expect(body.state).not.toContain('<script>');
        expect(body.state).not.toContain('?q=<script>');
        return {
          ok: true,
          json: async () => ({
            model: 'typesafe-ai/jev',
            answers: {
              classify_1: makeChoiceAnswer('Development', 0.9),
            },
          }),
        };
      });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    await service.classifyTabs(tabs);
  });

  it('does not send page contents or credentials', async () => {
    const tabs = [
      {
        id: 1,
        windowId: 1,
        index: 0,
        title: 'Bank',
        url: 'https://bank.com/account?token=secret123',
        active: true,
        loading: false,
        restricted: false,
      },
    ];

    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        // State should only contain title and domain, not query params
        expect(body.state).not.toContain('token=secret123');
        expect(body.state).toContain('bank.com');
        return {
          ok: true,
          json: async () => ({
            model: 'typesafe-ai/jev',
            answers: {
              classify_1: makeChoiceAnswer('Development', 0.9),
            },
          }),
        };
      });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    await service.classifyTabs(tabs);
  });

  it('handles restricted URLs gracefully', async () => {
    const tabs = [
      {
        id: 1,
        windowId: 1,
        index: 0,
        title: 'Chrome Settings',
        url: 'chrome://settings',
        active: true,
        loading: false,
        restricted: true,
      },
    ];

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ model: 'typesafe-ai/jev', answers: {} }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AiService();
    service.setGatewayKey('vck_test-key');
    expect(await service.classifyTabs(tabs)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
