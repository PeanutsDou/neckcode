export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypass';

export const PERMISSION_OPTIONS: { value: PermissionMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'plan', label: 'Plan Only' },
  { value: 'bypass', label: 'Bypass' },
];
