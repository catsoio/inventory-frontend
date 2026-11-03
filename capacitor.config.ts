import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The app shell (App Store / Google Play) around the same Angular app. The web build in
 * `dist/axle-frontend/browser` is what the shell shows; the API address comes from the
 * production environment file, which is absolute (`https://api.catso.io/api`).
 *
 * Not generated yet: `ios/` and `android/` (run `npm run cap:add:ios` / `cap:add:android` once,
 * with the Apple/Google account at hand), the bundle id below is a placeholder, and Stripe's Tap
 * to Pay needs native code on top (Terminal SDK, Apple's entitlement) that is not written.
 */
const config: CapacitorConfig = {
  appId: 'io.catso.axle',
  appName: 'Axle',
  webDir: 'dist/axle-frontend/browser',
  server: { androidScheme: 'https' },
};

export default config;
