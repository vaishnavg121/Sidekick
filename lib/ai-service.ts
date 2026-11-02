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

// Vercel AI Gateway Jev endpoint (HTTP API)
const JEV_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
const JEV_MODEL = 'typesafe-ai/jev';

// Request/Response types matching Vercel AI Gateway /v1/evaluate API
interface JevEvaluateRequest {
  model: string;
  state: string;
  questions: Record<string, JevQuestion>;
  providerOptions?: {
    gateway?: {
      zeroDataRetention?: boolean;
      only?: string[];
      models?: Array<{
        model: string;
        when?: {
          question: string;
          confidenceBelow?: number;
          probabilityInside?: [number, number];
        };
      }>;
    };
  };
}

interface JevEvaluateResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  providerMetadata?: {
    gateway?: {
      routing?: {
        originalModelId: string;
        resolvedProvider: string;
        canonicalSlug: string;
        finalProvider: string;
      };
      cost?: string;
      marketCost?: string;
      surchargeCost?: string;
      gatewayCost?: string;
      generationId?: string;
    };
  };
}

type JevQuestionType = 'boolean' | 'choice' | 'score';

interface JevQuestionBase {
  type: JevQuestionType;
  instructions: string;
}

interface JevBooleanQuestion extends JevQuestionBase {
  type: 'boolean';
  criteria?: {
    true: string;
    false: string;
  };
}

interface JevChoiceQuestion extends JevQuestionBase {
  type: 'choice';
  criteria: Record<string, string>;
}

interface JevScoreQuestion extends JevQuestionBase {
  type: 'score';
  criteria: string[]; // at least 2 labels, ordered lowest to highest
}

type JevQuestion = JevBooleanQuestion | JevChoiceQuestion | JevScoreQuestion;

interface JevAnswer {
  type: 'boolean' | 'choice' | 'score';
}

interface JevChoiceAnswer extends JevAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
}

interface JevScoreAnswer extends JevAnswer {
  type: 'score';
  score: number;
  normalized: number;
  probabilities: Record<string, number>;
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

const TOPIC_CHOICES = [
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
] as const;

const MAX_BATCH_SIZE = 20; // Maximum tabs per Jev request to avoid oversized requests

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
          model: JEV_MODEL,
          state: 'test',
          questions: {
            test: {
              type: 'boolean',
              instructions: 'Return true.',
            },
          },
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
    request: JevEvaluateRequest,
    key?: string,
  ): Promise<JevEvaluateResponse> {
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

    const data = (await response.json()) as JevEvaluateResponse;

    if (!data.answers || typeof data.answers !== 'object') {
      throw new Error('Invalid Jev response: missing answers object');
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

  private sanitizeTab(tab: TabItem): string {
    try {
      const url = new URL(tab.url);
      // Escape HTML entities in title to prevent XSS in state
      const safeTitle = tab.title
        .slice(0, 100)
        .replace(/&/g, '&')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      return `${tab.id}:${safeTitle} | ${url.hostname}`;
    } catch {
      const safeTitle = tab.title
        .slice(0, 100)
        .replace(/&/g, '&')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      return `${tab.id}:${safeTitle} | unknown`;
    }
  }

  private buildState(tabs: TabItem[]): string {
    return tabs.map(this.sanitizeTab).join('\n');
  }

  /**
   * Classify tabs by creating a separate choice question for each tab.
   * Each question is named with the tab ID to map results back.
   */
  async classifyTabs(
    tabs: TabItem[],
    customCategories?: TabCategory[],
    existingClassifications?: Record<number, TabClassification>,
  ): Promise<TabClassification[]> {
    const cacheKey = this.getCacheKey('classify', tabs);
    const cached = this.getFromCache<TabClassification[]>(cacheKey);
    if (cached) return cached;

    const categories = customCategories ?? DEFAULT_CATEGORIES;
    const criteria: Record<string, string> = {};
    for (const cat of categories) {
      criteria[cat] = cat;
    }

    // Process in batches to avoid oversized requests
    const results: TabClassification[] = [];
    for (
      let batchStart = 0;
      batchStart < tabs.length;
      batchStart += MAX_BATCH_SIZE
    ) {
      const batch = tabs.slice(batchStart, batchStart + MAX_BATCH_SIZE);

      // Create a separate classification question for each tab in the batch
      const questions: Record<string, JevQuestion> = {};
      for (const tab of batch) {
        questions[`classify_${tab.id}`] = {
          type: 'choice',
          instructions:
            'Classify this browser tab into exactly one category based on its title and domain.',
          criteria,
        };
      }

      const response = await this.callJev({
        model: JEV_MODEL,
        state: batch.map(this.sanitizeTab).join('\n'),
        questions,
      });

      // Map answers back to tabs using question IDs
      for (const tab of batch) {
        const answer = response.answers[`classify_${tab.id}`] as
          JevChoiceAnswer | undefined;
        const category = answer?.choice;
        const probabilities = answer?.probabilities ?? {};
        const confidence = category ? (probabilities[category] ?? 0) : 0;

        if (category && categories.includes(category as TabCategory)) {
          results.push({
            tabId: tab.id,
            category: category as TabCategory,
            confidence,
            reasoning: `Jev classified as ${category}`,
          });
        } else {
          const fallbackCategory = categories[0] as TabCategory;
          results.push({
            tabId: tab.id,
            category: fallbackCategory,
            confidence: 0,
            reasoning: 'Classification failed, defaulted',
          });
        }
      }
    }

    // Merge with existing user classifications (user overrides AI)
    const merged = [...results];
    if (existingClassifications) {
      for (const [tabId, userCls] of Object.entries(existingClassifications)) {
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
  }

  /**
   * Route tabs to workspaces with per-tab evaluation.
   * Each tab gets its own routing question.
   */
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

    const criteria: Record<string, string> = {};
    for (const ws of workspaces) {
      criteria[ws.id] = ws.name;
    }

    const results: WorkspaceRecommendation[] = [];

    // Process in batches
    for (
      let batchStart = 0;
      batchStart < tabs.length;
      batchStart += MAX_BATCH_SIZE
    ) {
      const batch = tabs.slice(batchStart, batchStart + MAX_BATCH_SIZE);

      const questions: Record<string, JevQuestion> = {};
      for (const tab of batch) {
        questions[`route_${tab.id}`] = {
          type: 'choice',
          instructions:
            'Select the best workspace for this tab from the available workspaces.',
          criteria,
        };
      }

      const response = await this.callJev({
        model: JEV_MODEL,
        state: batch.map(this.sanitizeTab).join('\n'),
        questions,
      });

      const validWorkspaceIds = new Set(workspaces.map((w) => w.id));

      for (const tab of batch) {
        const answer = response.answers[`route_${tab.id}`] as
          JevChoiceAnswer | undefined;
        const choice = answer?.choice;
        const probabilities = answer?.probabilities ?? {};

        if (choice) {
          const workspaceId = choice.split(':')[0]!;
          const workspace = workspaces.find((w) => w.id === workspaceId)!;
          if (workspaceId && workspace && validWorkspaceIds.has(workspaceId)) {
            const confidence = probabilities[choice] ?? 0;
            results.push({
              tabId: tab.id,
              workspaceId,
              workspaceName: workspace.name,
              reason: `Jev routed to ${workspace.name}`,
              confidence,
            });
          }
        }
      }
    }

    this.setCache(cacheKey, results);
    return results;
  }

  /**
   * Group tabs by creating a topic question per tab, then clustering tabs
   * with matching topics. This provides per-tab topic assignment.
   */
  async groupTabs(tabs: TabItem[]): Promise<RelatedTabGroup[]> {
    const cacheKey = this.getCacheKey('group', tabs);
    const cached = this.getFromCache<RelatedTabGroup[]>(cacheKey);
    if (cached) return cached;

    const criteria: Record<string, string> = { none: 'No group' };
    for (const topic of TOPIC_CHOICES) {
      criteria[topic] = topic;
    }

    const topicGroups = new Map<string, number[]>();

    // Process in batches to get topic per tab
    for (
      let batchStart = 0;
      batchStart < tabs.length;
      batchStart += MAX_BATCH_SIZE
    ) {
      const batch = tabs.slice(batchStart, batchStart + MAX_BATCH_SIZE);
      const state = batch.map(this.sanitizeTab).join('\n');

      const questions: Record<string, JevQuestion> = {};
      for (const tab of batch) {
        questions[`topic_${tab.id}`] = {
          type: 'choice',
          instructions:
            'What is the main topic of this tab? Choose the most specific topic, or "none" if no group fits.',
          criteria: {
            none: 'No group fits this tab',
            ...Object.fromEntries(TOPIC_CHOICES.map((t) => [t, t])),
          },
        };
      }

      const response = await this.callJev({
        model: JEV_MODEL,
        state,
        questions,
      });

      for (const tab of batch) {
        const answer = response.answers[`topic_${tab.id}`] as
          JevChoiceAnswer | undefined;
        const topic = answer?.choice;
        if (topic && topic !== 'Other') {
          const existingGroup = topicGroups.get(topic!);
          const group = existingGroup ?? [];
          group.push(tab.id);
          topicGroups.set(topic!, group);
        }
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
  }

  /**
   * Score focus relevance per tab with individual score questions.
   */
  async scoreFocus(tabs: TabItem[], goal: string): Promise<FocusRelevance[]> {
    const cacheKey = this.getCacheKey(`focus:${goal}`, tabs);
    const cached = this.getFromCache<FocusRelevance[]>(cacheKey);
    if (cached) return cached;

    const results: FocusRelevance[] = [];

    for (
      let batchStart = 0;
      batchStart < tabs.length;
      batchStart += MAX_BATCH_SIZE
    ) {
      const batch = tabs.slice(batchStart, batchStart + MAX_BATCH_SIZE);
      const state = batch.map(this.sanitizeTab).join('\n');

      const questions: Record<string, JevQuestion> = {};
      for (const tab of batch) {
        questions[`focus_${tab.id}`] = {
          type: 'score',
          instructions: `Score how relevant this tab is to the user's focus goal: "${goal}". 0 = not relevant, 1 = highly relevant.`,
          criteria: [
            'not relevant',
            'slightly relevant',
            'moderately relevant',
            'highly relevant',
            'critically relevant',
          ],
        };
      }

      const response = await this.callJev({
        model: JEV_MODEL,
        state,
        questions,
      });

      for (const tab of batch) {
        const answer = response.answers[`focus_${tab.id}`] as
          JevScoreAnswer | undefined;
        const score = answer?.score ?? 0;
        const normalized = answer?.normalized ?? 0;

        const reason =
          score >= 4
            ? 'Critically relevant to focus goal'
            : score >= 3
              ? 'Highly relevant to focus goal'
              : score >= 2
                ? 'Moderately relevant'
                : score >= 1
                  ? 'Slightly relevant'
                  : 'Not relevant';

        results.push({
          tabId: tab.id,
          score: normalized,
          reason,
        });
      }
    }

    this.setCache(cacheKey, results);
    return results;
  }

  /**
   * Evaluate cleanup per tab with individual cleanup questions.
   * Local exact-duplicate detection runs first (deterministic).
   */
  async suggestCleanup(tabs: TabItem[]): Promise<CleanupSuggestion[]> {
    // First check for exact URL duplicates locally (deterministic)
    const urlMap = new Map<string, number[]>();
    for (const tab of tabs) {
      const rawUrl = tab.url?.trim();
      if (!rawUrl) continue;
      const hashIndex = rawUrl.indexOf('#');
      let baseUrl = rawUrl;
      if (hashIndex >= 0) baseUrl = rawUrl.slice(0, hashIndex);
      // Keep query parameters for duplicate detection - only strip fragment
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

    // Use Jev for semantic cleanup detection per tab
    const cacheKey = this.getCacheKey('cleanup', tabs);
    const cached = this.getFromCache<CleanupSuggestion[]>(cacheKey);
    if (cached) return [...localDuplicates, ...cached];

    const state = tabs.map(this.sanitizeTab).join('\n');
    const results: CleanupSuggestion[] = [];

    for (
      let batchStart = 0;
      batchStart < tabs.length;
      batchStart += MAX_BATCH_SIZE
    ) {
      const batch = tabs.slice(batchStart, batchStart + MAX_BATCH_SIZE);

      const questions: Record<string, JevQuestion> = {};
      for (const tab of batch) {
        questions[`cleanup_${tab.id}`] = {
          type: 'choice',
          instructions:
            'Should this tab be cleaned up? Choose the type of cleanup if applicable.',
          criteria: {
            keep: 'Tab is useful and should be kept',
            duplicate: 'Tab is a semantic duplicate of another tab',
            stale: 'Tab is outdated or no longer relevant',
            'low-value': 'Tab provides little value',
          },
        };
      }

      const response = await this.callJev({
        model: JEV_MODEL,
        state,
        questions,
      });

      for (const tab of batch) {
        const answer = response.answers[`cleanup_${tab.id}`] as
          JevChoiceAnswer | undefined;
        const choice = answer?.choice;

        if (choice && choice !== 'keep') {
          results.push({
            type: choice as CleanupSuggestion['type'],
            tabIds: [tab.id],
            description: `Jev suggested ${choice}`,
          });
        }
      }
    }

    const semantic = results.filter((s) =>
      s.tabIds.every((id: number) => tabs.some((t) => t.id === id)),
    );

    this.setCache(cacheKey, semantic);
    return [...localDuplicates, ...semantic];
  }

  clearCache() {
    this.cache.clear();
  }
}

export const aiService = new AiService();
