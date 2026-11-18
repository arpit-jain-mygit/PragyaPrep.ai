import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app is the same Angular site packaged inside a native shell. The pages are bundled in the app and talk to the
 * API named in src/environments/environment.live.ts. The app's own address is https://localhost, which the API must allow
 * (see PRAGYA_CORS_ORIGINS).
 */
const config: CapacitorConfig = {
  appId: 'app.pragyaprep.mobile',
  appName: 'PragyaPrep',
  webDir: 'dist/frontend/browser',
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#2563eb', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#2563eb' },
  },
};

export default config;
