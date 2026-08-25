import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

/**
 * A factory-floor palette: safety orange against cool steel, on paper in light
 * mode and slate in dark. Neutrals are biased blue rather than pure grey so they
 * sit with the steel rather than fighting the accent.
 */
const config = defineConfig({
  cssVarsPrefix: 'fb',
  globalCss: {
    'html, body': {
      bg: 'bg.canvas',
      color: 'fg.default',
    },
    '*::selection': {
      bg: 'rust.200',
      color: 'slate.900',
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: 'var(--font-display), "Arial Narrow", sans-serif' },
        body: { value: 'var(--font-body), system-ui, sans-serif' },
        mono: { value: 'var(--font-mono), ui-monospace, monospace' },
      },
      colors: {
        rust: {
          50: { value: '#FDF1E9' },
          100: { value: '#FBE6D8' },
          200: { value: '#F4C3A1' },
          300: { value: '#EC9C6A' },
          400: { value: '#E4783C' },
          500: { value: '#D95A18' },
          600: { value: '#B8480F' },
          700: { value: '#8E370B' },
          800: { value: '#5E2407' },
          900: { value: '#331303' },
        },
        steel: {
          50: { value: '#EFF6FA' },
          100: { value: '#E0EDF4' },
          200: { value: '#BBD8E8' },
          300: { value: '#8FBED6' },
          400: { value: '#5A9CBE' },
          500: { value: '#2C6B90' },
          600: { value: '#235A78' },
          700: { value: '#1B4463' },
          800: { value: '#122E44' },
          900: { value: '#0A1B28' },
        },
        slate: {
          50: { value: '#F3F7F9' },
          100: { value: '#E9EEF2' },
          200: { value: '#DEE7ED' },
          300: { value: '#C4D1DB' },
          400: { value: '#7A8B99' },
          500: { value: '#485B6A' },
          600: { value: '#2B3A45' },
          700: { value: '#1B252D' },
          800: { value: '#151D24' },
          900: { value: '#0E1419' },
        },
      },
    },
    semanticTokens: {
      colors: {
        'bg.canvas': { value: { _light: '{colors.slate.100}', _dark: '{colors.slate.900}' } },
        'bg.surface': { value: { _light: 'white', _dark: '{colors.slate.800}' } },
        'bg.muted': { value: { _light: '{colors.slate.50}', _dark: '{colors.slate.700}' } },
        'fg.default': { value: { _light: '#141E27', _dark: '{colors.slate.50}' } },
        'fg.muted': { value: { _light: '{colors.slate.500}', _dark: '#9BACB9' } },
        'fg.subtle': { value: { _light: '{colors.slate.400}', _dark: '#6B7D8C' } },
        'border.default': { value: { _light: '{colors.slate.300}', _dark: '{colors.slate.600}' } },
        'border.subtle': { value: { _light: '{colors.slate.200}', _dark: '#212D35' } },
        'accent.solid': { value: { _light: '{colors.rust.500}', _dark: '#FF8845' } },
        'accent.subtle': { value: { _light: '{colors.rust.100}', _dark: '#37200F' } },
        'accent.contrast': { value: { _light: 'white', _dark: '#160C05' } },
        // Belt direction chevrons sit on top of a steel-blue line, so they need a
        // step the line does not have — darker on paper, lighter on slate.
        'route.arrow': { value: { _light: '{colors.steel.700}', _dark: '{colors.steel.200}' } },
        // Status is its own axis, separate from the accent hue.
        'status.ok': { value: { _light: '#3B8551', _dark: '#68BC7D' } },
        'status.okSubtle': { value: { _light: '#E1F0E6', _dark: '#16291C' } },
        'status.warn': { value: { _light: '#A9741A', _dark: '#D6AB48' } },
        'status.warnSubtle': { value: { _light: '#F7EDD8', _dark: '#2C2413' } },
        'status.crit': { value: { _light: '#B0452D', _dark: '#E17A60' } },
        'status.critSubtle': { value: { _light: '#F8E3DE', _dark: '#2E1913' } },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
