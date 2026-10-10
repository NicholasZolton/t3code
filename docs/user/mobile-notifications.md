# Mobile notifications

Receive alerts when an agent finishes, fails, needs approval, or asks for input. Tap an alert to open its thread.

## Paired Android environments

For self-hosted notifications without T3 Connect, pair your Android phone to your environment normally, then enable that environment under **Settings → Notifications → Paired environments**. Your server and Android app must have matching Firebase configuration; ask your server administrator if setup is unavailable.

Alerts use generic text, without thread titles or conversation content. Opening a thread fetches its destination directly from your server, so Tailscale or your normal server connection must be available when you tap. The server must remain running to send notifications; your phone does not need to keep a connection open to receive them. Turn off the environment's notification preference to stop local alerts, even when that server is offline. Revoking the phone's pairing prevents new sends from the server.

Paired alerts work independently of T3 Connect sign-in and may appear while the app is in the foreground. Ongoing activity cards and iOS notifications still use T3 Connect.

## T3 Connect

Sign in to T3 Connect, link your environments, and enable **Device Notifications** in **Settings → Notifications**. Your environment must have agent activity publishing enabled.

Enable **Ongoing Agent Activity** on Android or **Live Activity Updates** on iOS to follow work without opening the app. Finished results remain visible for up to 15 minutes. You can dismiss an Android activity card without disabling alerts; turn off ongoing activity in Settings to stop future cards.

T3 Connect alerts stay quiet while their thread is on screen. Ongoing activity continues to update. Viewing a thread on another device does not silence your phone's alerts.

Android notifications require Android 7.0 or newer and Google Play services. Android 16 and newer can promote ongoing activity to a Live Update, subject to system settings and device support. Other devices show a regular ongoing notification. Android 7's battery-saving modes can delay removal of expired cards.

Notification permission and Android notification channels are controlled in system Settings. Background delivery requires either configured paired Android notifications or T3 Connect; pairing alone does not enable it. Force-stopping the Android app in system Settings prevents push delivery until you open it again.
