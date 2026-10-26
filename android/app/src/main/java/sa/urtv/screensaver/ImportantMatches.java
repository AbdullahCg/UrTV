package sa.urtv.screensaver;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/** Finds El Clasico, followed teams and the final rounds of major football cups. */
final class ImportantMatches {
    private static final String API = "https://www.thesportsdb.com/api/v1/json/123/";
    private static final long REMIND_BEFORE = 30 * 60 * 1000L;
    private static final long MIN_REFRESH_GAP = 15 * 60 * 1000L;
    private static final String[] CUP_LEAGUES = {
            "4480", "4481", "5071", "4482", "4483", "4484", "4485", "4506",
            "4511", "4502", "4429", "5649", "5650", "4719"
    };
    private static final String[] FINAL_STATUSES = {"FT", "AET", "PEN", "CANC", "PST", "ABD", "AWD", "WO"};

    private ImportantMatches() { }

    static synchronized void refresh(Context context) {
        Prefs prefs = new Prefs(context);
        if (!prefs.matchAlerts()) return;
        long now = System.currentTimeMillis();
        SharedPreferences settings = context.getSharedPreferences("settings", Context.MODE_PRIVATE);
        long last = settings.getLong("matchAlertLastRefresh", 0);
        if (now - last < MIN_REFRESH_GAP) return;
        settings.edit().putLong("matchAlertLastRefresh", now).apply();
        List<JSONObject> events = new ArrayList<>();
        Set<String> successfulSources = new HashSet<>();
        Set<String> followed = new HashSet<>();
        for (String team : prefs.teams()) {
            String[] parts = team.split("\\|", 2);
            if (parts.length > 0 && parts[0].matches("\\d+")) followed.add(parts[0]);
        }

        // One next-event request per followed club/country. Failures leave existing alarms intact.
        for (String id : followed) {
            String source = "team:" + id;
            try { if (addEvents(events, "eventsnext.php?id=" + URLEncoder.encode(id, "UTF-8"), source)) successfulSources.add(source); }
            catch (Exception ignored) { }
            pause();
        }
        // The API's upcoming-list endpoint gives the approaching rounds; the stage fields identify semis/finals.
        for (String id : CUP_LEAGUES) {
            String source = "league:" + id;
            try { if (addEvents(events, "eventsnextleague.php?id=" + id, source)) successfulSources.add(source); }
            catch (Exception ignored) { }
            pause();
        }

        java.util.Map<String, String> current = new java.util.HashMap<>();
        Set<String> seen = new HashSet<>();
        for (JSONObject e : events) {
            String id = e.optString("idEvent", "");
            if (id.isEmpty() || !seen.add(id)) continue;
            if (!isImportant(e, followed)) continue;
            long kickoff = kickoff(e);
            if (kickoff <= now) continue;
            current.put(id, e.optString("_urtvSource", ""));
            schedule(context, e, kickoff, now);
        }
        removeStale(context, current, successfulSources);
    }

    private static boolean addEvents(List<JSONObject> out, String path, String source) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(API + path).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(10000);
        c.setRequestProperty("Accept", "application/json");
        try {
            if (c.getResponseCode() != 200) return false;
            StringBuilder body = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = r.readLine()) != null) body.append(line);
            }
            JSONArray a = new JSONObject(body.toString()).optJSONArray("events");
            if (a != null) for (int i = 0; i < a.length(); i++) {
                JSONObject e = a.optJSONObject(i);
                if (e != null) { e.put("_urtvSource", source); out.add(e); }
            }
            return true;
        } finally { c.disconnect(); }
    }

    private static boolean isImportant(JSONObject e, Set<String> followed) {
        if (!"Soccer".equalsIgnoreCase(e.optString("strSport", "Soccer"))) return false;
        String status = e.optString("strStatus", "").toUpperCase(Locale.ROOT);
        for (String done : FINAL_STATUSES) if (done.equals(status)) return false;
        if (!status.isEmpty() && !"NS".equals(status) && !"TBD".equals(status)
                && !"NOT STARTED".equals(status) && !"SCHEDULED".equals(status)) return false;
        String homeId = e.optString("idHomeTeam", ""), awayId = e.optString("idAwayTeam", "");
        if (followed.contains(homeId) || followed.contains(awayId)) return true;
        String home = e.optString("strHomeTeam", "").toLowerCase(Locale.ROOT);
        String away = e.optString("strAwayTeam", "").toLowerCase(Locale.ROOT);
        if ((home.contains("real madrid") && away.contains("barcelona"))
                || (home.contains("barcelona") && away.contains("real madrid"))) return true;
        String stage = (e.optString("strRound", "") + " " + e.optString("strProgress", "")
                + " " + e.optString("intRound", "")).toLowerCase(Locale.ROOT);
        int round = e.optInt("intRound", -1);
        return round == 150 || round == 170 || round == 180 || round == 200
                || stage.contains("semi-final") || stage.contains("semifinal") || stage.contains("semi final")
                || stage.matches(".*\\b(final|finals)\\b.*");
    }

    private static long kickoff(JSONObject e) {
        String s = e.optString("strTimestamp", "");
        String normalized = s.replace("Z", "");
        int dot = normalized.indexOf('.'); if (dot >= 0) normalized = normalized.substring(0, dot);
        int plus = normalized.indexOf('+', 10); if (plus >= 0) normalized = normalized.substring(0, plus);
        long parsed = parse(normalized, "yyyy-MM-dd'T'HH:mm:ss");
        if (parsed > 0) return parsed;
        parsed = parse(normalized, "dd/MM/yyyy HH:mm:ss");
        if (parsed > 0) return parsed;
        String date = e.optString("dateEvent", ""), time = e.optString("strTime", "");
        if (date.isEmpty()) return 0;
        return parse(date + "T" + (time.isEmpty() ? "00:00:00" : time), "yyyy-MM-dd'T'HH:mm:ss");
    }

    private static long parse(String value, String pattern) {
        try {
            SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
            f.setLenient(false);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            return f.parse(value).getTime();
        } catch (Exception ignored) { return 0; }
    }

    private static void schedule(Context c, JSONObject e, long kickoff, long now) {
        String id = e.optString("idEvent", "");
        long at = Math.max(now + 5000, kickoff - REMIND_BEFORE);
        Intent i = new Intent(c, MatchReminderReceiver.class)
                .putExtra("event", id)
                .putExtra("home", e.optString("strHomeTeam", ""))
                .putExtra("away", e.optString("strAwayTeam", ""))
                .putExtra("league", e.optString("strLeague", ""))
                .putExtra("kickoff", kickoff);
        PendingIntent pi = PendingIntent.getBroadcast(c, id.hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    private static void removeStale(Context c, java.util.Map<String, String> current, Set<String> successfulSources) {
        SharedPreferences sp = c.getSharedPreferences("settings", Context.MODE_PRIVATE);
        String prior = sp.getString("scheduledMatchAlerts", "[]");
        List<JSONObject> keep = new ArrayList<>();
        try {
            JSONArray old = new JSONArray(prior);
            for (int k = 0; k < old.length(); k++) {
                Object value = old.opt(k);
                String id = value instanceof JSONObject ? ((JSONObject) value).optString("id", "") : String.valueOf(value);
                String source = value instanceof JSONObject ? ((JSONObject) value).optString("source", "") : "";
                if (id.isEmpty() || current.containsKey(id)) continue;
                if (!source.isEmpty() && !successfulSources.contains(source)) keep.add(record(id, source));
                else cancel(c, id);
            }
        } catch (Exception ignored) { }
        JSONArray saved = new JSONArray();
        for (String id : current.keySet()) saved.put(record(id, current.get(id)));
        for (JSONObject old : keep) saved.put(old);
        sp.edit().putString("scheduledMatchAlerts", saved.toString()).apply();
    }

    private static JSONObject record(String id, String source) {
        JSONObject o = new JSONObject();
        try { o.put("id", id).put("source", source); } catch (Exception ignored) { }
        return o;
    }

    static void cancel(Context c, String id) {
        Intent i = new Intent(c, MatchReminderReceiver.class).putExtra("event", id);
        PendingIntent pi = PendingIntent.getBroadcast(c, id.hashCode(), i,
                PendingIntent.FLAG_NO_CREATE | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        if (pi != null) {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(pi);
            pi.cancel();
        }
    }

    static void cancelAll(Context c) {
        SharedPreferences sp = c.getSharedPreferences("settings", Context.MODE_PRIVATE);
        try {
            JSONArray a = new JSONArray(sp.getString("scheduledMatchAlerts", "[]"));
            for (int k = 0; k < a.length(); k++) {
                Object value = a.opt(k);
                String id = value instanceof JSONObject ? ((JSONObject) value).optString("id", "") : String.valueOf(value);
                if (!id.isEmpty()) cancel(c, id);
            }
        } catch (Exception ignored) { }
        sp.edit().putString("scheduledMatchAlerts", "[]").apply();
    }

    private static void pause() {
        try { Thread.sleep(2100); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
