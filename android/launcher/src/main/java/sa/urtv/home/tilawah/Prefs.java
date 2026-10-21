package sa.urtv.home.tilawah;

import android.content.Context;
import android.content.SharedPreferences;

/** The last thing played, so «متابعة» works after a reboot too, and the adhan settings. */
final class Prefs {
    static final int SOURCE_NONE = 0, SOURCE_SURAH = 1, SOURCE_RADIO = 2, SOURCE_ADHAN = 3;

    private final SharedPreferences sp;

    Prefs(Context c) {
        sp = c.getApplicationContext().getSharedPreferences("tilawah", Context.MODE_PRIVATE);
    }

    int source() { return sp.getInt("source", SOURCE_NONE); }
    String reciter() { return sp.getString("reciter", ""); }
    int surah() { return sp.getInt("surah", 1); }
    int station() { return sp.getInt("station", 0); }
    int position() { return sp.getInt("position", 0); }

    void save(int source, String reciter, int surah, int station, int position) {
        sp.edit().putInt("source", source).putString("reciter", reciter).putInt("surah", surah)
                .putInt("station", station).putInt("position", position).apply();
    }

    // ---- the adhan ----

    /** On until the user turns it off; there is a switch row for it in «تلاوة». */
    boolean adhanOn() { return sp.getBoolean("adhan_on", true); }
    void setAdhanOn(boolean on) { sp.edit().putBoolean("adhan_on", on).apply(); }

    int voice() { int v = sp.getInt("adhan_voice", 1); return v < 1 || v > Adhan.VOICES ? 1 : v; }
    void setVoice(int voice) { sp.edit().putInt("adhan_voice", voice).apply(); }

    /** The last adhan that played, so an alarm and a catch-up never play it twice. */
    long lastAdhan() { return sp.getLong("adhan_at", 0); }
    void setLastAdhan(long at) { sp.edit().putLong("adhan_at", at).apply(); }
}
