export type PermissionMode = 'default' | 'fullAccess' | 'plan';

export const PERMISSION_OPTIONS: { value: PermissionMode; label: string }[] = [
  { value: 'default', label: '默认权限' },
  { value: 'fullAccess', label: '完全访问' },
  { value: 'plan', label: '计划模式 (只读)' },
];
