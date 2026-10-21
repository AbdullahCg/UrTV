package sa.urtv.home.tilawah;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The 21 adhan recordings, each named after the muezzin who recorded it. The file is kept in the
 * cache the first time it is needed, so an adhan still plays when the connection is down.
 */
final class Adhan {
    static final int VOICES = 21;

    private static final String[] NAMES = {
            "علي بن أحمد ملا",
            "عصام بخاري",
            "الحرم المدني",
            "المسجد الأقصى",
            "عبد الباسط عبد الصمد",
            "محمد صديق المنشاوي",
            "محمود خليل الحصري",
            "مصطفى إسماعيل",
            "محمد رمضان سعد",
            "عبد المنعم عبد المبدي",
            "مشاري راشد العفاسي",
            "محمد خليل رمل",
            "فاروق حضراوي",
            "محمد صلاح الدين كبارة",
            "نجي قزاز",
            "ناصر العبيد",
            "صالح النابت",
            "أحمد العمادي",
            "عمر الكزبري",
            "نور الدين حمزة المغربي",
            "حسن خلفان",
    };

    private static final String[] PLACES = {
            "الحرم المكي",
            "المدينة المنورة",
            "المدينة المنورة",
            "القدس",
            "مصر",
            "مصر",
            "مصر",
            "مصر",
            "مصر",
            "مصر",
            "الكويت",
            "الشام",
            "الحرم المكي",
            "مكة المكرمة",
            "مكة المكرمة",
            "السعودية",
            "السعودية",
            "قطر",
            "المغرب",
            "المغرب",
            "الإمارات",
    };

    private static final String[] URLS = {
            "https://media.assabile.com/assabile/adhan_3435370/54944191e2e2.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/7487fa449eeb.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/b30ca9a3e115.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/03fb23407291.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/1a014366658c.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/984f3e129c8c.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/cdb24a4bd658.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/dd5f42239b71.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/e9bb86af0d30.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/c3460e1ab635.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/b45e93f1efb3.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/c7ba5fb672b3.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/1aadb2df7d5c.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/6a992c01763d.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/c888cbd50d15.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/c81e4e141865.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/ac16894fd536.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/232673ccf543.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/f77bff859f61.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/768559b47c2e.mp3",
            "https://media.assabile.com/assabile/adhan_3435370/ebdaa88540dd.mp3",
    };

    private Adhan() {}

    static String url(int voice) { return URLS[clamp(voice) - 1]; }

    /** The muezzin, e.g. «فاروق حضراوي». */
    static String name(int voice) { return NAMES[clamp(voice) - 1]; }

    /** Where it was recorded, e.g. «الحرم المكي». */
    static String place(int voice) { return PLACES[clamp(voice) - 1]; }

    /** Both, for the row that opens this list: «فاروق حضراوي — الحرم المكي». */
    static String label(int voice) { return name(voice) + " — " + place(voice); }

    static File cached(Context c, int voice) {
        return new File(new File(c.getCacheDir(), "adhan"), "adhan-" + clamp(voice) + ".mp3");
    }

    private static int clamp(int voice) { return voice < 1 || voice > VOICES ? 1 : voice; }

    /**
     * Downloads every voice that is not in the cache yet, one at a time, on its own thread. The
     * chosen voice goes first; the rest follow while the screen is open. The numbered files of the
     * old source are removed once.
     */
    static void prefetchAll(final Context c) {
        final int chosen = new Prefs(c).voice();
        new Thread(() -> {
            File dir = new File(c.getCacheDir(), "adhan");
            File[] old = dir.listFiles((d, n) -> n.startsWith("azan") && n.endsWith(".mp3"));
            if (old != null) for (File f : old) f.delete();
            if (!download(c, chosen)) return;   // no network: try again next time
            for (int voice = 1; voice <= VOICES; voice++) {
                if (voice != chosen && !download(c, voice)) return;
            }
        }, "adhan-cache").start();
    }

    /** Downloads one voice; false when the network is not there. */
    static boolean download(Context c, int voice) {
        File file = cached(c, voice);
        if (file.length() > 100_000) return true;
        File dir = file.getParentFile();
        if (dir != null && !dir.exists() && !dir.mkdirs()) return false;
        File tmp = new File(dir, file.getName() + ".part");
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(url(voice)).openConnection();
            con.setConnectTimeout(8000);
            con.setReadTimeout(20000);
            con.setRequestProperty("User-Agent", "urtv-home");
            if (con.getResponseCode() != HttpURLConnection.HTTP_OK) return false;
            try (InputStream in = con.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] buffer = new byte[16 * 1024];
                int n;
                while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            }
            return tmp.renameTo(file);
        } catch (Exception e) {
            tmp.delete();
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
