package sa.urtv.screensaver;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

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

    // League name exactly as TheSportsDB spells it (checked from CI by .github/tools/team_ids.py), Arabic label.
    // Their clubs come from assets/shared/teams.json (Teams), which CI builds from these leagues' matches
    // (.github/tools/team_ids.py reads this list); a new league here needs its minimum club count there.
    static final String[][] LEAGUES = {
        {"Saudi-Arabian Pro League", "دوري روشن السعودي"},
        {"Saudi First Division League", "دوري يلو (الدرجة الأولى)"},
        {"English Premier League", "الدوري الإنجليزي"},
        {"Spanish La Liga", "الدوري الإسباني"},
        {"Italian Serie A", "الدوري الإيطالي"},
        {"German Bundesliga", "الدوري الألماني"},
        {"French Ligue 1", "الدوري الفرنسي"},
        {"Portuguese Primeira Liga", "الدوري البرتغالي"},
        {"Dutch Eredivisie", "الدوري الهولندي"},
        {"Turkish Super Lig", "الدوري التركي"},
        {"Egyptian Premier League", "الدوري المصري"},
        {"UAE Pro League", "الدوري الإماراتي"},
        {"Qatar Stars League", "الدوري القطري"},
        {"American Major League Soccer", "الدوري الأمريكي"},
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

    // minutes between background photos (sent to the page as #photos=; 30 is what it always did)
    static final String[] PHOTO_MINUTES = {"5", "10", "15", "30", "60"};

    // digits on the screen (sent to the page as #digits=; hindi is what it always showed)
    static final String[][] DIGITS = {{"hindi", "هندية ١٢٣"}, {"latin", "عربية 123"}};

    // look of the card beside the clock (sent to the page as #cardstyle=; current is the plain card it always had)
    static final String[][] CARD_STYLES = {{"current", "الحالية"}, {"dark1", "داكنة"}, {"glass1", "زجاجية"},
        {"dark3", "داكنة بإطار"}, {"glass3", "زجاجية بإطار"}};

    // markets at the top left (sent to the page as #markets=, up to MAX_MARKETS, in this order of choice; tasi,spx,btc is what it always showed)
    static final String[][] MARKETS = {
        {"tasi", "تاسي"}, {"aramco", "أرامكو"}, {"spx", "S&P 500"}, {"btc", "بيتكوين"},
        {"gold", "الذهب (الجرام بالريال)"}, {"silver", "الفضة (الجرام بالريال)"}, {"xrp", "ريبل"},
    };
    static final int MAX_MARKETS = 4;
    static final String DEFAULT_MARKETS = "tasi,spx,btc";

    // how the markets are shown (#mkstyle=; arrows is what it always showed)
    static final String[][] MK_STYLES = {{"arrows", "الاتجاه فقط ▲▼"}, {"prices", "السعر والنسبة"}};

    // minutes of idle before Android starts the screensaver (the TV's own screen_off_timeout; not stored here)
    static final String[] IDLE_MINUTES = {"1", "2", "5", "10", "15", "30"};

    /** May this app change system settings (API 23+, and only if the owner allowed it for the app)? */
    static boolean canWriteSettings(Context c) {
        return Build.VERSION.SDK_INT >= 23 && Settings.System.canWrite(c);
    }

    /** The TV's idle delay in ms; readable without any permission. -1 when the TV does not say. */
    static long idleMs(Context c) {
        return Settings.System.getLong(c.getContentResolver(), Settings.System.SCREEN_OFF_TIMEOUT, -1);
    }

    private final SharedPreferences sp;

    Prefs(Context c) { sp = c.getSharedPreferences("settings", Context.MODE_PRIVATE); }

    /** {name, latitude, longitude}; Riyadh until the user picks */
    String[] city() {
        return new String[] {sp.getString("cityName", "الرياض"), sp.getString("cityLat", "24.6877"), sp.getString("cityLon", "46.7219")};
    }
    void setCity(String name, String lat, String lon) {
        sp.edit().putString("cityName", name).putString("cityLat", lat).putString("cityLon", lon).apply();
    }

    static final int MAX_TEAMS = 10;

    /** Followed teams in priority order, "id|name". Migrates the old two team fields once. */
    List<String> teams() {
        if (!sp.contains("teams")) {
            List<String> v = new ArrayList<>();
            for (int slot = 1; slot <= 2; slot++) {
                String[] def = TEAM_PRESETS[slot - 1];
                String id = sp.getString("team" + slot + "Id", def[0]);
                if (!id.isEmpty()) v.add(id + "|" + sp.getString("team" + slot + "Name", def[1]));
            }
            return v;
        }
        return list("teams");
    }

    /** false when already followed or the list is full */
    boolean addTeam(String id, String name) {
        List<String> v = teams();
        for (String t : v) if (t.startsWith(id + "|")) return false;
        if (v.size() >= MAX_TEAMS) return false;
        v.add(id + "|" + name.replace("|", " ").replace(";", " "));
        setList("teams", v);
        return true;
    }

    // The card beside the clock: value sent to the page (#panel=), Arabic label
    static final String[][] PANELS = {
        {"shows", "جديد المسلسلات"}, {"prayers", "مواقيت الصلاة اليوم"}, {"forecast", "طقس الأيام القادمة"},
        {"matches", "مباريات فرقك القادمة"}, {"verse", "آية أو حديث اليوم"}, {"wisdom", "حكمة اليوم"},
        {"adhkar", "أذكار الصباح والمساء"}, {"stocks", "الأسهم"}, {"none", "لا شيء"},
    };

    /** Older builds had an on/off switch for the card; off becomes "none", otherwise the verse card. */
    String panel() { return sp.getString("panel", sp.getBoolean("showWeek", true) ? "verse" : "none"); }
    void setPanel(String v) { sp.edit().putString("panel", v).apply(); }

    static String panelLabel(String v) {
        for (String[] p : PANELS) if (p[0].equals(v)) return p[1];
        return PANELS[0][1];
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

    String digits() { return sp.getString("digits", "hindi"); }
    void setDigits(String v) { sp.edit().putString("digits", v).apply(); }

    static String digitsLabel(String v) {
        for (String[] d : DIGITS) if (d[0].equals(v)) return d[1];
        return DIGITS[0][1];
    }

    // the stocks card's watchlist (sent as #stocks=): 4-digit Tadawul codes and US tickers, up to MAX_STOCKS
    static final int MAX_STOCKS = 8;
    static final String DEFAULT_STOCKS = "2222,1120,7010,2010";
    static final String STOCK_PATTERN = "\\d{4}|[A-Za-z][A-Za-z.\\-]{0,5}";

    List<String> stocks() {
        List<String> v = list("stocks");
        return v.isEmpty() ? java.util.Arrays.asList(DEFAULT_STOCKS.split(",")) : v;
    }
    void setStocks(List<String> v) { setList("stocks", v); }

    /** Chosen markets in order, the keys of MARKETS. */
    List<String> markets() {
        List<String> v = list("markets");
        return v.isEmpty() ? java.util.Arrays.asList(DEFAULT_MARKETS.split(",")) : v;
    }
    void setMarkets(List<String> v) { setList("markets", v); }

    String mkStyle() { return sp.getString("mkStyle", "arrows"); }
    void setMkStyle(String v) { sp.edit().putString("mkStyle", v).apply(); }

    static String mkStyleLabel(String v) {
        for (String[] m : MK_STYLES) if (m[0].equals(v)) return m[1];
        return MK_STYLES[0][1];
    }

    String cardStyle() { return sp.getString("cardStyle", "current"); }
    void setCardStyle(String v) { sp.edit().putString("cardStyle", v).apply(); }

    static String cardStyleLabel(String v) {
        for (String[] c : CARD_STYLES) if (c[0].equals(v)) return c[1];
        return CARD_STYLES[0][1];
    }

    String photoMinutes() { return sp.getString("photoMinutes", "30"); }
    void setPhotoMinutes(String v) { sp.edit().putString("photoMinutes", v).apply(); }

    boolean autoUpdate() { return sp.getBoolean("autoUpdate", true); }
    void setAutoUpdate(boolean v) { sp.edit().putBoolean("autoUpdate", v).apply(); }

    SharedPreferences raw() { return sp; }

    /** The page reads its settings from the fragment; a ?query fails on file:// in WebView. */
    String dashboardUrl(Context c) {
        File remote = Updater.pageFile(c);
        // A downloaded page older than the installed app is stale: the APK carries a newer copy.
        long installed = 0;
        try { installed = c.getPackageManager().getPackageInfo(c.getPackageName(), 0).lastUpdateTime; }
        catch (Exception ignored) { }
        String base = autoUpdate() && remote.isFile() && remote.lastModified() > installed
            ? Uri.fromFile(remote).toString()
            : "file:///android_asset/tv.html";
        return base + "#" + fragment();
    }

    /** Everything the page needs, as "city=..&lat=..&..."; also read by the launcher (ConfigProvider). */
    String fragment() {
        String[] city = city();
        List<String> ids = new ArrayList<>();
        for (String s : shows()) ids.add(s.split("\\|", 2)[0]);
        return "city=" + Uri.encode(city[0]) + "&lat=" + city[1] + "&lon=" + city[2]
            + "&tz=" + Uri.encode(TZ)
            + "&teams=" + join(teamIds(), ",")
            + "&panel=" + panel()
            + "&week=" + ("none".equals(panel()) ? "0" : "1")   // for a page older than #panel
            + "&genres=" + Uri.encode(join(list("genres"), ","))
            + "&langs=" + Uri.encode(join(list("langs"), ","))
            + "&shows=" + join(ids, ",")
            + "&minrating=" + minRating()
            + "&photos=" + photoMinutes()
            + "&digits=" + digits()
            + "&cardstyle=" + cardStyle()
            + "&markets=" + join(markets(), ",")
            + "&mkstyle=" + mkStyle()
            + "&stocks=" + join(stocks(), ",");
    }

    /** The card on the launcher's home screen: one of PANELS, off ("none") until the user picks one. */
    String homePanel() { return sp.getString("homePanel", "none"); }
    void setHomePanel(String v) { sp.edit().putString("homePanel", v).apply(); }

    List<String> teamIds() {
        List<String> ids = new ArrayList<>();
        for (String t : teams()) ids.add(t.split("\\|", 2)[0]);
        return ids;
    }

    static String join(List<String> v, String sep) {
        StringBuilder b = new StringBuilder();
        for (String s : v) { if (b.length() > 0) b.append(sep); b.append(s); }
        return b.toString();
    }
}
