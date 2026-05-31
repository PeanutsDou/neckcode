import { resolve } from 'path';

export function isPathInside(childPath: string, parentPath: string): boolean {
  const child = resolve(childPath);
  const parent = resolve(parentPath);
  return child === parent || child.startsWith(parent.endsWith('\\') || parent.endsWith('/') ? parent : `${parent}\\`);
}

export function assertPathInAllowedRoots(filePath: string, roots: string[], label = 'path'): string {
  const resolved = resolve(filePath);
  const allowed = roots.map(root => resolve(root));
  if (!allowed.some(root => isPathInside(resolved, root))) {
    throw new Error(`${label} is outside allowed roots: ${resolved}`);
  }
  return resolved;
}
