/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { findCodexDataRoots, findCodexDirs, findPortableWorkspaceStorageFromExtensionDir } from './path-discovery';

function withTempRoot(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'path-discovery-test-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function makeCodexDir(home: string, name: 'sessions' | 'archived_sessions' | 'archived-sessions'): string {
  const directory = path.join(home, '.codex', name);
  fs.mkdirSync(directory, { recursive: true });
  return fs.realpathSync.native(directory);
}

describe('Codex path discovery', () => {
  it('preserves host-local Codex discovery', () => {
    withTempRoot(root => {
      const active = makeCodexDir(root, 'sessions');
      const archivedUnderscore = makeCodexDir(root, 'archived_sessions');
      const archivedHyphen = makeCodexDir(root, 'archived-sessions');

      expect(findCodexDirs({ platform: 'linux', env: { HOME: root }, release: 'generic-linux' })).toEqual([
        active,
        archivedUnderscore,
        archivedHyphen,
      ]);
    });
  });

  it('adds the Windows Codex home in WSL without assuming a username or mount root', () => {
    withTempRoot(root => {
      const hostHome = path.join(root, 'host');
      const windowsHome = path.join(root, 'windows-profile');
      const hostActive = makeCodexDir(hostHome, 'sessions');
      const windowsActive = makeCodexDir(windowsHome, 'sessions');
      const windowsArchive = makeCodexDir(windowsHome, 'archived_sessions');
      const windowsLegacyArchive = makeCodexDir(windowsHome, 'archived-sessions');
      const commands: Array<{ command: string; args: string[] }> = [];

      const dirs = findCodexDirs({
        platform: 'linux',
        env: { HOME: hostHome, WSL_DISTRO_NAME: 'Ubuntu-24.04' },
        release: 'microsoft-standard-WSL2',
        commandRunner(command, args) {
          commands.push({ command, args });
          if (command === 'cmd.exe') return 'C:\\Users\\ExampleUser';
          if (command === 'wslpath') return windowsHome;
          throw new Error(`Unexpected command: ${command}`);
        },
      });

      expect(dirs).toEqual([hostActive, windowsActive, windowsArchive, windowsLegacyArchive]);
      expect(commands).toEqual([
        { command: 'cmd.exe', args: ['/d', '/s', '/c', 'echo %USERPROFILE%'] },
        { command: 'wslpath', args: ['-u', 'C:\\Users\\ExampleUser'] },
      ]);
    });
  });

  it('falls back to host-local history when the Windows home cannot be discovered', () => {
    withTempRoot(root => {
      const active = makeCodexDir(root, 'sessions');
      expect(findCodexDirs({
        platform: 'linux',
        env: { HOME: root, WSL_INTEROP: '/run/WSL/1_interop' },
        release: 'microsoft-standard-WSL2',
        windowsHome: null,
      })).toEqual([active]);
    });
  });

  it('deduplicates canonical-equivalent Codex roots', () => {
    withTempRoot(root => {
      const hostHome = path.join(root, 'host');
      makeCodexDir(hostHome, 'sessions');
      const aliasSegment = path.join(hostHome, 'alias-segment');
      fs.mkdirSync(aliasSegment, { recursive: true });
      const equivalentHome = path.join(aliasSegment, '..');

      expect(findCodexDataRoots({
        platform: 'linux',
        env: { HOME: hostHome, WSL_DISTRO_NAME: 'Ubuntu' },
        release: 'microsoft-standard-WSL2',
        windowsHome: equivalentHome,
      })).toEqual([fs.realpathSync.native(path.join(hostHome, '.codex'))]);
    });
  });

  it.each(['linux', 'darwin', 'win32'] as const)('does not add a second home on baseline %s', platform => {
    withTempRoot(root => {
      const hostHome = path.join(root, 'host');
      const otherHome = path.join(root, 'other');
      const active = makeCodexDir(hostHome, 'sessions');
      makeCodexDir(otherHome, 'sessions');

      expect(findCodexDirs({
        platform,
        env: { HOME: hostHome },
        release: platform === 'linux' ? 'generic-linux' : 'generic',
        windowsHome: otherHome,
      })).toEqual([active]);
    });
  });
});

describe('portable VS Code path discovery', () => {
  it('finds workspaceStorage relative to a portable extension directory', () => {
    withTempRoot(root => {
      const extensionDir = path.join(root, 'data', 'extensions', 'publisher.extension', 'dist');
      const workspaceStorage = path.join(root, 'data', 'user-data', 'User', 'workspaceStorage');
      fs.mkdirSync(extensionDir, { recursive: true });
      fs.mkdirSync(workspaceStorage, { recursive: true });

      expect(findPortableWorkspaceStorageFromExtensionDir(extensionDir)).toBe(fs.realpathSync.native(workspaceStorage));
    });
  });
});
