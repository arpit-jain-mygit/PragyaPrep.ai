# PragyaPrep Android app

The Android app is the Angular site packaged with Capacitor. The pages are bundled inside the app and call the API named in
`src/environments/environment.live.ts` (today: the dev API). The app runs its pages at `https://localhost`, which the API allows
(`app_origin` in `infra/envs/dev/app/main.tf`).

- App id (permanent, cannot change after publishing): `app.pragyaprep.mobile`
- Project: `frontend/android` (Gradle). Settings: `frontend/capacitor.config.ts`.
- Icon and splash come from `frontend/assets/*.svg`; regenerate with `npx @capacitor/assets generate --android --assetPath assets`.

## You need once
Java 21 (`brew install openjdk@21`; Java 17 is too old for Capacitor 8 and Java 26 too new), and the Android SDK (Android Studio, or the command line tools with `platform-tools`, `platforms;android-36` and `build-tools`).
Set `ANDROID_HOME` to the SDK folder.

## Build a test app (APK) for your phone
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
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

# PragyaPrep iPhone app (same project, `frontend/ios`)

The iPhone project is generated and uses the same app id (`app.pragyaprep.mobile`), icon and splash. It has **not been built**: this
computer has no Xcode. It runs its pages at `capacitor://localhost`, which the API allows.

## You need once
- Xcode from the Mac App Store (about 10 GB), opened once so it can install its extras.
- An Apple ID. To run on your own iPhone: Xcode, Settings, Accounts, add the Apple ID, then in the project's Signing tab pick your
  Personal Team (free; the app expires after 7 days). To share with testers (TestFlight) or publish, an Apple Developer account
  (about $99 a year).

## Build and run
```bash
cd frontend
npx ng build
npx cap sync ios
npx cap open ios
```
In Xcode choose your iPhone (or a simulator) at the top and press Play.

## Publishing
Product, Archive, then Distribute to App Store Connect. Apple needs: privacy policy link, screenshots, an account-deletion
route (the profile page has the request), and a review that the app is more than a website in a frame.
