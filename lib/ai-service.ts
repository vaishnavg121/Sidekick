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

function validateChoiceAnswer(
  answer: unknown,
  allowedChoices: string[],
): {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
} | null {
  if (!answer || typeof answer !== 'object') return null;
  const a = answer as Record<string, unknown>;
  if (a.type !== 'choice') return null;
  if (typeof a.choice !== 'string') return null;
  if (!allowedChoices.includes(a.choice)) return null;
  const probabilities = a.probabilities as Record<string, number> | undefined;
  if (
    !probabilities ||
    typeof probabilities !== 'object' ||
    Array.isArray(probabilities) ||
    Object.keys(probabilities).some((key) => !allowedChoices.includes(key))
  )
    return null;
  const confidence = probabilities[a.choice];
  if (
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    Object.values(probabilities).reduce((sum, p) => sum + p, 0) > 1.001 ||
    Object.values(probabilities).some(
      (p) => !Number.isFinite(p) || p < 0 || p > 1,
    )
  )
    return null;
  return { choice: a.choice, probabilities, confidence };
}

function validateScoreAnswer(
  answer: unknown,
): { score: number; normalized: number } | null {
  if (!answer || typeof answer !== 'object') return null;
  const a = answer as Record<string, unknown>;
  if (a.type !== 'score') return null;
  const score = a.score as number | undefined;
  const normalized = typeof score === 'number' ? score / 5 : undefined;
  if (
    typeof score !== 'number' ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 5
  )
    return null;
  if (typeof normalized !== 'number' || normalized < 0 || normalized > 1)
    return null;
  return { score, normalized };
}

export function sanitizeAiText(text: string): string {
  return (
    text
      .replace(/[<>]/g, '')
      .replace(/https?:\/\/[^\s]+/gi, (value) => {
        try {
          return new URL(value).hostname;
        } catch {
          return '[address]';
        }
      })
      .replace(/[?][^\s]*/g, '')
      .replace(
        /(?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*[^\s]+/gi,
        '[redacted]',
      )
      // eslint-disable-next-line no-control-regex -- scrub control characters from optional metadata
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .slice(0, 500)
  );
}

export class AiService {
  private gatewayKey: string | undefined;
  private generation = 0;
  private cache = new Map<string, { result: unknown; timestamp: number }>();
  private readonly CACHE_TTL = 1000 * 60 * 30; // 30 minutes
  private readonly MAX_CONCURRENT = 2;
  private activeRequests = 0;
  private queue: Array<() => Promise<unknown>> = [];

  setGatewayKey(key: string | undefined) {
    if (this.gatewayKey !== key) {
      this.clearCache();
      this.generation++;
    }
    this.gatewayKey = key;
  }

  async verifyConnection(
    key: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.callJev(
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
      const answer = response.answers.test as unknown as
        { type: string; probability: number } | undefined;
      if (
        !answer ||
        answer.type !== 'boolean' ||
        !Number.isFinite(answer.probability) ||
        answer.probability < 0 ||
        answer.probability > 1
      )
        throw Error('Jev verification returned an invalid answer.');
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

    const response = await this.enqueue(() =>
      fetch(JEV_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(20000),
        credentials: 'omit',
        redirect: 'error',
      }),
    ).catch(() => {
      throw Error(
        'Jev request failed or timed out. Check your connection and try again.',
      );
    });

    if (!response.ok) {
      throw new Error(
        response.status === 401 || response.status === 403
          ? 'Jev authorization failed. Check the Gateway key.'
          : response.status === 429
            ? 'Jev rate limit or quota reached. Try again later.'
            : `Jev request failed (HTTP ${response.status}).`,
      );
    }

    const data = (await response.json().catch(() => {
      throw Error('Jev returned malformed JSON. No changes were applied.');
    })) as JevEvaluateResponse;

    if (
      !data ||
      typeof data !== 'object' ||
      !data.answers ||
      typeof data.answers !== 'object' ||
      Array.isArray(data.answers)
    ) {
      throw new Error('Invalid Jev response: missing answers object');
    }

    const expected = Object.keys(request.questions);
    if (Object.keys(data.answers).some((id) => !expected.includes(id)))
      throw Error(
        'Invalid Jev response: unexpected question IDs. No changes were applied.',
      );
    for (const [id, question] of Object.entries(request.questions)) {
      const answer = data.answers[id] as unknown as
        Record<string, unknown> | undefined;
      const label =
        id === 'test'
          ? 'verification answer'
          : id.startsWith('classify_')
            ? 'classification'
            : id.startsWith('focus_')
              ? 'focus score'
              : id.startsWith('route_')
                ? 'workspace routing'
                : id.startsWith('topic_')
                  ? 'grouping'
                  : 'cleanup';
      let valid = !!answer && answer.type === question.type;
      if (valid && question.type === 'boolean')
        valid =
          typeof answer!.probability === 'number' &&
          Number.isFinite(answer!.probability) &&
          Number(answer!.probability) >= 0 &&
          Number(answer!.probability) <= 1;
      if (valid && question.type === 'choice')
        valid = !!validateChoiceAnswer(answer, Object.keys(question.criteria));
      if (valid && question.type === 'score') {
        const probabilities = answer!.probabilities;
        valid =
          !!validateScoreAnswer(answer) &&
          !!probabilities &&
          typeof probabilities === 'object' &&
          !Array.isArray(probabilities) &&
          Object.entries(probabilities).length > 0 &&
          Object.values(probabilities).reduce(
            (sum: number, p) => sum + Number(p),
            0,
          ) <= 1.001 &&
          Object.entries(probabilities).every(
            ([rung, p]) =>
              /^\d+$/.test(rung) &&
              Number(rung) < question.criteria.length &&
              typeof p === 'number' &&
              Number.isFinite(p) &&
              p >= 0 &&
              p <= 1,
          );
      }
      if (!valid)
        throw Error(
          `Jev returned an invalid ${label}. No changes were applied.`,
        );
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

  private getCacheKey(
    prefix: string,
    tabs: TabItem[],
    extraKey?: string,
  ): string {
    const metadata = tabs
      .map((t) => `${t.id}:${t.url}:${t.title.slice(0, 50)}`)
      .join('|');
    return `${this.generation}:${prefix}:${metadata}${extraKey ? `:${extraKey}` : ''}`;
  }

  private getFromCache<T>(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result as T;
    }
    return undefined;
  }

  private setCache(key: string, result: unknown) {
    if (this.cache.size >= 100)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  private sanitizeTab(tab: TabItem): string {
    try {
      const url = new URL(tab.url);
      const safeTitle = sanitizeAiText(tab.title).slice(0, 100);
      return `${tab.id}:${safeTitle} | ${url.hostname}`;
    } catch {
      const safeTitle = sanitizeAiText(tab.title).slice(0, 100);
      return `${tab.id}:${safeTitle} | unknown`;
    }
  }

  private buildState(tabs: TabItem[]): string {
    return tabs.map(this.sanitizeTab).join('\n');
  }

  /**
   * Classify tabs by creating a separate choice question for each tab.
   * Each question is named with the tab ID to map results back.
   * Instructions explicitly reference the target tab by its ID and title.
   */
  async classifyTabs(
    tabs: TabItem[],
    customCategories?: TabCategory[],
    existingClassifications?: Record<number, TabClassification>,
  ): Promise<TabClassification[]> {
    tabs = tabs.filter((t) => !t.restricted);
    if (!tabs.length) return [];
    const categories = customCategories ?? DEFAULT_CATEGORIES;
    const categoriesKey = categories.join(',');
    const overridesKey = existingClassifications
      ? Object.entries(existingClassifications)
          .map(([id, cls]) => `${id}:${cls.category}`)
          .join('|')
      : '';
    const extraKey = `cats:${categoriesKey}${overridesKey ? `|overrides:${overridesKey}` : ''}`;
    const cacheKey = this.getCacheKey('classify', tabs, extraKey);
    const cached = this.getFromCache<TabClassification[]>(cacheKey);
    if (cached) return cached;

    const criteria: Record<string, string> = {};
    for (const cat of categories) {
      criteria[cat] = cat;
    }
    const allowedChoices = [...categories];

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
          instructions: `Classify the browser tab with ID ${tab.id} (title: "${sanitizeAiText(tab.title).slice(0, 80)}") into exactly one category based on its title and domain.`,
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
        const answer = response.answers[`classify_${tab.id}`];
        const validated = validateChoiceAnswer(answer, allowedChoices);

        if (validated) {
          results.push({
            tabId: tab.id,
            category: validated.choice as TabCategory,
            confidence: validated.confidence,
            reasoning: `Jev classified as ${validated.choice}`,
          });
        } else {
          throw Error(
            'Jev returned an invalid classification. No categories were changed.',
          );
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
   * Each tab gets its own routing question with explicit tab reference.
   */
  async routeTabs(
    tabs: TabItem[],
    workspaces: Workspace[],
  ): Promise<WorkspaceRecommendation[]> {
    if (workspaces.length < 2) {
      return [];
    }

    // Include workspace definitions in cache key for invalidation
    const workspacesKey = workspaces
      .map((w) => `${w.id}:${w.name}`)
      .sort()
      .join('|');
    const cacheKey = this.getCacheKey('route', tabs, `ws:${workspacesKey}`);
    const cached = this.getFromCache<WorkspaceRecommendation[]>(cacheKey);
    if (cached) return cached;

    const criteria: Record<string, string> = {};
    for (const ws of workspaces) {
      criteria[ws.id] = ws.name;
    }
    const allowedChoices = workspaces.map((w) => w.id);

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
          instructions: `Select the best workspace for the tab with ID ${tab.id} (title: "${sanitizeAiText(tab.title).slice(0, 80)}") from the available workspaces.`,
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
        const answer = response.answers[`route_${tab.id}`];
        const validated = validateChoiceAnswer(answer, allowedChoices);

        if (validated) {
          const workspaceId = validated.choice;
          const workspace = workspaces.find((w) => w.id === workspaceId);
          if (workspaceId && workspace && validWorkspaceIds.has(workspaceId)) {
            results.push({
              tabId: tab.id,
              workspaceId,
              workspaceName: workspace.name,
              reason: `Jev routed to ${workspace.name}`,
              confidence: validated.confidence,
            });
          }
        }
        // If no valid answer, skip routing for this tab (no recommendation)
      }
    }

    this.setCache(cacheKey, results);
    return results;
  }

  /**
   * Group tabs by creating a topic question per tab, then clustering tabs
   * with matching topics. This provides per-tab topic assignment.
   * Excludes 'none' and 'Other' from valid generated groups.
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
          instructions: `What is the main topic of the tab with ID ${tab.id} (title: "${sanitizeAiText(tab.title).slice(0, 80)}")? Choose the most specific topic, or "none" if no group fits.`,
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
        const answer = response.answers[`topic_${tab.id}`];
        const validated = validateChoiceAnswer(answer, [
          'none',
          ...TOPIC_CHOICES,
        ]);

        if (
          validated &&
          validated.choice !== 'none' &&
          validated.choice !== 'Other'
        ) {
          const existingGroup = topicGroups.get(validated.choice);
          const group = existingGroup ?? [];
          group.push(tab.id);
          topicGroups.set(validated.choice, group);
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
   * Each question explicitly references the target tab.
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
          instructions: `Score how relevant the tab with ID ${tab.id} (title: "${sanitizeAiText(tab.title).slice(0, 80)}") is to the user's focus goal: "${sanitizeAiText(goal)}". Use the ordered rubric: 0 = not relevant through 5 = critically relevant. The application normalizes the returned score.`,
          criteria: [
            'not relevant',
            'slightly relevant',
            'moderately relevant',
            'highly relevant',
            'very highly relevant',
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
        const answer = response.answers[`focus_${tab.id}`];
        const validated = validateScoreAnswer(answer);

        if (validated) {
          const score = validated.score;
          const normalized = validated.normalized;

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
        } else {
          throw Error(
            'Jev returned an invalid focus score. No tabs were hidden.',
          );
        }
      }
    }

    this.setCache(cacheKey, results);
    return results;
  }

  /**
   * Evaluate cleanup per tab with individual cleanup questions.
   * Local exact-duplicate detection runs first (deterministic).
   * Each question explicitly references the target tab.
   */
  async suggestCleanup(tabs: TabItem[]): Promise<CleanupSuggestion[]> {
    // First check for exact URL duplicates locally (deterministic)
    const urlMap = new Map<string, number[]>();
    for (const tab of tabs) {
      const rawUrl = tab.url?.trim();
      if (!rawUrl) continue;
      const normalized = rawUrl; // Exact identity includes fragment and query; sessions may differ.
      const existing = urlMap.get(normalized) ?? [];
      existing.push(tab.id);
      urlMap.set(normalized, existing);
    }

    const localDuplicates: CleanupSuggestion[] = [];
    for (const ids of urlMap.values()) {
      if (ids.length > 1) {
        localDuplicates.push({
          type: 'duplicate',
          tabIds: ids.slice(1),
          description:
            'Exact duplicate URL. Keep the original tab; review sessions before closing.',
        });
      }
    }

    // Use Jev for semantic cleanup detection per tab
    const cacheKey = this.getCacheKey('cleanup', tabs);
    const cached = this.getFromCache<CleanupSuggestion[]>(cacheKey);
    if (cached) return [...localDuplicates, ...cached];

    const state = tabs.map(this.sanitizeTab).join('\n');
    const results: CleanupSuggestion[] = [];

    const cleanupChoices = ['keep', 'duplicate', 'stale', 'low-value'] as const;
    const allowedChoices = [...cleanupChoices];

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
          instructions: `Should the tab with ID ${tab.id} (title: "${sanitizeAiText(tab.title).slice(0, 80)}") be cleaned up? Choose the type of cleanup if applicable.`,
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
        const answer = response.answers[`cleanup_${tab.id}`];
        const validated = validateChoiceAnswer(answer, allowedChoices);

        if (validated && validated.choice !== 'keep') {
          results.push({
            type: validated.choice as CleanupSuggestion['type'],
            tabIds: [tab.id],
            description: `Jev suggested ${validated.choice}`,
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
