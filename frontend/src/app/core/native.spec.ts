import { describe, expect, it } from 'vitest';
import { isNative, setupNative } from './native';

describe('Native app helpers', () => {
  it('knows it is not inside the Android app in a browser, and does nothing there', async () => {
    expect(isNative()).toBe(false);
    await expect(setupNative()).resolves.toBeUndefined();
  });
});
