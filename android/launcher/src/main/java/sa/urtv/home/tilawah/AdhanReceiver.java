package sa.urtv.home.tilawah;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Plays the adhan when its alarm goes off — pausing a surah that is playing and resuming it after —
 * and sets the next alarm again after a reboot, a clock change or an update.
 */
public class AdhanReceiver extends BroadcastReceiver {
    /** a prayer that passed while the TV was off still plays if it was this recent */
    private static final long CATCH_UP = 20 * 60_000L;
    /** the same adhan never plays twice (the alarm and the catch-up can meet) */
    private static final long DUPLICATE = 5 * 60_000L;

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        Prefs prefs = new Prefs(context);
        boolean alarm = AdhanScheduler.ACTION.equals(intent.getAction());

        if (!alarm) {
            // boot, clock or timezone change, or the app was just updated
            AdhanScheduler.schedule(context);
            if (prefs.adhanOn()) catchUp(context, prefs);
            return;
        }

        long now = System.currentTimeMillis();
        if (prefs.adhanOn() && now - prefs.lastAdhan() > DUPLICATE) {
            MusicService.adhan(context, prefs.voice(), null, 0);
        }
        AdhanScheduler.schedule(context);
    }

    private void catchUp(Context context, Prefs prefs) {
        PrayerTimes.Next last = PrayerTimes.last(context);
        if (last == null) return;
        long now = System.currentTimeMillis();
        if (now - last.at > CATCH_UP) return;
        if (now - prefs.lastAdhan() < CATCH_UP) return;
        MusicService.adhan(context, prefs.voice(), null, 0);
    }
}
