import type { JevEvaluateRequest, JevEvaluateResponse } from './decision-types';

export interface EvaluationInfo {
  provider: 'typesafe';
  model: string;
  inputTokens: number;
  outputTokens: number;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const probability = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const modelName = (v: unknown): v is string =>
  typeof v === 'string' && /^jev[\w.-]{0,80}$/.test(v);
function invalid(): never {
  throw Error(
    'TypeSafe returned an invalid or contradictory decision response. No changes were applied.',
  );
}
function distribution(value: unknown, keys: string[]): Record<string, number> {
  if (
    !record(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k)) ||
    !Object.values(value).every(probability)
  )
    invalid();
  const sum = Object.values(value).reduce<number>((a, b) => a + Number(b), 0);
  if (Math.abs(sum - 1) > 0.001) invalid();
  return value as Record<string, number>;
}
/** The live API rounds displayed probabilities and expected scores independently.
 * Bound the possible underlying expectation rather than requiring rounded values
 * to recompute exactly. Mass, rubric, range and completeness remain validated.
 */
function scoreAgrees(
  score: number,
  probabilities: Record<string, number>,
): boolean {
  const values = Object.values(probabilities);
  const rounded = values.every(
    (p) => Math.abs(p * 100 - Math.round(p * 100)) < 1e-8,
  );
  const halfStep = rounded ? 0.005 : 0.000001;
  const bounds = values.map((p) => ({
    low: Math.max(0, p - halfStep),
    high: Math.min(1, p + halfStep),
  }));
  function extreme(descending: boolean) {
    let mass = 1 - bounds.reduce((sum, b) => sum + b.low, 0);
    let expectation = bounds.reduce((sum, b, i) => sum + i * b.low, 0);
    const indices = bounds.map((_, i) => i);
    if (descending) indices.reverse();
    for (const i of indices) {
      const add = Math.min(mass, bounds[i]!.high - bounds[i]!.low);
      expectation += i * add;
      mass -= add;
    }
    return expectation;
  }
  const scoreHalfStep =
    Math.abs(score * 100 - Math.round(score * 100)) < 1e-8 ? 0.005 : 0.000001;
  return (
    score + scoreHalfStep + 1e-8 >= extreme(false) &&
    score - scoreHalfStep - 1e-8 <= extreme(true)
  );
}
export function directRequest(request: JevEvaluateRequest) {
  return {
    model: 'jev-latest',
    state: request.state,
    questions: Object.fromEntries(
      Object.entries(request.questions).map(([id, q]) => [
        id,
        { ...q, type: q.type === 'boolean' ? 'noul' : q.type },
      ]),
    ),
  };
}
export function normalizeDirectResponse(
  raw: unknown,
  request: JevEvaluateRequest,
): { response: JevEvaluateResponse; info: EvaluationInfo } {
  if (
    !record(raw) ||
    !modelName(raw.model) ||
    !record(raw.answers) ||
    !record(raw.usage)
  )
    invalid();
  const usage = raw.usage;
  if (
    ![usage.input_tokens, usage.output_tokens].every(
      (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
    )
  )
    invalid();
  const ids = Object.keys(request.questions);
  if (
    Object.keys(raw.answers).length !== ids.length ||
    ids.some((id) => !Object.hasOwn(raw.answers as object, id))
  )
    invalid();
  const answers: Record<string, object> = {};
  for (const [id, q] of Object.entries(request.questions)) {
    const a = raw.answers[id];
    if (!record(a)) invalid();
    if (q.type === 'boolean') {
      if (a.type !== 'noul' || !probability(a.noul)) invalid();
      answers[id] = { type: 'boolean', probability: a.noul };
    } else if (q.type === 'choice') {
      if (
        a.type !== 'choice' ||
        typeof a.choice !== 'string' ||
        !Object.hasOwn(q.criteria, a.choice) ||
        !probability(a.confidence)
      )
        invalid();
      const probabilities = distribution(
        a.probabilities,
        Object.keys(q.criteria),
      );
      if (
        Object.values(probabilities).some(
          (p) => p > probabilities[a.choice as string]! + 1e-9,
        )
      )
        invalid();
      // Sidekick's existing confidence field means selected-option probability.
      // Preserve provider confidence separately; never substitute it or invent an explanation.
      answers[id] = {
        type: 'choice',
        choice: a.choice,
        probabilities,
        providerConfidence: a.confidence,
      };
    } else {
      if (
        a.type !== 'score' ||
        !probability(a.confidence) ||
        !record(a.legend) ||
        typeof a.score !== 'number' ||
        !Number.isFinite(a.score) ||
        a.score < 0 ||
        a.score > q.criteria.length - 1
      )
        invalid();
      const keys = q.criteria.map((_, i) => String(i));
      if (
        Object.keys(a.legend).length !== keys.length ||
        keys.some(
          (k, i) =>
            a.legend &&
            (a.legend as Record<string, unknown>)[k] !== q.criteria[i],
        )
      )
        invalid();
      const probabilities = distribution(a.probabilities, keys);
      if (!scoreAgrees(a.score, probabilities)) invalid();
      answers[id] = {
        type: 'score',
        score: a.score,
        probabilities,
        providerConfidence: a.confidence,
      };
    }
  }
  const info: EvaluationInfo = {
    provider: 'typesafe',
    model: raw.model,
    inputTokens: Number(usage.input_tokens),
    outputTokens: Number(usage.output_tokens),
  };
  return {
    response: {
      model: raw.model,
      answers: answers as JevEvaluateResponse['answers'],
      usage: { inputTokens: info.inputTokens, outputTokens: info.outputTokens },
    },
    info,
  };
}
export async function discoverDirectModels(key: string): Promise<string[]> {
  if (!key || key.startsWith('vck_'))
    throw Error('Enter a TypeSafe Direct key, not a Vercel key.');
  let response: Response;
  try {
    response = await fetch('https://api.typesafe.ai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
      credentials: 'omit',
      redirect: 'error',
    });
  } catch {
    throw Error('TypeSafe model discovery failed or timed out.');
  }
  if (!response.ok)
    throw Error(
      `TypeSafe model discovery failed (HTTP ${response.status}). Check authentication, access or balance.`,
    );
  const data: unknown = await response.json().catch(() => {
    throw Error('TypeSafe returned malformed model metadata.');
  });
  if (
    !record(data) ||
    !Array.isArray(data.models) ||
    data.models.length > 1000 ||
    !data.models.every((m) => record(m) && modelName(m.name))
  )
    throw Error('TypeSafe returned invalid model metadata.');
  const names = data.models.map((m) => m.name as string);
  if (!names.includes('jev-latest'))
    throw Error('TypeSafe account does not expose jev-latest.');
  return names;
}
