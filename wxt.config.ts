import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Momentum Extras',
    description: 'Unofficial enhancements for the Momentum Mod dashboard',
    permissions: ['storage'],
  },
  zip: {
    excludeSources: ['assets/screenshots/**'],
  },
  webExt: {
    binaries: { chrome: '/usr/bin/helium-browser' },
    chromiumPort: 9222,
    chromiumArgs: ['--remote-debugging-port=9222'],
    startUrls: ['https://dashboard.momentum-mod.org/profile/95259'],
  },
});
