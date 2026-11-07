// Request/Response types matching Vercel AI Gateway /v1/evaluate API
export interface JevEvaluateRequest {
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

export interface JevEvaluateResponse {
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

export type JevQuestionType = 'boolean' | 'choice' | 'score';

export interface JevQuestionBase {
  type: JevQuestionType;
  instructions: string;
}

export interface JevBooleanQuestion extends JevQuestionBase {
  type: 'boolean';
  criteria?: {
    true: string;
    false: string;
  };
}

export interface JevChoiceQuestion extends JevQuestionBase {
  type: 'choice';
  criteria: Record<string, string>;
}

export interface JevScoreQuestion extends JevQuestionBase {
  type: 'score';
  criteria: string[]; // at least 2 labels, ordered lowest to highest
}

export type JevQuestion =
  JevBooleanQuestion | JevChoiceQuestion | JevScoreQuestion;

export interface JevAnswer {
  type: 'boolean' | 'choice' | 'score';
}
