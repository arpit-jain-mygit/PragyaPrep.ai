import { Capacitor } from '@capacitor/core';

/** True inside the Android app, false in a normal browser. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open a link to a file or page. In a browser the caller opens a new tab; in the app a tab does not exist, so the link opens in the
 * phone's in-app browser (Chrome Custom Tabs) and the person returns to the app with the back button.
 */
export async function openInApp(url: string): Promise<void> {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

/** Wire up the phone's own behaviour: the back button goes back one page, and leaves the app from the first page. */
export async function setupNative(): Promise<void> {
  if (!isNative()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) history.back();
    else void App.exitApp();
  });
}
