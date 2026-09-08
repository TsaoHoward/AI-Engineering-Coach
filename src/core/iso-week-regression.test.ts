/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { fillWeekRange, isoWeek } from './helpers';

describe('ISO week boundary regression', () => {
  it('handles years where January 4 falls on Sunday', () => {
    expect(isoWeek(new Date(2026, 5, 1))).toBe('2026-W23');
    expect(isoWeek(new Date(2026, 6, 3))).toBe('2026-W27');
  });

  it('fills every week without dropping the final bucket', () => {
    expect(fillWeekRange(['2026-W23', '2026-W27'])).toEqual([
      '2026-W23',
      '2026-W24',
      '2026-W25',
      '2026-W26',
      '2026-W27',
    ]);
  });

  it('uses the ISO week-year at calendar year boundaries', () => {
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53');
  });
});
