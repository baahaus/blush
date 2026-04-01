export interface Theme {
  name: string;
  prompt: string;      // hex color for prompt character
  accent: string;      // hex color for accents (tool names, status)
  dim: string;         // hex color for dim text
  error: string;       // hex color for errors
  success: string;     // hex color for success messages
  warning: string;     // hex color for warnings
}

export const themes: Record<string, Theme> = {
  default: {
    name: 'default',
    prompt: '#5B8DEF',
    accent: '#5B8DEF',
    dim: '#666666',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
  },
  mono: {
    name: 'mono',
    prompt: '#AAAAAA',
    accent: '#FFFFFF',
    dim: '#555555',
    error: '#FF6666',
    success: '#AAAAAA',
    warning: '#CCCCCC',
  },
  ocean: {
    name: 'ocean',
    prompt: '#06B6D4',
    accent: '#0EA5E9',
    dim: '#475569',
    error: '#F43F5E',
    success: '#2DD4BF',
    warning: '#FBBF24',
  },
  forest: {
    name: 'forest',
    prompt: '#22C55E',
    accent: '#4ADE80',
    dim: '#4B5563',
    error: '#EF4444',
    success: '#16A34A',
    warning: '#EAB308',
  },
  sunset: {
    name: 'sunset',
    prompt: '#F97316',
    accent: '#FB923C',
    dim: '#6B7280',
    error: '#DC2626',
    success: '#84CC16',
    warning: '#FBBF24',
  },
  rose: {
    name: 'rose',
    prompt: '#F43F5E',
    accent: '#FB7185',
    dim: '#6B7280',
    error: '#BE123C',
    success: '#4ADE80',
    warning: '#FBBF24',
  },
  hacker: {
    name: 'hacker',
    prompt: '#00FF00',
    accent: '#00CC00',
    dim: '#004400',
    error: '#FF0000',
    success: '#00FF00',
    warning: '#FFFF00',
  },
};

let activeTheme: Theme = themes.default;

export function setTheme(name: string): boolean {
  const theme = themes[name];
  if (!theme) return false;
  activeTheme = theme;
  return true;
}

export function getTheme(): Theme {
  return activeTheme;
}

export function listThemes(): string[] {
  return Object.keys(themes);
}
