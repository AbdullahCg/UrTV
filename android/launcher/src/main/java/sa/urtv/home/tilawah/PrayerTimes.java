package sa.urtv.home.tilawah;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Prayer times for the TV: Umm al-Qura, the same numbers the screensaver's page computes and the
 * ones Aladhan calls method 4. Everything is computed on the TV with no network; once a day the
 * times are quietly replaced by Aladhan's, and Isha stays 90 minutes after Maghrib (120 in Ramadan)
 * like the Umm al-Qura calendar.
 */
final class PrayerTimes {
    static final int FAJR = 0, SUNRISE = 1, DHUHR = 2, ASR = 3, MAGHRIB = 4, ISHA = 5;
    /** the five the TV shows and plays the adhan for — sunrise is not a prayer */
    static final int[] PRAYERS = {FAJR, DHUHR, ASR, MAGHRIB, ISHA};
    static final String[] NAMES = {"الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء"};
    private static final String[] KEYS = {"Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"};

    private static final double RAD = Math.PI / 180;

    final long[] at = new long[6];
    final String[] clock = new String[6];
    /** local midnight of the day these times belong to */
    private long day0;

    static final class Next {
        final int index;
        final long at;
        final String clock;
        Next(int index, long at, String clock) { this.index = index; this.at = at; this.clock = clock; }
        String name() { return NAMES[index]; }
    }

    // ---------------------------------------------------------------- the times

    static PrayerTimes of(Calendar when, Place place) {
        TimeZone tz = TimeZone.getTimeZone(place.tz);
        Calendar local = Calendar.getInstance(tz, Locale.US);
        local.setTimeInMillis(when.getTimeInMillis());
        int y = local.get(Calendar.YEAR), mo = local.get(Calendar.MONTH) + 1, d = local.get(Calendar.DAY_OF_MONTH);

        Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US);
        utc.clear();
        utc.set(y, mo - 1, d, 0, 0, 0);
        double jd0 = utc.getTimeInMillis() / 86400000.0 + 2440587.5 - place.lng / 360.0;
        double tzHours = tz.getOffset(local.getTimeInMillis()) / 3600000.0;
        double lat = place.lat;

        double fajr = adj(angleTime(jd0, lat, 18.5, 5, true), tzHours, place.lng);
        double sunrise = adj(angleTime(jd0, lat, .833, 6, true), tzHours, place.lng);
        double dhuhr = adj(noon(jd0, 12), tzHours, place.lng);
        double asr = adj(asrTime(jd0, lat, 13), tzHours, place.lng);
        double maghrib = adj(angleTime(jd0, lat, .833, 18, false), tzHours, place.lng);

        Calendar midnight = Calendar.getInstance(tz, Locale.US);
        midnight.clear();
        midnight.set(y, mo - 1, d, 0, 0, 0);
        long day0 = midnight.getTimeInMillis();
        double isha = maghrib + (hijriMonth(day0) == 9 ? 120 : 90) / 60.0;

        PrayerTimes t = new PrayerTimes();
        t.day0 = day0;
        t.set(FAJR, fajr);
        t.set(SUNRISE, sunrise);
        t.set(DHUHR, dhuhr);
        t.set(ASR, asr);
        t.set(MAGHRIB, maghrib);
        t.set(ISHA, isha);
        return t;
    }

    /** Today's times: the ones fetched from Aladhan when they are in, the computed ones otherwise. */
    static PrayerTimes today(Context c) {
        Place place = Place.get(c);
        Calendar day = Calendar.getInstance(TimeZone.getTimeZone(place.tz), Locale.US);
        PrayerTimes t = of(day, place);
        String saved = prefs(c).getString(key(day), null);
        if (saved != null) t.apply(saved);
        return t;
    }

    /** The next of the five prayers, looking at tomorrow when today's Isha has passed. */
    static Next next(Context c) {
        long now = System.currentTimeMillis();
        Place place = Place.get(c);
        Calendar day = Calendar.getInstance(TimeZone.getTimeZone(place.tz), Locale.US);
        for (int d = 0; d < 3; d++) {
            PrayerTimes t = d == 0 ? today(c) : of(day, place);
            for (int i : PRAYERS) {
                if (t.at[i] > now + 30_000) return new Next(i, t.at[i], t.clock[i]);
            }
            day.add(Calendar.DAY_OF_MONTH, 1);
        }
        return null;
    }

    /** The prayer that most recently passed (yesterday included), for the catch-up after a reboot. */
    static Next last(Context c) {
        long now = System.currentTimeMillis();
        Place place = Place.get(c);
        Calendar day = Calendar.getInstance(TimeZone.getTimeZone(place.tz), Locale.US);
        for (int d = 0; d < 2; d++) {
            PrayerTimes t = d == 0 ? today(c) : of(day, place);
            for (int i = PRAYERS.length - 1; i >= 0; i--) {
                int p = PRAYERS[i];
                if (t.at[p] <= now) return new Next(p, t.at[p], t.clock[p]);
            }
            day.add(Calendar.DAY_OF_MONTH, -1);
        }
        return null;
    }

    /** "بعد ساعتين و١٥ دقيقة" — the time left, in the project's Arabic. */
    static String remaining(long millis) {
        long minutes = Math.max(0, (millis + 30_000) / 60_000);
        long h = minutes / 60, m = minutes % 60;
        String out = null;
        if (h > 0) out = hours((int) h);
        if (m > 0) out = out == null ? minutes((int) m) : out + " و" + minutes((int) m);
        return out == null ? "الآن" : "بعد " + out;
    }

    private static String hours(int n) {
        if (n == 1) return "ساعة";
        if (n == 2) return "ساعتين";
        return Ui.arabic(n) + (n >= 3 && n <= 10 ? " ساعات" : " ساعة");
    }

    private static String minutes(int n) {
        if (n == 1) return "دقيقة";
        if (n == 2) return "دقيقتين";
        return Ui.arabic(n) + (n >= 3 && n <= 10 ? " دقائق" : " دقيقة");
    }

    /** ٠٥:١٢ → "٥:١٢ ص", ١٨:٤٠ → "٦:٤٠ م" */
    static String clock12(String hhmm) {
        int colon = hhmm.indexOf(':');
        int h = Integer.parseInt(hhmm.substring(0, colon));
        String m = hhmm.substring(colon + 1);
        String suffix = h < 12 ? "ص" : "م";
        int h12 = h % 12 == 0 ? 12 : h % 12;
        return Ui.digits(h12 + ":" + m) + " " + suffix;
    }

    // ---------------------------------------------------------------- Aladhan

    /**
     * Replaces today's computed times with Aladhan's (method 4) once they arrive. Runs off the main
     * thread; `done` runs on the caller's thread when something changed.
     */
    static void refresh(final Context c, final Runnable done) {
        final Place place = Place.get(c);
        final Calendar day = Calendar.getInstance(TimeZone.getTimeZone(place.tz), Locale.US);
        final String key = key(day);
        if (prefs(c).getBoolean("fetched_" + key, false)) return;
        new Thread(() -> {
            try {
                String date = new SimpleDateFormat("dd-MM-yyyy", Locale.US).format(day.getTime());
                String url = "https://api.aladhan.com/v1/timings/" + date
                        + "?latitude=" + place.lat + "&longitude=" + place.lng
                        + "&method=4&timezonestring=" + URLEncoder.encode(place.tz, "UTF-8");
                HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
                con.setConnectTimeout(6000);
                con.setReadTimeout(8000);
                con.setRequestProperty("User-Agent", "urtv-home");
                StringBuilder body = new StringBuilder();
                try (BufferedReader in = new BufferedReader(
                        new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = in.readLine()) != null) body.append(line);
                } finally {
                    con.disconnect();
                }
                JSONObject timings = new JSONObject(body.toString()).getJSONObject("data").getJSONObject("timings");
                StringBuilder out = new StringBuilder();
                for (int i = 0; i <= MAGHRIB; i++) {   // Isha stays ours: 90/120 minutes after Maghrib
                    String v = timings.optString(KEYS[i]);
                    if (!v.matches("\\d{1,2}:\\d{2}.*")) throw new IllegalStateException("no " + KEYS[i]);
                    if (out.length() > 0) out.append(',');
                    out.append(v.substring(0, 5));
                }
                prefs(c).edit().putString(key, out.toString()).putBoolean("fetched_" + key, true).apply();
                if (done != null) new android.os.Handler(android.os.Looper.getMainLooper()).post(done);
            } catch (Exception ignored) {
                // offline or Aladhan is down: the computed times are already right
            }
        }, "adhan-times").start();
    }

    private void apply(String saved) {
        String[] values = saved.split(",");
        if (values.length < MAGHRIB + 1) return;
        for (int i = 0; i <= MAGHRIB; i++) {
            String[] hm = values[i].split(":");
            int minutes = Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]);
            set(i, minutes / 60.0);
        }
        set(ISHA, minutesOf(MAGHRIB) / 60.0 + (hijriMonth(day0) == 9 ? 120 : 90) / 60.0);
    }

    private int minutesOf(int i) {
        return (int) ((at[i] - day0) / 60_000L);
    }

    // ---------------------------------------------------------------- the sun

    private void set(int i, double hours) {
        int minutes = (int) Math.round(fix(hours, 24) * 60) % 1440;
        at[i] = day0 + minutes * 60_000L;
        clock[i] = String.format(Locale.US, "%02d:%02d", minutes / 60, minutes % 60);
    }

    private static double adj(double h, double tzHours, double lng) { return h + tzHours - lng / 15.0; }

    private static double noon(double jd0, double t) { return fix(12 - sun(jd0, t / 24)[1], 24); }

    private static double angleTime(double jd0, double lat, double angle, double t, boolean before) {
        double decl = sun(jd0, t / 24)[0];
        double n = noon(jd0, t);
        double cosT = (-Math.sin(angle * RAD) - Math.sin(decl * RAD) * Math.sin(lat * RAD))
                / (Math.cos(decl * RAD) * Math.cos(lat * RAD));
        double T = Math.acos(Math.max(-1, Math.min(1, cosT))) / RAD / 15;
        return n + (before ? -T : T);
    }

    private static double asrTime(double jd0, double lat, double t) {
        double decl = sun(jd0, t / 24)[0];
        double a = -Math.atan(1 / (1 + Math.tan(Math.abs(lat - decl) * RAD))) / RAD;
        return angleTime(jd0, lat, a, t, false);
    }

    /** declination and equation of time */
    private static double[] sun(double jd0, double t) {
        double D = jd0 + t - 2451545;
        double g = fix(357.529 + .98560028 * D, 360);
        double q = fix(280.459 + .98564736 * D, 360);
        double L = fix(q + 1.915 * Math.sin(g * RAD) + .020 * Math.sin(2 * g * RAD), 360);
        double e = 23.439 - .00000036 * D;
        double ra = fix(Math.atan2(Math.cos(e * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)) / RAD / 15, 24);
        double decl = Math.asin(Math.sin(e * RAD) * Math.sin(L * RAD)) / RAD;
        return new double[]{decl, q / 15 - ra};
    }

    private static double fix(double a, double b) {
        a = a - b * Math.floor(a / b);
        return a < 0 ? a + b : a;
    }

    // ---------------------------------------------------------------- the Islamic month

    /** 9 in Ramadan, from the Umm al-Qura calendar the whole project uses. */
    private static int hijriMonth(long millis) {
        try {
            android.icu.util.Calendar cal = android.icu.util.Calendar.getInstance(
                    new android.icu.util.ULocale("en-u-ca-islamic-umalqura"));
            cal.setTimeInMillis(millis);
            return cal.get(android.icu.util.Calendar.MONTH) + 1;
        } catch (Throwable t) {
            return 0;
        }
    }

    // ---------------------------------------------------------------- prefs

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("tilawah", Context.MODE_PRIVATE);
    }

    private static String key(Calendar day) {
        return "times_" + new SimpleDateFormat("yyyyMMdd", Locale.US).format(day.getTime());
    }
}
