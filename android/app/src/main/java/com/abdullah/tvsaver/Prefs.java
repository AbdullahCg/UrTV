package com.abdullah.tvsaver;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Everything the user picks in settings, and the dashboard URL built from it. */
final class Prefs {
    static final String TZ = "Asia/Riyadh";

    // name, latitude, longitude
    static final String[][] CITIES = {
        {"الرياض", "24.7136", "46.6753"}, {"جدة", "21.5433", "39.1728"},
        {"مكة المكرمة", "21.3891", "39.8579"}, {"المدينة المنورة", "24.5247", "39.5692"},
        {"الدمام", "26.4207", "50.0888"}, {"الخبر", "26.2172", "50.1971"},
        {"الظهران", "26.2361", "50.0393"}, {"الأحساء", "25.3833", "49.5833"},
        {"الجبيل", "27.0046", "49.6460"}, {"الطائف", "21.2703", "40.4158"},
        {"تبوك", "28.3835", "36.5662"}, {"بريدة", "26.3260", "43.9750"},
        {"عنيزة", "26.0840", "43.9930"}, {"حائل", "27.5114", "41.7208"},
        {"أبها", "18.2164", "42.5053"}, {"خميس مشيط", "18.3000", "42.7333"},
        {"جازان", "16.8892", "42.5511"}, {"نجران", "17.5656", "44.2289"},
        {"ينبع", "24.0890", "38.0637"}, {"الباحة", "20.0129", "41.4677"},
        {"عرعر", "30.9753", "41.0381"}, {"سكاكا", "29.9697", "40.2064"},
        {"العلا", "26.6085", "37.9232"},
    };

    // TheSportsDB id, Arabic name; more teams come from the in-app search
    static final String[][] TEAM_PRESETS = {
        {"136013", "الهلال"}, {"136137", "المنتخب السعودي"},
    };

    // TVMaze genre (sent to the page), Arabic label
    static final String[][] GENRES = {
        {"Drama", "دراما"}, {"Comedy", "كوميديا"}, {"Action", "أكشن"}, {"Crime", "جريمة"},
        {"Thriller", "إثارة"}, {"Mystery", "غموض"}, {"Science-Fiction", "خيال علمي"},
        {"Fantasy", "فانتازيا"}, {"Adventure", "مغامرة"}, {"Romance", "رومانسي"},
        {"Family", "عائلي"}, {"History", "تاريخي"}, {"Horror", "رعب"},
        {"Anime", "أنمي"}, {"Documentary", "وثائقي"}, {"Sports", "رياضة"},
    };

    // TVMaze language, Arabic label
    static final String[][] LANGS = {
        {"English", "الإنجليزية"}, {"Arabic", "العربية"}, {"Korean", "الكورية"},
        {"Japanese", "اليابانية"}, {"Turkish", "التركية"}, {"Spanish", "الإسبانية"},
        {"French", "الفرنسية"}, {"Hindi", "الهندية"}, {"German", "الألمانية"},
    };

    static final String[] MIN_RATINGS = {"0", "6", "6.5", "7", "7.5", "8"};

    private final SharedPreferences sp;

    Prefs(Context c) { sp = c.getSharedPreferences("settings", Context.MODE_PRIVATE); }

    int city() { return Math.max(0, Math.min(CITIES.length - 1, sp.getInt("city", 0))); }
    void setCity(int i) { sp.edit().putInt("city", i).apply(); }

    /** slot 1 or 2; returns {id, name}, id "" when the slot is off */
    String[] team(int slot) {
        String[] def = TEAM_PRESETS[slot - 1];
        return new String[] {sp.getString("team" + slot + "Id", def[0]), sp.getString("team" + slot + "Name", def[1])};
    }
    void setTeam(int slot, String id, String name) {
        sp.edit().putString("team" + slot + "Id", id).putString("team" + slot + "Name", name).apply();
    }

    List<String> list(String key) {
        List<String> out = new ArrayList<>();
        for (String s : sp.getString(key, "").split(";")) if (!s.isEmpty()) out.add(s);
        return out;
    }
    void setList(String key, List<String> v) { sp.edit().putString(key, join(v, ";")).apply(); }

    /** shows picked one by one, stored as "id|name" */
    List<String> shows() { return list("shows"); }

    String minRating() { return sp.getString("minRating", "7"); }
    void setMinRating(String v) { sp.edit().putString("minRating", v).apply(); }

    boolean autoUpdate() { return sp.getBoolean("autoUpdate", true); }
    void setAutoUpdate(boolean v) { sp.edit().putBoolean("autoUpdate", v).apply(); }

    SharedPreferences raw() { return sp; }

    /** The page reads its settings from the fragment; a ?query fails on file:// in WebView. */
    String dashboardUrl(Context c) {
        String[] city = CITIES[city()];
        List<String> ids = new ArrayList<>();
        for (String s : shows()) ids.add(s.split("\\|", 2)[0]);
        String frag = "city=" + Uri.encode(city[0]) + "&lat=" + city[1] + "&lon=" + city[2]
            + "&tz=" + Uri.encode(TZ)
            + "&team1=" + team(1)[0] + "&team2=" + team(2)[0]
            + "&genres=" + Uri.encode(join(list("genres"), ","))
            + "&langs=" + Uri.encode(join(list("langs"), ","))
            + "&shows=" + join(ids, ",")
            + "&minrating=" + minRating();
        File remote = Updater.pageFile(c);
        String base = autoUpdate() && remote.isFile()
            ? Uri.fromFile(remote).toString()
            : "file:///android_asset/ksa-dashboard.html";
        return base + "#" + frag;
    }

    static String join(List<String> v, String sep) {
        StringBuilder b = new StringBuilder();
        for (String s : v) { if (b.length() > 0) b.append(sep); b.append(s); }
        return b.toString();
    }
}
