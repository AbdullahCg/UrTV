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

    // TheSportsDB id, Arabic name; more teams come from the in-app search
    static final String[][] TEAM_PRESETS = {
        {"136013", "الهلال"}, {"136137", "المنتخب السعودي"},
    };

    // TheSportsDB league id ("" = look up by name), league name as TheSportsDB spells it, Arabic label
    static final String[][] LEAGUES = {
        {"4668", "Saudi Pro League", "دوري روشن السعودي"},
        {"", "Saudi First Division League", "دوري يلو (الدرجة الأولى)"},
        {"4328", "English Premier League", "الدوري الإنجليزي"},
        {"4335", "Spanish La Liga", "الدوري الإسباني"},
        {"4332", "Italian Serie A", "الدوري الإيطالي"},
        {"4331", "German Bundesliga", "الدوري الألماني"},
        {"4334", "French Ligue 1", "الدوري الفرنسي"},
        {"", "Portuguese Primeira Liga", "الدوري البرتغالي"},
        {"", "Dutch Eredivisie", "الدوري الهولندي"},
        {"", "Turkish Super Lig", "الدوري التركي"},
        {"", "Egyptian Premier League", "الدوري المصري"},
        {"", "UAE Pro League", "الدوري الإماراتي"},
        {"", "Qatar Stars League", "الدوري القطري"},
        {"", "American Major League Soccer", "الدوري الأمريكي"},
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

    /** {name, latitude, longitude}; Riyadh until the user picks */
    String[] city() {
        return new String[] {sp.getString("cityName", "الرياض"), sp.getString("cityLat", "24.6877"), sp.getString("cityLon", "46.7219")};
    }
    void setCity(String name, String lat, String lon) {
        sp.edit().putString("cityName", name).putString("cityLat", lat).putString("cityLon", lon).apply();
    }

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
        String[] city = city();
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
