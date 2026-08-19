/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiEquivalentPricingMetadata } from './types/api-equivalent-types';

/**
 * V1 valuation snapshot for Codex API-equivalent cost attribution.
 *
 * Rates are standard OpenAI API text-token prices in USD per 1M tokens,
 * frozen for valuation on 2026-08-18. Historical sessions intentionally use
 * this same snapshot; this is not a historical-pricing engine.
 */
export const OPENAI_API_PRICING_2026_08_18: ApiEquivalentPricingMetadata = {
  snapshotId: 'openai-api-2026-08-18',
  effectiveDate: '2026-08-18',
  source: 'OpenAI API model pricing',
  sourceUrl: 'https://developers.openai.com/api/docs/models',
  currency: 'USD',
  unit: 'per-1m-tokens',
  rates: {
    'gpt-5-codex': { input: 1.25, cachedInput: 0.125, output: 10.00 },
    'gpt-5.1': { input: 1.25, cachedInput: 0.125, output: 10.00 },
    'gpt-5.1-codex': { input: 1.25, cachedInput: 0.125, output: 10.00 },
    'gpt-5.1-codex-mini': { input: 0.25, cachedInput: 0.025, output: 2.00 },
    'gpt-5.1-codex-max': { input: 1.25, cachedInput: 0.125, output: 10.00 },
    'gpt-5.2': { input: 1.75, cachedInput: 0.175, output: 14.00 },
    'gpt-5.2-codex': { input: 1.75, cachedInput: 0.175, output: 14.00 },
    'gpt-5.3-codex': { input: 1.75, cachedInput: 0.175, output: 14.00 },
    'gpt-5.4': { input: 2.50, cachedInput: 0.25, output: 15.00 },
    'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.50 },
    'gpt-5.5': { input: 5.00, cachedInput: 0.50, output: 30.00 },
    'gpt-5.6': { input: 5.00, cachedInput: 0.50, output: 30.00, cacheWrite: 6.25 },
    'gpt-5.6-sol': { input: 5.00, cachedInput: 0.50, output: 30.00, cacheWrite: 6.25 },
    'gpt-5.6-terra': { input: 2.00, cachedInput: 0.20, output: 12.00, cacheWrite: 2.50 },
    'gpt-5.6-luna': { input: 0.20, cachedInput: 0.02, output: 1.20, cacheWrite: 0.25 },
  },
};
