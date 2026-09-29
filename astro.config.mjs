import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  site: 'https://kliplug.ru',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Oswald',
      cssVariable: '--font-oswald',
      weights: ['500 700'],
      styles: ['normal'],
      subsets: ['cyrillic', 'latin'],
      fallbacks: ['Arial Narrow', 'sans-serif'],
    },
  ],
});
