package sa.urtv.home;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;

import sa.urtv.home.tilawah.DayParts;

/**
 * The slim bar at the top of the home screen before the adhan: «الأذان بعد ٨ دقائق» in the last 10 minutes before each
 * prayer, «الإقامة بعد ١٢ دقيقة» from the adhan to the iqama. The times are the adhan's own (DayParts), the words
 * AdhanBarText's; «تنبيه قبل الأذان» in the screensaver's settings turns it off (its ConfigProvider, same signing key).
 */
final class AdhanBar {
    private static final Uri CONFIG = Uri.parse("content://sa.urtv.screensaver.config");

    private AdhanBar() { }

    /** What the bar says now, or null: it is off, nothing is near, or the times are out of reach. */
    static String text(Context c) {
        boolean on = true, latin = false;   // an older screensaver does not say: on, the default
        try (Cursor cur = c.getContentResolver().query(CONFIG, null, null, null, null)) {
            if (cur != null && cur.moveToFirst()) {
                int i = cur.getColumnIndex("adhan_bar");
                if (i >= 0 && "0".equals(cur.getString(i))) on = false;
                String frag = cur.getString(0);
                latin = frag != null && (frag.contains("&digits=latin") || frag.startsWith("digits=latin"));
            }
        } catch (RuntimeException ignored) {
            // the screensaver is missing or signed with another key: the defaults
        }
        if (!on) return null;
        try {
            DayParts d = DayParts.now(c);
            return AdhanBarText.text(System.currentTimeMillis(), new long[]{d.fajr, d.dhuhr, d.asr, d.maghrib, d.isha}, d.friday, latin);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
