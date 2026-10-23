package sa.urtv.home.tilawah;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

/**
 * Plays the adhan when its alarm goes off — pausing a surah that is playing and resuming it after —
 * and sets the next alarm again after a reboot, a clock change or an update.
 *
 * The adhan only starts while the TV is on: an alarm that arrives in standby is skipped, never
 * played late (not even after a reboot), and one that is playing stops when the screen goes off.
 */
public class AdhanReceiver extends BroadcastReceiver {
    /** the same adhan never plays twice (a clock change can set the alarm again) */
    private static final long DUPLICATE = 5 * 60_000L;

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        Prefs prefs = new Prefs(context);
        boolean alarm = AdhanScheduler.ACTION.equals(intent.getAction());

        if (!alarm) {
            // boot, clock or timezone change, or the app was just updated: only set the next alarm
            AdhanScheduler.schedule(context);
            return;
        }

        long now = System.currentTimeMillis();
        if (prefs.adhanOn() && screenOn(context) && now - prefs.lastAdhan() > DUPLICATE) {
            MusicService.adhan(context, prefs.voice(), null, 0);
        }
        AdhanScheduler.schedule(context);
    }

    /** Standby is off: the adhan is never played to a dark screen, and never made up later. */
    private static boolean screenOn(Context context) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        return pm == null || pm.isInteractive();
    }
}
