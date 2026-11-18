# PragyaPrep Android app

The Android app is the Angular site packaged with Capacitor. The pages are bundled inside the app and call the API named in
`src/environments/environment.live.ts` (today: the dev API). The app runs its pages at `https://localhost`, which the API allows
(`app_origin` in `infra/envs/dev/app/main.tf`).

- App id (permanent, cannot change after publishing): `app.pragyaprep.mobile`
- Project: `frontend/android` (Gradle). Settings: `frontend/capacitor.config.ts`.
- Icon and splash come from `frontend/assets/*.svg`; regenerate with `npx @capacitor/assets generate --android --assetPath assets`.

## You need once
Java 17, and the Android SDK (Android Studio, or the command line tools with `platform-tools`, `platforms;android-36` and `build-tools`).
Set `ANDROID_HOME` to the SDK folder.

## Build a test app (APK) for your phone
```bash
cd frontend
npx ng build
npx cap sync android
cd android && ./gradlew assembleDebug
```
The file is `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Send it to the phone and open it (allow installs from that
source), or with USB debugging on: `adb install -r app-debug.apk`.

## What works differently from the website
- The phone's back button goes back one page and leaves the app from the first page.
- Files, PDFs and live-class material open in the phone's in-app browser; videos play in the page.
- Admin downloads (Excel templates, CSV exports) are not reliable inside the app yet. Admins should use the website for those.

## Changing the API address later (for example to a domain you buy)
Edit `src/environments/environment.live.ts`, rebuild and publish an update. Add the new address to the API's allowed origins.
Keep the old address working for a while, because installed apps keep calling it until they update.
