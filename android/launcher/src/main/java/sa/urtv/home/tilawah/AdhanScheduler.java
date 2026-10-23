package sa.urtv.home.tilawah;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** One exact alarm for the next adhan, put back after a reboot, a clock change or an app update. */
final class AdhanScheduler {
    static final String ACTION = "sa.urtv.home.ADHAN";
    private static final int REQUEST = 47;

    private AdhanScheduler() {}

    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pending = pending(c);
        am.cancel(pending);
        if (!new Prefs(c).adhanOn()) return;
        PrayerTimes.Next next = PrayerTimes.next(c);
        if (next == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.at, pending);
            } else if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.at, pending);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, next.at, pending);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.at, pending);
        }
    }

    private static PendingIntent pending(Context c) {
        Intent intent = new Intent(c, AdhanReceiver.class).setAction(ACTION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(c, REQUEST, intent, flags);
    }

    /** When the next adhan will play, 0 when it is off; printed by optimize/music.sh adhan. */
    static long scheduledAt(Context c) {
        if (!new Prefs(c).adhanOn()) return 0;
        PrayerTimes.Next next = PrayerTimes.next(c);
        return next == null ? 0 : next.at;
    }
}
