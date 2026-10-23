package sa.urtv.home;

import android.content.Context;
import android.content.pm.ResolveInfo;

import java.util.HashMap;
import java.util.Map;

/** The name shown for an app: its own if it has Arabic letters, else the Arabic one from res/values/app_names.xml, else its own. */
final class AppNames {
    private static Map<String, String> table;   // package -> Arabic name, read once

    private AppNames() {}

    static String label(Context c, ResolveInfo ri) {
        String own = String.valueOf(ri.loadLabel(c.getPackageManager()));
        if (hasArabic(own)) return own;
        String ar = table(c).get(ri.activityInfo.packageName);
        return ar != null ? ar : own;
    }

    static boolean hasArabic(String s) {
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if ((ch >= 0x0600 && ch <= 0x06FF) || (ch >= 0x0750 && ch <= 0x077F) || (ch >= 0xFB50 && ch <= 0xFEFC)) return true;
        }
        return false;
    }

    private static synchronized Map<String, String> table(Context c) {
        if (table == null) {
            Map<String, String> t = new HashMap<>();
            for (String row : c.getApplicationContext().getResources().getStringArray(R.array.app_names)) {
                int bar = row.indexOf('|');
                if (bar > 0) t.put(row.substring(0, bar).trim(), row.substring(bar + 1).trim());
            }
            table = t;
        }
        return table;
    }
}
