import type {
  TabCategory,
  TabClassification,
  WorkspaceRecommendation,
  RelatedTabGroup,
  FocusRelevance,
  CleanupSuggestion,
  Workspace,
} from './models';
import type { TabItem } from './tabs';

// Vercel AI Gateway Jev endpoint
const JEV_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
const JEV_MODEL = 'typesafe-ai/jev';

// Jev question types
type JevQuestionType = 'choice' | 'score' | 'boolean';

interface JevQuestion {
  name: string;
  type: JevQuestionType;
  prompt: string;
  options?: {
    choices?: readonly string[];
    min?: number;
    max?: number;
    step?: number;
  };
}

interface JevRequest {
  model: string;
  questions: JevQuestion[];
  inputs: Array<Record<string, unknown>>;
}

interface JevChoiceResult {
  type: 'choice';
  name: string;
  value: string;
  probability: number;
}

interface JevScoreResult {
  type: 'score';
  name: string;
  value: number;
  normalized: number;
}

interface JevBooleanResult {
  type: 'boolean';
  name: string;
  value: boolean;
  probability: number;
}

type JevResult = JevChoiceResult | JevScoreResult | JevBooleanResult;

interface JevResponse {
  results: Array<{
    input: Record<string, unknown>;
    results: JevResult[];
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

const DEFAULT_CATEGORIES = [
  'Development',
  'Research',
  'Education',
  'Documentation',
  'Productivity',
  'Entertainment',
  'Shopping',
  'Communication',
  'Other',
] as const satisfies readonly TabCategory[];

// Use choice questions for classification and routing (discrete decisions)
const CLASSIFICATION_QUESTION: JevQuestion = {
  name: 'classification',
  type: 'choice',
  prompt:
    'Classify this browser tab into exactly one category based on its title and domain.',
  options: {
    choices: DEFAULT_CATEGORIES,
  },
};

const ROUTING_QUESTION: JevQuestion = {
  name: 'routing',
  type: 'choice',
  prompt:
    'Select the best workspace for this tab from the available workspaces.',
  // choices will be set dynamically per request
  options: { choices: [] },
};

const FOCUS_QUESTION: JevQuestion = {
  name: 'focus',
  type: 'score',
  prompt:
    "Score how relevant this tab is to the user's focus goal. 0 = not relevant, 1 = highly relevant.",
  options: { min: 0, max: 1, step: 0.1 },
};

const CLEANUP_QUESTION: JevQuestion = {
  name: 'cleanup',
  type: 'choice',
  prompt:
    'Should this tab be cleaned up? Choose the type of cleanup if applicable.',
  options: {
    choices: ['keep', 'duplicate', 'stale', 'low-value'],
  },
};

export class AiService {
  private gatewayKey: string | undefined;
  private cache = new Map<string, { result: unknown; timestamp: number }>();
  private readonly CACHE_TTL = 1000 * 60 * 30; // 30 minutes
  private readonly MAX_CONCURRENT = 2;
  private activeRequests = 0;
  private queue: Array<() => Promise<unknown>> = [];

  setGatewayKey(key: string | undefined) {
    this.gatewayKey = key;
  }

  async verifyConnection(
    key: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      // Test with a simple boolean question to verify Jev access
      await this.callJev(
        {
          model: JEV_MODEL,
          questions: [
            {
              name: 'test',
              type: 'boolean',
              prompt: 'Return true.',
            },
          ],
          inputs: [{}],
        },
        key,
      );
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Jev verification failed',
      };
    }
  }

  private async callJev(
    request: JevRequest,
    key?: string,
  ): Promise<JevResponse> {
    const apiKey = key ?? this.gatewayKey;
    if (!apiKey) throw new Error('No Vercel AI Gateway key configured');

    const response = await fetch(JEV_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jev API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as JevResponse;

    // Validate response structure
    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('Invalid Jev response: missing results array');
    }

    return data;
  }

  private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.activeRequests >= this.MAX_CONCURRENT || this.queue.length === 0)
      return;
    this.activeRequests++;
    const fn = this.queue.shift()!;
    try {
      await fn();
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  private getCacheKey(prefix: string, tabs: TabItem[]): string {
    const metadata = tabs
      .map((t) => `${t.id}:${t.url}:${t.title.slice(0, 50)}`)
      .join('|');
    return `${prefix}:${metadata}`;
  }

  private getFromCache<T>(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result as T;
    }
    return undefined;
  }

  private setCache(key: string, result: unknown) {
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  private sanitizeTab(tab: TabItem): {
    id: number;
    title: string;
    domain: string;
  } {
    try {
      const url = new URL(tab.url);
      return {
        id: tab.id,
        title: tab.title.slice(0, 100),
        domain: url.hostname,
      };
    } catch {
      return {
        id: tab.id,
        title: tab.title.slice(0, 100),
        domain: 'unknown',
      };
    }
  }

  private buildJevInputs(tabs: TabItem[]): Array<Record<string, unknown>> {
    return tabs.map(this.sanitizeTab);
  }

  private extractChoiceResult(
    results: JevResult[],
    questionName: string,
  ): string | null {
    const result = results.find(
      (r) => r.name === questionName && r.type === 'choice',
    );
    if (result && result.type === 'choice') {
      return result.value;
    }
    return null;
  }

  private extractScoreResult(
    results: JevResult[],
    questionName: string,
  ): number | null {
    const result = results.find(
      (r) => r.name === questionName && r.type === 'score',
    );
    if (result && result.type === 'score') {
      return result.value;
    }
    return null;
  }

  private extractBooleanResult(
    results: JevResult[],
    questionName: string,
  ): boolean | null {
    const result = results.find(
      (r) => r.name === questionName && r.type === 'boolean',
    );
    if (result && result.type === 'boolean') {
      return result.value;
    }
    return null;
  }

  private extractChoiceProbability(
    results: JevResult[],
    questionName: string,
  ): number {
    const result = results.find(
      (r) => r.name === questionName && r.type === 'choice',
    );
    if (result && result.type === 'choice') {
      return result.probability;
    }
    return 0;
  }

  async classifyTabs(
    tabs: TabItem[],
    customCategories?: TabCategory[],
    existingClassifications?: Record<number, TabClassification>,
  ): Promise<TabClassification[]> {
    const cacheKey = this.getCacheKey('classify', tabs);
    const cached = this.getFromCache<TabClassification[]>(cacheKey);
    if (cached) return cached;

    const categories: readonly TabCategory[] =
      customCategories ?? DEFAULT_CATEGORIES;
    const question: JevQuestion = {
      ...CLASSIFICATION_QUESTION,
      options: { choices: [...categories] },
    };

    return this.enqueue(async () => {
      const response = await this.callJev({
        model: JEV_MODEL,
        questions: [question],
        inputs: this.buildJevInputs(tabs),
      });

      const results: TabClassification[] = [];
      for (let i = 0; i < tabs.length; i++) {
        const resultEntry = response.results[i];
        if (!resultEntry) continue;
        const inputResults = resultEntry.results ?? [];
        const category = this.extractChoiceResult(
          inputResults,
          'classification',
        );
        const confidence = this.extractChoiceProbability(
          inputResults,
          'classification',
        );

        const cat = category;
        // categories is guaranteed non-empty (DEFAULT_CATEGORIES has 9 elements)
        const fallbackCategory = (categories as TabCategory[])[0]!;
        const catNonNull = cat !== null ? cat : null;
        const catForInclude = catNonNull!;
        if (
          catNonNull !== null &&
          (categories as TabCategory[]).includes(catForInclude as TabCategory)
        ) {
          results.push({
            tabId: tabs[i]!.id,
            category: catNonNull as TabCategory,
            confidence,
            reasoning: `Jev classified as ${catNonNull}`,
          });
        } else {
          // Fallback to first category if classification fails
          results.push({
            tabId: tabs[i]!.id,
            category: fallbackCategory,
            confidence: 0,
            reasoning: 'Classification failed, defaulted',
          });
        }
      }

      // Merge with existing user classifications (user overrides AI)
      const merged = [...results];
      if (existingClassifications) {
        for (const [tabId, userCls] of Object.entries(
          existingClassifications,
        )) {
          const idx = merged.findIndex((c) => c.tabId === Number(tabId));
          if (idx >= 0) {
            merged[idx] = userCls;
          } else {
            merged.push(userCls);
          }
        }
      }

      this.setCache(cacheKey, merged);
      return merged;
    });
  }

  async routeTabs(
    tabs: TabItem[],
    workspaces: Workspace[],
  ): Promise<WorkspaceRecommendation[]> {
    const cacheKey = this.getCacheKey('route', tabs);
    const cached = this.getFromCache<WorkspaceRecommendation[]>(cacheKey);
    if (cached) return cached;

    if (workspaces.length === 0) {
      return [];
    }

    const workspaceChoices = workspaces.map((w) => `${w.id}:${w.name}`);
    const question: JevQuestion = {
      ...ROUTING_QUESTION,
      options: { choices: workspaceChoices },
    };

    return this.enqueue(async () => {
      const response = await this.callJev({
        model: JEV_MODEL,
        questions: [question],
        inputs: this.buildJevInputs(tabs),
      });

      const validWorkspaceIds = new Set(workspaces.map((w) => w.id));
      const results: WorkspaceRecommendation[] = [];

      for (let i = 0; i < tabs.length; i++) {
        const resultEntry = response.results[i];
        if (!resultEntry) continue;
        const inputResults = resultEntry.results ?? [];
        const choice = this.extractChoiceResult(inputResults, 'routing');
        const confidence = this.extractChoiceProbability(
          inputResults,
          'routing',
        );

        if (choice !== null) {
          const choiceStr = choice as string;
          const parts = choiceStr.split(':');
          const workspaceId = parts[0]!;
          const workspace = workspaces.find((w) => w.id === workspaceId)!;
          if (workspaceId && validWorkspaceIds.has(workspaceId)) {
            results.push({
              tabId: tabs[i]!.id,
              workspaceId,
              workspaceName: workspace.name,
              reason: `Jev routed to ${workspace.name}`,
              confidence,
            });
          }
        }
      }

      this.setCache(cacheKey, results);
      return results;
    });
  }

  async groupTabs(tabs: TabItem[]): Promise<RelatedTabGroup[]> {
    const cacheKey = this.getCacheKey('group', tabs);
    const cached = this.getFromCache<RelatedTabGroup[]>(cacheKey);
    if (cached) return cached;

    // For grouping, we'll use a different approach - score pairwise similarity
    // Since Jev choice questions work on individual inputs, we need a different strategy
    // We'll use a single choice question per tab about its topic
    const topicQuestion: JevQuestion = {
      name: 'topic',
      type: 'choice',
      prompt:
        'What is the main topic of this tab? Choose the most specific topic.',
      options: {
        choices: [
          'C++ development',
          'React development',
          'TypeScript development',
          'Python development',
          'Rust development',
          'Web development',
          'API design',
          'Database',
          'Testing',
          'Documentation',
          'Tutorial',
          'Reference',
          'News',
          'Social media',
          'Entertainment',
          'Shopping',
          'Email',
          'Chat',
          'Video call',
          'Project management',
          'Other',
        ],
      },
    };

    return this.enqueue(async () => {
      const response = await this.callJev({
        model: JEV_MODEL,
        questions: [topicQuestion],
        inputs: this.buildJevInputs(tabs),
      });

      // Group tabs by their assigned topic
      const topicGroups = new Map<string, number[]>();
      for (let i = 0; i < tabs.length; i++) {
        const resultEntry = response.results[i];
        if (!resultEntry) continue;
        const inputResults = resultEntry.results ?? [];
        const topic = this.extractChoiceResult(inputResults, 'topic');
        if (topic !== null && topic !== 'Other') {
          const existingGroup = topicGroups.get(topic)!;
          const group = existingGroup ? existingGroup : [];
          group.push(tabs[i]!.id);
          topicGroups.set(topic, group);
        }
      }

      const results: RelatedTabGroup[] = [];
      for (const [topic, tabIds] of topicGroups) {
        if (tabIds.length >= 2) {
          results.push({
            tabs: tabIds,
            topic: topic.slice(0, 30),
            description: `Tabs related to ${topic}`,
          });
        }
      }

      this.setCache(cacheKey, results);
      return results;
    });
  }

  async scoreFocus(tabs: TabItem[], goal: string): Promise<FocusRelevance[]> {
    const cacheKey = this.getCacheKey(`focus:${goal}`, tabs);
    const cached = this.getFromCache<FocusRelevance[]>(cacheKey);
    if (cached) return cached;

    const question: JevQuestion = {
      ...FOCUS_QUESTION,
      prompt: `Score how relevant this tab is to the user's focus goal: "${goal}". 0 = not relevant, 1 = highly relevant.`,
    };

    return this.enqueue(async () => {
      const response = await this.callJev({
        model: JEV_MODEL,
        questions: [question],
        inputs: this.buildJevInputs(tabs),
      });

      const results: FocusRelevance[] = [];
      for (let i = 0; i < tabs.length; i++) {
        const resultEntry = response.results[i]!;
        const inputResults = resultEntry.results ?? [];
        const score = this.extractScoreResult(inputResults, 'focus');

        if (score !== null) {
          results.push({
            tabId: tabs[i]!.id,
            score: Math.max(0, Math.min(1, score)),
            reason:
              score >= 0.7
                ? 'Highly relevant to focus goal'
                : score >= 0.4
                  ? 'Moderately relevant'
                  : 'Low relevance',
          });
        }
      }

      this.setCache(cacheKey, results);
      return results;
    });
  }

  async suggestCleanup(tabs: TabItem[]): Promise<CleanupSuggestion[]> {
    // First check for exact URL duplicates locally
    const urlMap = new Map<string, number[]>();
    for (const tab of tabs) {
      const rawUrl = tab.url?.trim();
      if (!rawUrl) continue;
      const hashIndex = rawUrl.indexOf('#');
      const queryIndex = rawUrl.indexOf('?');
      let baseUrl = rawUrl;
      if (hashIndex >= 0) baseUrl = rawUrl.slice(0, hashIndex);
      if (queryIndex >= 0) baseUrl = rawUrl.slice(0, queryIndex);
      const normalized = baseUrl;
      const existing = urlMap.get(normalized) ?? [];
      existing.push(tab.id);
      urlMap.set(normalized, existing);
    }

    const localDuplicates: CleanupSuggestion[] = [];
    for (const [url, ids] of urlMap) {
      if (ids.length > 1) {
        localDuplicates.push({
          type: 'duplicate',
          tabIds: ids.slice(1),
          description: `Exact duplicate of ${url}`,
        });
      }
    }

    // Use Jev for semantic cleanup detection
    const cacheKey = this.getCacheKey('cleanup', tabs);
    const cached = this.getFromCache<CleanupSuggestion[]>(cacheKey);
    if (cached) return [...localDuplicates, ...cached];

    const question: JevQuestion = {
      ...CLEANUP_QUESTION,
      prompt:
        'Should this tab be cleaned up? Choose the type of cleanup if applicable.',
    };

    const semantic = await this.enqueue(async () => {
      const response = await this.callJev({
        model: JEV_MODEL,
        questions: [question],
        inputs: this.buildJevInputs(tabs),
      });

      const results: CleanupSuggestion[] = [];
      for (let i = 0; i < tabs.length; i++) {
        const resultEntry = response.results[i]!;
        const inputResults = resultEntry.results ?? [];
        const choice = this.extractChoiceResult(inputResults, 'cleanup');

        if (choice !== null && choice !== 'keep') {
          results.push({
            type: choice as CleanupSuggestion['type'],
            tabIds: [tabs[i]!.id],
            description: `Jev suggested ${choice}`,
          });
        }
      }

      return results
        .filter((s) => s.tabIds.length > 0)
        .filter((s) =>
          s.tabIds.every((id: number) => tabs.some((t) => t.id === id)),
        );
    });

    this.setCache(cacheKey, semantic);
    return [...localDuplicates, ...semantic];
  }

  clearCache() {
    this.cache.clear();
  }
}

export const aiService = new AiService();
