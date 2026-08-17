/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Cross-platform discovery for session and editor storage paths. */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { debugCore } from './log';

const CODEX_SESSION_DIR_NAMES = ['sessions', 'archived_sessions', 'archived-sessions'] as const;
const COMMAND_TIMEOUT_MS = 2_000;
const COMMAND_MAX_BUFFER = 16 * 1024;

type CommandRunner = (command: string, args: string[]) => string;

interface PathDiscoveryOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  release?: string;
  /** WSL-visible Windows user home. undefined = auto-discover, null = unavailable. */
  windowsHome?: string | null;
  commandRunner?: CommandRunner;
}

let cachedDefaultWslWindowsHome: string | null | undefined;

function canonicalKey(candidate: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? candidate.toLowerCase() : candidate;
}

function canonicalizeExistingDirectory(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  try {
    const resolved = path.resolve(candidate);
    if (!fs.statSync(resolved).isDirectory()) return undefined;
    return fs.realpathSync.native(resolved);
  } catch {
    return undefined;
  }
}

export function addExistingDir(
  dirs: string[],
  candidate: string | undefined,
  source?: string,
  platform: NodeJS.Platform = process.platform,
): void {
  const canonical = canonicalizeExistingDirectory(candidate);
  if (!canonical) return;
  const key = canonicalKey(canonical, platform);
  if (dirs.some(existing => canonicalKey(existing, platform) === key)) return;
  dirs.push(canonical);
  if (source) debugCore('path-discovery', `Added ${source} directory`, canonical);
}

export function findPortableWorkspaceStorageFromExtensionDir(extensionDir = __dirname): string | undefined {
  let current = path.resolve(extensionDir);
  for (let i = 0; i < 8; i++) {
    const base = path.basename(current).toLowerCase();
    const dataDir = base === 'data'
      ? current
      : base === 'extensions'
        ? path.dirname(current)
        : undefined;

    if (dataDir) {
      const candidate = path.join(dataDir, 'user-data', 'User', 'workspaceStorage');
      const canonical = canonicalizeExistingDirectory(candidate);
      if (canonical) {
        debugCore('path-discovery', 'Discovered portable VS Code workspaceStorage', canonical);
        return canonical;
      }
      debugCore('path-discovery', 'Portable VS Code data dir found without workspaceStorage', { dataDir, candidate });
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  debugCore('path-discovery', 'No portable VS Code workspaceStorage discovered from extension directory', extensionDir);
  return undefined;
}

function isWslEnvironment(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, release: string): boolean {
  if (platform !== 'linux') return false;
  const hasWslEnvMarker = Object.prototype.hasOwnProperty.call(env, 'WSL_DISTRO_NAME')
    || Object.prototype.hasOwnProperty.call(env, 'WSL_INTEROP');
  if (hasWslEnvMarker) return Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP);
  return /microsoft|wsl/i.test(release);
}

function runCommand(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: COMMAND_MAX_BUFFER,
    windowsHide: true,
  }).trim();
}

function resolveWindowsProfile(profile: string, commandRunner: CommandRunner): string | undefined {
  const value = profile.trim();
  if (!value) return undefined;

  // USERPROFILE may already be imported into WSL as a Unix path.
  if (value.startsWith('/')) return value;

  try {
    const converted = commandRunner('wslpath', ['-u', value]).trim();
    return converted.startsWith('/') ? converted : undefined;
  } catch (error) {
    debugCore('path-discovery', 'Cannot translate Windows user profile into WSL path', error);
    return undefined;
  }
}

function discoverWslWindowsHome(options: PathDiscoveryOptions): string | undefined {
  if (options.windowsHome !== undefined) return options.windowsHome ?? undefined;

  const useDefaultCache = options.platform === undefined
    && options.env === undefined
    && options.release === undefined
    && options.commandRunner === undefined;
  if (useDefaultCache && cachedDefaultWslWindowsHome !== undefined) {
    return cachedDefaultWslWindowsHome ?? undefined;
  }

  const env = options.env ?? process.env;
  const runner = options.commandRunner ?? runCommand;
  let profile = env.USERPROFILE && env.USERPROFILE !== env.HOME ? env.USERPROFILE : '';

  if (!profile) {
    try {
      profile = runner('cmd.exe', ['/d', '/s', '/c', 'echo %USERPROFILE%']);
      if (profile.includes('%USERPROFILE%')) profile = '';
    } catch (error) {
      debugCore('path-discovery', 'Cannot query Windows user profile from WSL', error);
    }
  }

  const resolved = profile ? resolveWindowsProfile(profile, runner) : undefined;
  if (useDefaultCache) cachedDefaultWslWindowsHome = resolved ?? null;
  return resolved;
}

function resolvedOptions(options: PathDiscoveryOptions): {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  release: string;
} {
  return {
    platform: options.platform ?? process.platform,
    env: options.env ?? process.env,
    release: options.release ?? os.release(),
  };
}

export function findCodexDataRoots(options: PathDiscoveryOptions = {}): string[] {
  const { platform, env, release } = resolvedOptions(options);
  const roots: string[] = [];
  const hostHome = env.HOME || env.USERPROFILE || '';
  if (hostHome) addExistingDir(roots, path.join(hostHome, '.codex'), 'host Codex', platform);

  if (isWslEnvironment(platform, env, release)) {
    const windowsHome = discoverWslWindowsHome(options);
    if (windowsHome) addExistingDir(roots, path.join(windowsHome, '.codex'), 'Windows Codex', platform);
  }

  return roots;
}

export function findCodexDirs(options: PathDiscoveryOptions = {}): string[] {
  const { platform } = resolvedOptions(options);
  const dirs: string[] = [];
  for (const codexRoot of findCodexDataRoots(options)) {
    for (const name of CODEX_SESSION_DIR_NAMES) {
      addExistingDir(dirs, path.join(codexRoot, name), `Codex ${name}`, platform);
    }
  }
  return dirs;
}
