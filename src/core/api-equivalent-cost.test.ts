/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { Analyzer } from './analyzer';
import { buildApiEquivalentCost } from './api-equivalent-cost';
import { createSession } from './parser-shared';
import { ModelUsage, Session } from './types';

function codexSession(overrides: {
  sessionId: string;
  creationDate: number | null;
  workspaceName?: string;
  workspaceId?: string;
  modelUsage?: Record<string, ModelUsage>;
  harness?: string;
}): Session {
  return createSession({
    sessionId: overrides.sessionId,
    workspaceId: overrides.workspaceId ?? overrides.workspaceName ?? 'ws',
    workspaceName: overrides.workspaceName ?? 'project',
    harness: overrides.harness ?? 'Codex',
    requests: [],
    creationDate: overrides.creationDate,
    modelUsage: overrides.modelUsage,
  });
}

const JUNE_1 = new Date(2026, 5, 1, 10, 0, 0).getTime();
const JUNE_2 = new Date(2026, 5, 2, 10, 0, 0).getTime();
const JULY_3 = new Date(2026, 6, 3, 10, 0, 0).getTime();

describe('Codex API-equivalent cost attribution', () => {
  it('values authoritative session modelUsage with the frozen OpenAI pricing snapshot', () => {
    const data = buildApiEquivalentCost([codexSession({
      sessionId: 's1',
      creationDate: JUNE_1,
      modelUsage: {
        'gpt-5.3-codex': {
          inputTokens: 1_000_000,
          cacheReadTokens: 500_000,
          outputTokens: 250_000,
          cacheWriteTokens: 0,
        },
      },
    })]);

    expect(data.pricing.snapshotId).toBe('openai-api-2026-08-18');
    expect(data.currency).toBe('USD');
    expect(data.estimate).toBe(true);
    expect(data.totalUsd).toBeCloseTo(5.3375, 6);
    expect(data.byModel['gpt-5.3-codex'].usd).toBeCloseTo(5.3375, 6);
    expect(data.bySession[0].usd).toBeCloseTo(5.3375, 6);
  });

  it('prices GPT-5.6 cache writes at the explicit cache-write rate', () => {
    const data = buildApiEquivalentCost([codexSession({
      sessionId: 's-luna',
      creationDate: JUNE_1,
      modelUsage: {
        'gpt-5.6-luna': {
          inputTokens: 100_000,
          cacheReadTokens: 200_000,
          outputTokens: 50_000,
          cacheWriteTokens: 100_000,
        },
      },
    })]);

    expect(data.totalUsd).toBeCloseTo(0.109, 6);
  });

  it('surfaces unknown models as unpriced and never falls back to Copilot multipliers', () => {
    const data = buildApiEquivalentCost([codexSession({
      sessionId: 'unknown',
      creationDate: JUNE_1,
      modelUsage: {
        'future-codex-model': {
          inputTokens: 1_000_000,
          cacheReadTokens: 0,
          outputTokens: 1_000_000,
          cacheWriteTokens: 0,
        },
      },
    })]);

    expect(data.totalUsd).toBe(0);
    expect(data.unpricedModels).toEqual(['future-codex-model']);
    expect(data.byModel['future-codex-model'].priced).toBe(false);
    expect(data.byModel['future-codex-model'].usd).toBe(0);
    expect(data.bySession[0].unpricedModels).toEqual(['future-codex-model']);
  });

  it('aggregates Windows and WSL sessions by shared workspaceName', () => {
    const usage: Record<string, ModelUsage> = {
      'gpt-5.3-codex': {
        inputTokens: 1_000_000,
        cacheReadTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
      },
    };
    const data = buildApiEquivalentCost([
      codexSession({ sessionId: 'windows', creationDate: JUNE_1, workspaceId: 'windows-id', workspaceName: 'same-project', modelUsage: usage }),
      codexSession({ sessionId: 'wsl', creationDate: JUNE_2, workspaceId: 'wsl-id', workspaceName: 'same-project', modelUsage: usage }),
    ]);

    expect(Object.keys(data.byWorkspace)).toEqual(['same-project']);
    expect(data.byWorkspace['same-project']).toBeCloseTo(3.5, 6);
    expect(data.daily.byWorkspace['same-project'].reduce((a, b) => a + b, 0)).toBeCloseTo(data.totalUsd, 6);
  });

  it('selects and attributes complete sessions by Session.creationDate', () => {
    const data = buildApiEquivalentCost([
      codexSession({
        sessionId: 'included',
        creationDate: JUNE_1,
        modelUsage: {
          'gpt-5.3-codex': { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0, cacheWriteTokens: 0 },
        },
      }),
      codexSession({
        sessionId: 'excluded',
        creationDate: JUNE_2,
        modelUsage: {
          'gpt-5.3-codex': { inputTokens: 9_000_000, cacheReadTokens: 0, outputTokens: 0, cacheWriteTokens: 0 },
        },
      }),
    ], { fromDate: '2026-06-01', toDate: '2026-06-01' });

    expect(data.bySession.map(session => session.sessionId)).toEqual(['included']);
    expect(data.daily.labels).toEqual(['2026-06-01']);
    expect(data.totalUsd).toBeCloseTo(1.75, 6);
  });

  it('conserves priced USD across workspace, day, week, and month totals', () => {
    const data = buildApiEquivalentCost([
      codexSession({
        sessionId: 'june-1', creationDate: JUNE_1, workspaceName: 'a',
        modelUsage: { 'gpt-5.3-codex': { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0, cacheWriteTokens: 0 } },
      }),
      codexSession({
        sessionId: 'june-2', creationDate: JUNE_2, workspaceName: 'b',
        modelUsage: { 'gpt-5.5': { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0, cacheWriteTokens: 0 } },
      }),
      codexSession({
        sessionId: 'july-3', creationDate: JULY_3, workspaceName: 'a',
        modelUsage: { 'gpt-5.6-luna': { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0, cacheWriteTokens: 0 } },
      }),
    ]);

    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    expect(Object.values(data.byWorkspace).reduce((a, b) => a + b, 0)).toBeCloseTo(data.totalUsd, 6);
    expect(sum(data.daily.usd)).toBeCloseTo(data.totalUsd, 6);
    expect(sum(data.weekly.usd)).toBeCloseTo(data.totalUsd, 6);
    expect(sum(data.monthly.usd)).toBeCloseTo(data.totalUsd, 6);
  });

  it('excludes non-Codex harnesses and surfaces sessions missing authoritative usage', () => {
    const data = buildApiEquivalentCost([
      codexSession({ sessionId: 'missing-usage', creationDate: JUNE_1 }),
      codexSession({
        sessionId: 'claude', creationDate: JUNE_1, harness: 'Claude',
        modelUsage: { 'gpt-5.3-codex': { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0, cacheWriteTokens: 0 } },
      }),
    ]);

    expect(data.totalUsd).toBe(0);
    expect(data.sessionsWithoutUsage).toEqual(['missing-usage']);
    expect(data.bySession).toEqual([]);
  });

  it('exposes the attribution through Analyzer.getAiCredits without changing legacy credit math', () => {
    const session = codexSession({
      sessionId: 'facade',
      creationDate: JUNE_1,
      modelUsage: {
        'gpt-5.3-codex': { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0, cacheWriteTokens: 0 },
      },
    });
    const data = new Analyzer([session]).getAiCredits();

    expect(data.totalCredits).toBe(0);
    expect(data.apiEquivalentCost.totalUsd).toBeCloseTo(1.75, 6);
    expect(data.apiEquivalentCost.scope).toBe('Codex');
  });
});
