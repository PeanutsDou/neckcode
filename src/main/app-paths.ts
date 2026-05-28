import { existsSync } from 'fs';
import { cp, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export const APP_BRAND_NAME = 'Neck Code';
export const APP_PACKAGE_NAME = 'neckcode';
export const APP_DATA_DIR_NAME = '.neckcode';
export const LEGACY_APP_DATA_DIR_NAME = `.${'deepseek'}${'code'}`;
export const APP_DB_FILE_NAME = 'neckcode.db';
export const LEGACY_APP_DB_FILE_NAME = `${'deepseek'}${'code'}.db`;

export function userDataDir(): string {
  return join(homedir(), APP_DATA_DIR_NAME);
}

export function legacyUserDataDir(): string {
  return join(homedir(), LEGACY_APP_DATA_DIR_NAME);
}

export async function ensureUserDataDirMigrated(): Promise<void> {
  const next = userDataDir();
  if (existsSync(next)) return;

  const legacy = legacyUserDataDir();
  if (!existsSync(legacy)) {
    await mkdir(next, { recursive: true });
    return;
  }

  await cp(legacy, next, {
    recursive: true,
    errorOnExist: false,
    force: false,
  });
}
