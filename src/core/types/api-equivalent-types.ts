/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ApiEquivalentPricingRate {
  input: number;
  cachedInput: number;
  output: number;
  cacheWrite?: number;
}

export interface ApiEquivalentPricingMetadata {
  snapshotId: string;
  effectiveDate: string;
  source: string;
  sourceUrl: string;
  currency: 'USD';
  unit: 'per-1m-tokens';
  rates: Record<string, ApiEquivalentPricingRate>;
}

export interface ApiEquivalentTokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ApiEquivalentModelCost extends ApiEquivalentTokenTotals {
  sessions: number;
  usd: number;
  priced: boolean;
}

export interface ApiEquivalentSessionCost extends ApiEquivalentTokenTotals {
  sessionId: string;
  workspace: string;
  creationDate: number;
  usd: number;
  pricedModels: string[];
  unpricedModels: string[];
}

export interface ApiEquivalentPeriodSeries {
  labels: string[];
  usd: number[];
  byWorkspace: Record<string, number[]>;
}

/**
 * Codex-only estimate of what the observed token usage would cost at the
 * selected OpenAI API pricing snapshot. This is attribution, not an actual
 * ChatGPT/Codex subscription bill.
 */
export interface ApiEquivalentCostData extends ApiEquivalentTokenTotals {
  scope: 'Codex';
  currency: 'USD';
  estimate: true;
  pricing: ApiEquivalentPricingMetadata;
  totalUsd: number;
  pricedSessions: number;
  sessionsWithoutUsage: string[];
  sessionsWithoutCreationDate: string[];
  unpricedModels: string[];
  byModel: Record<string, ApiEquivalentModelCost>;
  bySession: ApiEquivalentSessionCost[];
  byWorkspace: Record<string, number>;
  daily: ApiEquivalentPeriodSeries;
  weekly: ApiEquivalentPeriodSeries;
  monthly: ApiEquivalentPeriodSeries;
}
