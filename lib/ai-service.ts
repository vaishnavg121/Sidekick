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

const JEV_GATEWAY_URL = 'https://api.vercel.ai/v1/evaluate';

interface JevRequest {
  model: string;
  input: {
    prompt: string;
    context?: Record<string, unknown>;
  };
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
}

interface JevResponse {
  output: {
    choices: Array<{
      message: {
        content: string;
        role: string;
      };
    }>;
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

interface ClassificationResult {
  classifications: TabClassification[];
}

interface RoutingResult {
  recommendations: WorkspaceRecommendation[];
}

interface GroupResult {
  groups: RelatedTabGroup[];
}

interface FocusResult {
  relevance: FocusRelevance[];
}

interface CleanupResult {
  suggestions: CleanupSuggestion[];
}

const DEFAULT_CATEGORIES: TabCategory[] = [
  'Development',
  'Research',
  'Education',
  'Documentation',
  'Productivity',
  'Entertainment',
  'Shopping',
  'Communication',
  'Other',
];

const CLASSIFICATION_PROMPT = `You are an expert at categorizing browser tabs. Analyze the provided tabs and classify each into exactly one category.

Categories: {categories}

For each tab, provide:
- category: One of the categories above
- confidence: 0.0 to 1.0
- reasoning: Brief explanation (max 50 chars)

Return ONLY valid JSON matching this TypeScript interface:
{
  "classifications": [
    { "tabId": number, "category": string, "confidence": number, "reasoning": string }
  ]
}

Tabs to classify:`;

const ROUTING_PROMPT = `You are an expert at organizing browser tabs into workspaces. Analyze the tabs and recommend the best existing workspace for each.

Available workspaces: {workspaces}

For each tab, provide:
- workspaceId: The ID of the recommended workspace
- workspaceName: The name of that workspace
- reason: Brief explanation (max 80 chars)
- confidence: 0.0 to 1.0

Return ONLY valid JSON matching this TypeScript interface:
{
  "recommendations": [
    { "tabId": number, "workspaceId": string, "workspaceName": string, "reason": string, "confidence": number }
  ]
}

Tabs to route:`;

const GROUPING_PROMPT = `You are an expert at identifying related browser tabs. Group tabs that discuss the same project, topic, or task.

For each group, provide:
- tabs: Array of tab IDs in this group
- topic: Short topic name (max 30 chars)
- description: Brief description (max 100 chars)

Only create groups with 2+ tabs. Avoid duplicating existing folder structures.

Return ONLY valid JSON matching this TypeScript interface:
{
  "groups": [
    { "tabs": number[], "topic": string, "description": string }
  ]
}

Tabs to analyze:`;

const FOCUS_PROMPT = `You are an expert at filtering browser tabs for focus. Score each tab's relevance to the user's goal.

User's focus goal: "{goal}"

For each tab, provide:
- tabId: The tab's ID
- score: 0.0 to 1.0 (1.0 = highly relevant)
- reason: Brief explanation (max 60 chars)

Return ONLY valid JSON matching this TypeScript interface:
{
  "relevance": [
    { "tabId": number, "score": number, "reason": string }
  ]
}

Tabs to score:`;

const CLEANUP_PROMPT = `You are an expert at identifying tabs to clean up. Detect semantic duplicates, stale content, and low-value tabs.

For each suggestion, provide:
- type: "duplicate" | "stale" | "low-value"
- tabIds: Array of tab IDs
- description: Brief explanation (max 80 chars)

Return ONLY valid JSON matching this TypeScript interface:
{
  "suggestions": [
    { "type": string, "tabIds": number[], "description": string }
  ]
}

Tabs to analyze:`;

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
      await this.callJev(
        {
          model: 'gpt-4o-mini',
          input: { prompt: 'Return "ok" if you can read this.' },
          options: { maxTokens: 10 },
        },
        key,
      );
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Verification failed',
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

    return response.json() as Promise<JevResponse>;
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

  async classifyTabs(
    tabs: TabItem[],
    customCategories?: TabCategory[],
    existingClassifications?: Record<number, TabClassification>,
  ): Promise<TabClassification[]> {
    const cacheKey = this.getCacheKey('classify', tabs);
    const cached = this.getFromCache<TabClassification[]>(cacheKey);
    if (cached) return cached;

    const categories = customCategories ?? DEFAULT_CATEGORIES;
    const prompt =
      CLASSIFICATION_PROMPT.replace('{categories}', categories.join(', ')) +
      '\n' +
      JSON.stringify(tabs.map(this.sanitizeTab), null, 2);

    return this.enqueue(async () => {
      const response = await this.callJev({
        model: 'gpt-4o-mini',
        input: { prompt },
        options: { temperature: 0.1, maxTokens: 2000 },
      });

      const content = response.output.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as ClassificationResult;

      const results = parsed.classifications
        .filter((c) => categories.includes(c.category as TabCategory))
        .map((c) => ({
          ...c,
          confidence: Math.max(0, Math.min(1, c.confidence)),
        }));

      // Merge with existing user classifications (user overrides AI)
      const merged = [...results];
      if (existingClassifications) {
        for (const [tabId, userCls] of Object.entries(
          existingClassifications,
        )) {
          const idx = merged.findIndex((c) => c.tabId === Number(tabId));
          if (idx >= 0) {
            merged[idx] = userCls; // User override wins
          } else {
            merged.push(userCls); // User classified a tab AI didn't
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

    const prompt =
      ROUTING_PROMPT.replace(
        '{workspaces}',
        JSON.stringify(
          workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            description: `${w.name} workspace`,
          })),
        ),
      ) +
      '\n' +
      JSON.stringify(tabs.map(this.sanitizeTab), null, 2);

    return this.enqueue(async () => {
      const response = await this.callJev({
        model: 'gpt-4o-mini',
        input: { prompt },
        options: { temperature: 0.1, maxTokens: 2000 },
      });

      const content = response.output.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as RoutingResult;

      const validWorkspaceIds = new Set(workspaces.map((w) => w.id));
      const results = parsed.recommendations
        .filter((r) => validWorkspaceIds.has(r.workspaceId))
        .map((r) => ({
          ...r,
          confidence: Math.max(0, Math.min(1, r.confidence)),
        }));

      this.setCache(cacheKey, results);
      return results;
    });
  }

  async groupTabs(tabs: TabItem[]): Promise<RelatedTabGroup[]> {
    const cacheKey = this.getCacheKey('group', tabs);
    const cached = this.getFromCache<RelatedTabGroup[]>(cacheKey);
    if (cached) return cached;

    const prompt =
      GROUPING_PROMPT +
      '\n' +
      JSON.stringify(tabs.map(this.sanitizeTab), null, 2);

    return this.enqueue(async () => {
      const response = await this.callJev({
        model: 'gpt-4o-mini',
        input: { prompt },
        options: { temperature: 0.2, maxTokens: 2000 },
      });

      const content = response.output.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as GroupResult;

      const results = parsed.groups
        .filter((g) => g.tabs.length >= 2)
        .filter((g) =>
          g.tabs.every((id: number) => tabs.some((t) => t.id === id)),
        );

      this.setCache(cacheKey, results);
      return results;
    });
  }

  async scoreFocus(tabs: TabItem[], goal: string): Promise<FocusRelevance[]> {
    const cacheKey = this.getCacheKey(`focus:${goal}`, tabs);
    const cached = this.getFromCache<FocusRelevance[]>(cacheKey);
    if (cached) return cached;

    const prompt =
      FOCUS_PROMPT.replace('{goal}', goal) +
      '\n' +
      JSON.stringify(tabs.map(this.sanitizeTab), null, 2);

    return this.enqueue(async () => {
      const response = await this.callJev({
        model: 'gpt-4o-mini',
        input: { prompt },
        options: { temperature: 0.1, maxTokens: 2000 },
      });

      const content = response.output.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as FocusResult;

      const results = parsed.relevance
        .filter((r) => tabs.some((t) => t.id === r.tabId))
        .map((r) => ({
          ...r,
          score: Math.max(0, Math.min(1, r.score)),
        }));

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
          tabIds: ids.slice(1), // Keep first, suggest removing rest
          description: `Exact duplicate of ${url}`,
        });
      }
    }

    // Use Jev for semantic similarity
    const cacheKey = this.getCacheKey('cleanup', tabs);
    const cached = this.getFromCache<CleanupSuggestion[]>(cacheKey);
    if (cached) return [...localDuplicates, ...cached];

    const prompt =
      CLEANUP_PROMPT +
      '\n' +
      JSON.stringify(tabs.map(this.sanitizeTab), null, 2);

    const semantic = await this.enqueue(async () => {
      const response = await this.callJev({
        model: 'gpt-4o-mini',
        input: { prompt },
        options: { temperature: 0.2, maxTokens: 2000 },
      });

      const content = response.output.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as CleanupResult;

      return parsed.suggestions
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
