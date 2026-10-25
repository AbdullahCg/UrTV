# App PIN locks

From the launcher, open **Settings → App locks** to set a four-digit master PIN and an optional PIN for each installed app. The remote's number keys work, and the PIN submits as soon as the fourth digit is entered. The master PIN can unlock any app or change the lock settings.

The launcher checks its own launches. To protect launches from Android voice search, links, or other apps, enable **UrTV: app PIN protection** in the TV's Accessibility settings. Android requires the owner to turn on this service. UrTV uses app-window events to detect a protected app opening. For YouTube, it also reads the text and content description attached to a selected clickable item so another video card cannot bypass the app lock. This is processed on-device and is not stored or sent over the network.

The YouTube app's PIN allows one video choice after the app is unlocked. Later video-card selections return to the PIN screen; after entering the PIN, reopen the selected card in YouTube. Navigation and playback controls remain available.

Turning off the Accessibility service leaves launcher-started locks active but cannot intercept launches initiated by other apps or voice search.
