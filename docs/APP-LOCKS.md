# App PINs

On the UrTV home screen, open the top **Settings** button, then **App locks** (قفل التطبيقات).

1. Create a master PIN (exactly 4 English digits) and confirm it. There is no default PIN.
2. Select an app and enter its own PIN twice. Different apps can use different PINs.
3. Opening that app through UrTV now asks for its PIN. Cancel returns to Home without opening the app.
4. Return to App locks using the master PIN to change or remove an app PIN, change the master PIN, or remove all locks.

The master PIN can also unlock an app for recovery. A new PIN check is required for every launch through UrTV; unlocking does not permanently unlock the app. Leading zeros are preserved. The remote's number keys or the on-screen keypad both work.

The keypad matches the launcher's green, gold and soft translucent surfaces. Buttons are large and separated, with an ivory focus highlight. The fourth digit submits automatically—there is no Continue button or extra OK press. Remote number keys, numeric-keypad keys and the on-screen keypad all work. Delete removes one digit; Clear removes all digits. Holding a number key does not repeat digits accidentally.

Five failed attempts cause a 30-second cooldown shared across apps and settings. PINs are stored as salted PBKDF2-HMAC-SHA256 verifiers (120,000 rounds), in the launcher's private preferences. Plaintext PINs are not stored, logged, sent over the network, or included in backups. The PIN keypad blocks screen capture. PIN hashing runs off the UI thread.

## Scope

These are **launcher PIN gates**, not Android-wide app blocking. Apps opened through voice search, deep links, another app, or Android system settings do not pass through UrTV's gate. An app that is already running is not forcibly closed. No accessibility or device-administrator permission is required. Someone with ADB access or the ability to uninstall/reset the launcher can remove these controls.

Keep the master PIN somewhere safe. If all PINs are forgotten, resetting/reinstalling the launcher removes PINs and launcher preferences. Do not publish your private preferences or device backups.

## Testing

The pure-Java `tests/PinCryptoRun.java` checks verifier round trips, wrong PINs, leading zeros, salt uniqueness, invalid lengths and corrupt records. Compile it alongside `PinCrypto.java` with Java 17 and run `sa.urtv.home.PinCryptoRun`.

The device test runner `sa.urtv.home.PinInstrumentation` checks the master settings gate, wrong/correct app PINs, cancellation, master recovery, saved verifiers and retry limits. Build with `gradle -p android :launcher:assembleReleaseAndroidTest`, install the matching launcher and test APKs, then run:

```
adb shell am instrument -w sa.urtv.home.test/sa.urtv.home.PinInstrumentation
```

The test snapshots and restores the existing PIN store in `finally`. Run it with the remote untouched; it temporarily controls launcher UI. The APK signing key for the test must match the target launcher.
