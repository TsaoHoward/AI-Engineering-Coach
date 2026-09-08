/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { findCodexDirs } from './parser-codex';

const ORIGINAL_ENV = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  WSL_DISTRO_NAME: process.env.WSL_DISTRO_NAME,
  WSL_INTEROP: process.env.WSL_INTEROP,
};

function restoreEnv(name: keyof typeof ORIGINAL_ENV): void {
  const value = ORIGINAL_ENV[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function createCodexDirs(home: string): string[] {
  const dirs = ['sessions', 'archived_sessions', 'archived-sessions']
    .map(name => path.join(home, '.codex', name));
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
  return dirs;
}

afterEach(() => {
  restoreEnv('HOME');
  restoreEnv('USERPROFILE');
  restoreEnv('WSL_DISTRO_NAME');
  restoreEnv('WSL_INTEROP');
});

describe('findCodexDirs WSL discovery', () => {
  it('discovers native WSL and mounted Windows active and archived roots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-wsl-discovery-'));
    const nativeWslHome = path.join(root, 'home', 'howard');
    const mountedWindowsHome = path.join(root, 'mnt', 'c', 'Users', 'howard');

    try {
      const nativeDirs = createCodexDirs(nativeWslHome);
      const mountedDirs = createCodexDirs(mountedWindowsHome);

      process.env.HOME = nativeWslHome;
      process.env.USERPROFILE = mountedWindowsHome;
      process.env.WSL_DISTRO_NAME = 'Ubuntu';
      delete process.env.WSL_INTEROP;

      expect(findCodexDirs()).toEqual([...nativeDirs, ...mountedDirs]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('deduplicates the same Codex roots when WSL home candidates overlap', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-wsl-dedupe-'));

    try {
      const dirs = createCodexDirs(root);
      process.env.HOME = root;
      process.env.USERPROFILE = root;
      process.env.WSL_DISTRO_NAME = 'Ubuntu';
      delete process.env.WSL_INTEROP;

      expect(findCodexDirs()).toEqual(dirs);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
