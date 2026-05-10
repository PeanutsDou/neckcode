export type LightSchemeId = 'default' | 'qinglan' | 'zhuqing' | 'qinghe' | 'nuansha' | 'danzi';

export interface SchemeColorTokens {
  bgPrimary: string;
  bgSecondary: string;
  bgSurface: string;
  bgHover: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentDim: string;
  error: string;
  success: string;
  warning: string;
}

export interface LightScheme {
  id: LightSchemeId;
  name: string;
  palette: string[];
  tokens: SchemeColorTokens;
}

export const DEFAULT_LIGHT_SCHEME: LightSchemeId = 'default';

export const LIGHT_SCHEMES: LightScheme[] = [
  {
    id: 'default',
    name: '默认',
    palette: ['#fbfbf9', '#f3f1ec', '#ece9e2', '#e6e2d9', '#d8d2c7', '#4f6f7c'],
    tokens: {
      bgPrimary: '#fbfbf9',
      bgSecondary: '#f3f1ec',
      bgSurface: '#ece9e2',
      bgHover: '#e6e2d9',
      border: '#d8d2c7',
      textPrimary: '#302c27',
      textSecondary: '#68625b',
      textMuted: '#9a948b',
      accent: '#4f6f7c',
      accentDim: '#74909a',
      error: '#a86060',
      success: '#5d7e5d',
      warning: '#a88a5e',
    },
  },
  {
    id: 'qinglan',
    name: '晴蓝',
    palette: ['#eef5ff', '#e1edff', '#d6e5ff', '#c5d9ff', '#b8d0ff', '#a9c6ff'],
    tokens: {
      bgPrimary: '#f8fbff',
      bgSecondary: '#eef5ff',
      bgSurface: '#e1edff',
      bgHover: '#d6e5ff',
      border: '#c5d9ff',
      textPrimary: '#233244',
      textSecondary: '#53677f',
      textMuted: '#8195ad',
      accent: '#5f86c9',
      accentDim: '#8eace4',
      error: '#b86f72',
      success: '#5f8f75',
      warning: '#a98a4e',
    },
  },
  {
    id: 'zhuqing',
    name: '竹青',
    palette: ['#fff4d6', '#dfd7d3', '#bec8c8', '#9bb7bb', '#80abb1', '#5496a2'],
    tokens: {
      bgPrimary: '#fffaf0',
      bgSecondary: '#eef4df',
      bgSurface: '#dbe8cf',
      bgHover: '#c8dcc0',
      border: '#a9c4bf',
      textPrimary: '#263633',
      textSecondary: '#526966',
      textMuted: '#78908c',
      accent: '#5496a2',
      accentDim: '#80abb1',
      error: '#b86f68',
      success: '#54966f',
      warning: '#a58a4e',
    },
  },
  {
    id: 'qinghe',
    name: '青禾',
    palette: ['#f1ffee', '#e1f5d3', '#d5ecbe', '#c5e2a3', '#b5d887', '#a5cd6c'],
    tokens: {
      bgPrimary: '#fbfff8',
      bgSecondary: '#f1ffee',
      bgSurface: '#e1f5d3',
      bgHover: '#d5ecbe',
      border: '#c5e2a3',
      textPrimary: '#2d3b24',
      textSecondary: '#5d704e',
      textMuted: '#879879',
      accent: '#86b452',
      accentDim: '#a5cd6c',
      error: '#ad7168',
      success: '#679a4d',
      warning: '#9d914d',
    },
  },
  {
    id: 'nuansha',
    name: '暖砂',
    palette: ['#fff2ea', '#ffe6dd', '#ffdacf', '#ffccc0', '#ffbaac', '#ffac9c'],
    tokens: {
      bgPrimary: '#fffbf7',
      bgSecondary: '#fff2ea',
      bgSurface: '#ffe6dd',
      bgHover: '#ffdacf',
      border: '#efc4b8',
      textPrimary: '#3f2d27',
      textSecondary: '#735c53',
      textMuted: '#9c8178',
      accent: '#d97867',
      accentDim: '#f0a092',
      error: '#b76363',
      success: '#6e8f64',
      warning: '#a6814f',
    },
  },
  {
    id: 'danzi',
    name: '淡紫',
    palette: ['#fff1f6', '#f9e9f3', '#eddaef', '#e4ceec', '#dac1e8', '#d3b8e5'],
    tokens: {
      bgPrimary: '#fff9fc',
      bgSecondary: '#fff1f6',
      bgSurface: '#f9e9f3',
      bgHover: '#eddaef',
      border: '#dcc5df',
      textPrimary: '#392d3d',
      textSecondary: '#67566c',
      textMuted: '#927f98',
      accent: '#9b75b5',
      accentDim: '#c3a3d6',
      error: '#b56c7d',
      success: '#6f8d71',
      warning: '#a78256',
    },
  },
];

export function normalizeLightScheme(value: unknown): LightSchemeId {
  return LIGHT_SCHEMES.some(s => s.id === value) ? value as LightSchemeId : DEFAULT_LIGHT_SCHEME;
}

export function getLightScheme(id: LightSchemeId): LightScheme {
  return LIGHT_SCHEMES.find(s => s.id === id) || LIGHT_SCHEMES[0];
}
