package sa.urtv.home;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import sa.urtv.home.tilawah.DayParts;

/**
 * The greeting above the home screen's clock («صباح الخير» from Fajr to Dhuhr, «طاب يومك» to Asr, «مساء الخير» to Isha,
 * «تصبح على خير» after) and under it the weather of the screensaver's city and the next sunrise or sunset.
 *
 * Settings come from the screensaver's ConfigProvider (city, digits and «التحية والطقس»). The weather is asked of
 * Open-Meteo at most once every 30 minutes (one request: the current temperature and weather code), and only while the greeting is on; the last answer is kept, so a TV that
 * is offline shows the greeting alone. With the setting off the line is the plain good-morning it always was.
 */
final class Greeting {
    private static final Uri CONFIG = Uri.parse("content://sa.urtv.screensaver.config");
    static final long REFRESH_MS = 30 * 60 * 1000L;
    /** an answer older than this is not shown: «٣١°» from yesterday is worse than nothing */
    private static final long STALE_MS = 3 * 60 * 60 * 1000L;

    private final Context context;
    private final TextView greeting, weather;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean fetching;

    Greeting(Context context, TextView greeting, TextView weather) {
        this.context = context;
        this.greeting = greeting;
        this.weather = weather;
    }

    /** Called with the clock (every minute, and on resume). hour: the TV's hour, for the plain greeting. */
    void update(int hour) {
        Config s = Config.read(context);
        if (!s.on) {
            greeting.setText(hour < 4 ? "تصبح على خير" : hour < 12 ? "صباح الخير" : "مساء الخير");
            weather.setVisibility(android.view.View.GONE);
            return;
        }
        DayParts d = null;
        try { d = DayParts.now(context); } catch (RuntimeException ignored) { }
        greeting.setText(d == null ? (hour < 4 ? "تصبح على خير" : hour < 12 ? "صباح الخير" : "مساء الخير")
                : GreetingText.greeting(GreetingText.part(System.currentTimeMillis(), d.fajr, d.dhuhr, d.asr, d.isha)));

        SharedPreferences sp = prefs();
        long at = sp.getLong("at", 0);
        boolean sameCity = s.lat.equals(sp.getString("lat", "")) && s.lon.equals(sp.getString("lon", ""));
        if (sameCity && sp.contains("code") && System.currentTimeMillis() - at < STALE_MS && d != null) {
            String line = GreetingText.weather(sp.getInt("code", -1), s.city, sp.getFloat("temp", 0), s.latin)
                    + "\n" + GreetingText.sun(d.sunLabel, d.sunClock, s.latin);
            weather.setText(line);
            weather.setVisibility(android.view.View.VISIBLE);
        } else {
            weather.setVisibility(android.view.View.GONE);   // offline, or not asked yet: the greeting alone
        }
        // once every 30 minutes; a new city is asked at once, but only once (a failed answer is not asked again at once)
        boolean triedHere = s.lat.equals(sp.getString("triedLat", "")) && s.lon.equals(sp.getString("triedLon", ""));
        if (!fetching && (!triedHere || System.currentTimeMillis() - sp.getLong("tried", 0) >= REFRESH_MS)) fetch(s);
    }

    private void fetch(final Config s) {
        fetching = true;
        // counted when asked, not when answered: a TV with no network does not ask again before 30 minutes
        prefs().edit().putLong("tried", System.currentTimeMillis()).putString("triedLat", s.lat).putString("triedLon", s.lon).apply();
        new Thread(() -> {
            try {
                String url = "https://api.open-meteo.com/v1/forecast?latitude=" + s.lat + "&longitude=" + s.lon
                        + "&timezone=" + URLEncoder.encode(s.tz, "UTF-8") + "&current=temperature_2m,weather_code";
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
                JSONObject cur = new JSONObject(body.toString()).getJSONObject("current");
                prefs().edit().putLong("at", System.currentTimeMillis())
                        .putString("lat", s.lat).putString("lon", s.lon)
                        .putFloat("temp", (float) cur.getDouble("temperature_2m"))
                        .putInt("code", cur.getInt("weather_code")).apply();
                main.post(() -> { fetching = false; update(java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)); });
            } catch (Exception e) {
                main.post(() -> fetching = false);   // offline or Open-Meteo is down: the last answer, if fresh, stays
            }
        }, "greeting-weather").start();
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences("greeting", Context.MODE_PRIVATE);
    }

    /** The screensaver's settings this line needs. */
    private static final class Config {
        boolean on = true;   // an older screensaver does not say: on, the default
        String city = "الرياض", lat = "24.6877", lon = "46.7219", tz = "Asia/Riyadh";
        boolean latin;

        static Config read(Context c) {
            Config s = new Config();
            try (Cursor cur = c.getContentResolver().query(CONFIG, null, null, null, null)) {
                if (cur == null || !cur.moveToFirst()) return s;
                int g = cur.getColumnIndex("greeting");
                if (g >= 0 && "0".equals(cur.getString(g))) s.on = false;
                String frag = cur.getString(0);
                if (frag == null) return s;
                for (String part : frag.split("&")) {
                    int eq = part.indexOf('=');
                    if (eq < 0) continue;
                    String key = part.substring(0, eq), value = URLDecoder.decode(part.substring(eq + 1), "UTF-8");
                    switch (key) {
                        case "city": if (!value.trim().isEmpty()) s.city = value.trim(); break;
                        case "lat": if (value.matches("-?\\d+(\\.\\d+)?")) s.lat = value; break;
                        case "lon": if (value.matches("-?\\d+(\\.\\d+)?")) s.lon = value; break;
                        case "tz": if (!value.trim().isEmpty()) s.tz = value.trim(); break;
                        case "digits": s.latin = "latin".equals(value.toLowerCase(Locale.ROOT)); break;
                        default: break;
                    }
                }
            } catch (Exception e) {
                // the screensaver is missing or signed with another key: the defaults (Riyadh, on)
            }
            return s;
        }
    }
}
