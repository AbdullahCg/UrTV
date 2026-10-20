package sa.urtv.listening;

import android.content.Context;
import android.content.SharedPreferences;

/** The last thing played, so «متابعة» works after a reboot too. */
final class Prefs {
    static final int SOURCE_NONE = 0, SOURCE_SURAH = 1, SOURCE_RADIO = 2;

    private final SharedPreferences sp;

    Prefs(Context c) { sp = c.getSharedPreferences("listening", Context.MODE_PRIVATE); }

    int source() { return sp.getInt("source", SOURCE_NONE); }
    String reciter() { return sp.getString("reciter", ""); }
    int surah() { return sp.getInt("surah", 1); }
    int station() { return sp.getInt("station", 0); }
    int position() { return sp.getInt("position", 0); }

    void save(int source, String reciter, int surah, int station, int position) {
        sp.edit().putInt("source", source).putString("reciter", reciter).putInt("surah", surah)
                .putInt("station", station).putInt("position", position).apply();
    }
}
