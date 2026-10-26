package sa.urtv.screensaver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/** Posts the local TV notification when an important fixture is approaching. */
public final class MatchReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "important_matches";

    @Override public void onReceive(Context c, Intent i) {
        if (!new Prefs(c).matchAlerts()) return;
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;
        String home = i.getStringExtra("home"), away = i.getStringExtra("away");
        if (home == null || away == null) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Important match reminders",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("El Clásico, followed teams, and semifinal or final matches");
            nm.createNotificationChannel(channel);
        }
        Intent open = new Intent(c, SettingsActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent content = PendingIntent.getActivity(c, 41, open,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        String title = home + "  —  " + away;
        long minutes = Math.max(1, (i.getLongExtra("kickoff", System.currentTimeMillis()) - System.currentTimeMillis() + 59999) / 60000);
        String body = DigitsText.convert("تبدأ المباراة خلال " + minutes + " دقيقة", DigitsText.isLatin(new Prefs(c).digits()));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        Notification n = b.setSmallIcon(R.drawable.ic_trophy)
                .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory(Notification.CATEGORY_EVENT).setPriority(Notification.PRIORITY_HIGH)
                .setAutoCancel(true).setContentIntent(content).build();
        String event = i.getStringExtra("event");
        nm.notify((event == null ? "match" : event).hashCode(), n);
    }
}
