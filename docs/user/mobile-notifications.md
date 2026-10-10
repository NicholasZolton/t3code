# Mobile notifications

Receive alerts when an agent finishes, fails, needs approval, or asks for input. Tap an alert to open its thread.

## Paired Android environments

For self-hosted notifications without T3 Connect, pair your Android phone to your environment normally, then enable that environment under **Settings → Notifications → Paired environments**. Your server and Android app must have matching Firebase configuration; ask your server administrator if setup is unavailable.

Alerts show thread titles and project names, using the same notification behavior as T3 Connect. Their content is encrypted for your phone before it reaches Google and decrypted natively, including when the app is not running. Conversations, code and files are not included. The server must remain running to send notifications; your phone does not need to keep a connection open to receive them. Opening the thread still requires Tailscale or your normal server connection.

Enable **Ongoing Agent Activity** to follow work from your enabled environments in one activity card. Finished results remain visible for up to 15 minutes. Alerts stay quiet when their thread is on screen, while the activity card continues to update. Paired delivery is independent of T3 Connect sign-in; iOS notifications still require T3 Connect.

Both the Android app and server must support encrypted notifications. Updating the app refreshes existing enabled registrations automatically. Turn off an environment's preference to stop local alerts and remove its notification key, even while the server is offline. Revoking the phone's pairing prevents new sends. Google still processes device identifiers and delivery metadata; encryption does not hide notifications displayed on your phone.

## T3 Connect

Sign in to T3 Connect, link your environments, and enable **Device Notifications** in **Settings → Notifications**. Your environment must have agent activity publishing enabled.

Enable **Ongoing Agent Activity** on Android or **Live Activity Updates** on iOS to follow work without opening the app. Finished results remain visible for up to 15 minutes. You can dismiss an Android activity card without disabling alerts; turn off ongoing activity in Settings to stop future cards.

T3 Connect alerts stay quiet while their thread is on screen. Ongoing activity continues to update. Viewing a thread on another device does not silence your phone's alerts.

Android notifications require Android 7.0 or newer and Google Play services. Android 16 and newer can promote ongoing activity to a Live Update, subject to system settings and device support. Other devices show a regular ongoing notification. Android 7's battery-saving modes can delay removal of expired cards.

Notification permission and Android notification channels are controlled in system Settings. Background delivery requires either configured paired Android notifications or T3 Connect; pairing alone does not enable it. Force-stopping the Android app in system Settings prevents push delivery until you open it again.
