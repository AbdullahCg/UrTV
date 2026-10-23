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

    /** Off until the user turns it on; there is a switch row for it in «تلاوة». */
    boolean adhanOn() { return sp.getBoolean("adhan_on", false); }
    void setAdhanOn(boolean on) { sp.edit().putBoolean("adhan_on", on).apply(); }

    /** The adhan's own volume, in percent; the TV's volume comes back after it. */
    int adhanVolume() { int v = sp.getInt("adhan_volume", 30); return v < 10 || v > 100 ? 30 : v; }
    void setAdhanVolume(int percent) { sp.edit().putInt("adhan_volume", percent).apply(); }

    /** The voice number that stands for the person's own recording (OwnAdhan); the numbered ones are 1..21. */
    static final int OWN = 0;
    boolean ownChosen() { return sp.getBoolean("adhan_own", false); }
    void setOwnChosen(boolean on) { sp.edit().putBoolean("adhan_own", on).apply(); }
    /** What plays: OWN when the recording is chosen and still on the TV, else the numbered voice. */
    int playVoice(Context c) { return ownChosen() && OwnAdhan.exists(c) ? OWN : voice(); }

    int voice() { int v = sp.getInt("adhan_voice", 1); return v < 1 || v > Adhan.VOICES ? 1 : v; }
    void setVoice(int voice) { sp.edit().putInt("adhan_voice", voice).apply(); }

    /** The last adhan that played, so the same one never plays twice. */
    long lastAdhan() { return sp.getLong("adhan_at", 0); }
    void setLastAdhan(long at) { sp.edit().putLong("adhan_at", at).apply(); }
}
