/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from 'vitest';
import { assertTrustedPath } from './parser-shared';

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalWslDistro = process.env.WSL_DISTRO_NAME;
const originalWslInterop = process.env.WSL_INTEROP;

function restoreEnv(name: 'HOME' | 'USERPROFILE' | 'WSL_DISTRO_NAME' | 'WSL_INTEROP', value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv('HOME', originalHome);
  restoreEnv('USERPROFILE', originalUserProfile);
  restoreEnv('WSL_DISTRO_NAME', originalWslDistro);
  restoreEnv('WSL_INTEROP', originalWslInterop);
});

describe('assertTrustedPath WSL Windows Codex roots', () => {
  it.skipIf(process.platform !== 'linux')('trusts only the mounted Codex root for an explicit Windows USERPROFILE', () => {
    process.env.HOME = '/home/howard';
    process.env.USERPROFILE = 'C:\\Users\\howard';
    process.env.WSL_DISTRO_NAME = 'Ubuntu-24.04';
    delete process.env.WSL_INTEROP;

    expect(() => assertTrustedPath('/mnt/c/Users/howard/.codex/sessions/2026/03/27/rollout.jsonl')).not.toThrow();
    expect(() => assertTrustedPath('/mnt/c/Users/howard/Documents/secret.txt')).toThrow('Path is outside trusted directories');
    expect(() => assertTrustedPath('/mnt/c/Users/other/.codex/sessions/rollout.jsonl')).toThrow('Path is outside trusted directories');
  });

  it.skipIf(process.platform !== 'linux')('derives the mounted Windows Codex root from HOME when USERPROFILE is absent', () => {
    process.env.HOME = '/home/howard';
    delete process.env.USERPROFILE;
    process.env.WSL_DISTRO_NAME = 'Ubuntu-24.04';
    delete process.env.WSL_INTEROP;

    expect(() => assertTrustedPath('/mnt/c/Users/howard/.codex/archived_sessions/rollout.jsonl')).not.toThrow();
  });
});
