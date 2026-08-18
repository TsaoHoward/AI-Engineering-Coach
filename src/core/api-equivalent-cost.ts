/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OPENAI_API_PRICING_2026_08_18 } from './api-pricing-catalog';
import { fillDayRange, fillMonthRange, fillWeekRange, isoWeek, normalizeModel, toDateStr } from './helpers';
import { DateFilter, Session } from './types/session-types';
import {
  ApiEquivalentCostData,
  ApiEquivalentModelCost,
  ApiEquivalentPeriodSeries,
  ApiEquivalentSessionCost,
  ApiEquivalentTokenTotals,
} from './types/api-equivalent-types';

const ZERO_TOKENS: ApiEquivalentTokenTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

type PeriodMap = Map<string, Map<string, number>>;

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function addTokens(target: ApiEquivalentTokenTotals, usage: ApiEquivalentTokenTotals): void {
  target.inputTokens += usage.inputTokens;
  target.outputTokens += usage.outputTokens;
  target.cacheReadTokens += usage.cacheReadTokens;
  target.cacheWriteTokens += usage.cacheWriteTokens;
}

function matchesNonDateFilter(session: Session, filter?: DateFilter): boolean {
  if (session.harness !== 'Codex') return false;
  if (filter?.harness && filter.harness !== 'Codex') return false;
  if (filter?.workspaceId && session.workspaceId !== filter.workspaceId) return false;
  return true;
}

function matchesCreationDate(creationDate: number, filter?: DateFilter): boolean {
  const day = toDateStr(creationDate);
  if (filter?.fromDate && day < filter.fromDate) return false;
  if (filter?.toDate && day > filter.toDate) return false;
  return true;
}

function modelUsd(
  model: string,
  usage: ApiEquivalentTokenTotals,
): number | null {
  const rate = OPENAI_API_PRICING_2026_08_18.rates[model];
  if (!rate) return null;
  return (
    usage.inputTokens * rate.input
    + usage.cacheReadTokens * rate.cachedInput
    + usage.outputTokens * rate.output
    + usage.cacheWriteTokens * (rate.cacheWrite ?? rate.input)
  ) / 1_000_000;
}

function addPeriodValue(map: PeriodMap, label: string, workspace: string, usd: number): void {
  if (!map.has(label)) map.set(label, new Map());
  const byWorkspace = map.get(label)!;
  byWorkspace.set(workspace, (byWorkspace.get(workspace) ?? 0) + usd);
}

function buildPeriodSeries(
  map: PeriodMap,
  workspaces: string[],
  fill: (keys: string[]) => string[],
): ApiEquivalentPeriodSeries {
  const labels = fill(Array.from(map.keys()));
  const usd = labels.map(label => {
    let total = 0;
    for (const value of map.get(label)?.values() ?? []) total += value;
    return roundUsd(total);
  });
  const byWorkspace: Record<string, number[]> = {};
  for (const workspace of workspaces) {
    byWorkspace[workspace] = labels.map(label => roundUsd(map.get(label)?.get(workspace) ?? 0));
  }
  return { labels, usd, byWorkspace };
}

/**
 * Value Codex sessions using one frozen OpenAI API pricing snapshot.
 *
 * V1 intentionally uses authoritative session-level `modelUsage` only. Date
 * selection and day/week/month attribution use `Session.creationDate`; request
 * timestamps never slice a session's cost. Unknown models remain unpriced.
 */
export function buildApiEquivalentCost(sessions: Session[], filter?: DateFilter): ApiEquivalentCostData {
  const totals: ApiEquivalentTokenTotals = { ...ZERO_TOKENS };
  const byModel = new Map<string, ApiEquivalentModelCost>();
  const bySession: ApiEquivalentSessionCost[] = [];
  const byWorkspace = new Map<string, number>();
  const dailyMap: PeriodMap = new Map();
  const weeklyMap: PeriodMap = new Map();
  const monthlyMap: PeriodMap = new Map();
  const sessionsWithoutUsage: string[] = [];
  const sessionsWithoutCreationDate: string[] = [];
  const unpricedModels = new Set<string>();
  let totalUsd = 0;
  let pricedSessions = 0;

  for (const session of sessions) {
    if (!matchesNonDateFilter(session, filter)) continue;
    if (session.creationDate == null) {
      sessionsWithoutCreationDate.push(session.sessionId);
      continue;
    }
    if (!matchesCreationDate(session.creationDate, filter)) continue;
    if (!session.modelUsage || Object.keys(session.modelUsage).length === 0) {
      sessionsWithoutUsage.push(session.sessionId);
      continue;
    }

    const sessionTokens: ApiEquivalentTokenTotals = { ...ZERO_TOKENS };
    const sessionPricedModels: string[] = [];
    const sessionUnpricedModels: string[] = [];
    let sessionUsd = 0;

    for (const [rawModel, rawUsage] of Object.entries(session.modelUsage)) {
      const model = normalizeModel(rawModel);
      const usage: ApiEquivalentTokenTotals = {
        inputTokens: rawUsage.inputTokens,
        outputTokens: rawUsage.outputTokens,
        cacheReadTokens: rawUsage.cacheReadTokens,
        cacheWriteTokens: rawUsage.cacheWriteTokens,
      };
      addTokens(totals, usage);
      addTokens(sessionTokens, usage);

      const existing = byModel.get(model) ?? {
        ...ZERO_TOKENS,
        sessions: 0,
        usd: 0,
        priced: OPENAI_API_PRICING_2026_08_18.rates[model] !== undefined,
      };
      existing.sessions += 1;
      addTokens(existing, usage);

      const usd = modelUsd(model, usage);
      if (usd == null) {
        unpricedModels.add(model);
        sessionUnpricedModels.push(model);
      } else {
        existing.usd += usd;
        sessionUsd += usd;
        sessionPricedModels.push(model);
      }
      byModel.set(model, existing);
    }

    if (sessionPricedModels.length > 0) pricedSessions += 1;
    totalUsd += sessionUsd;
    const workspace = session.workspaceName || 'unknown';
    byWorkspace.set(workspace, (byWorkspace.get(workspace) ?? 0) + sessionUsd);

    const creation = new Date(session.creationDate);
    const day = toDateStr(session.creationDate);
    const week = isoWeek(creation);
    const month = `${creation.getFullYear()}-${String(creation.getMonth() + 1).padStart(2, '0')}`;
    addPeriodValue(dailyMap, day, workspace, sessionUsd);
    addPeriodValue(weeklyMap, week, workspace, sessionUsd);
    addPeriodValue(monthlyMap, month, workspace, sessionUsd);

    bySession.push({
      sessionId: session.sessionId,
      workspace,
      creationDate: session.creationDate,
      ...sessionTokens,
      usd: roundUsd(sessionUsd),
      pricedModels: sessionPricedModels.sort(),
      unpricedModels: sessionUnpricedModels.sort(),
    });
  }

  const workspaceNames = Array.from(byWorkspace.keys()).sort();
  const modelResult: Record<string, ApiEquivalentModelCost> = {};
  for (const [model, data] of Array.from(byModel.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    modelResult[model] = { ...data, usd: roundUsd(data.usd) };
  }
  const workspaceResult: Record<string, number> = {};
  for (const workspace of workspaceNames) workspaceResult[workspace] = roundUsd(byWorkspace.get(workspace) ?? 0);

  bySession.sort((a, b) => a.creationDate - b.creationDate || a.sessionId.localeCompare(b.sessionId));
  sessionsWithoutUsage.sort();
  sessionsWithoutCreationDate.sort();

  return {
    scope: 'Codex',
    currency: 'USD',
    estimate: true,
    pricing: OPENAI_API_PRICING_2026_08_18,
    ...totals,
    totalUsd: roundUsd(totalUsd),
    pricedSessions,
    sessionsWithoutUsage,
    sessionsWithoutCreationDate,
    unpricedModels: Array.from(unpricedModels).sort(),
    byModel: modelResult,
    bySession,
    byWorkspace: workspaceResult,
    daily: buildPeriodSeries(dailyMap, workspaceNames, fillDayRange),
    weekly: buildPeriodSeries(weeklyMap, workspaceNames, fillWeekRange),
    monthly: buildPeriodSeries(monthlyMap, workspaceNames, fillMonthRange),
  };
}
