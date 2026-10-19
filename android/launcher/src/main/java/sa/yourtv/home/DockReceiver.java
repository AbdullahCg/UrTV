package sa.yourtv.home;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The favourites row from ADB, for agents and scripts (the remote's long-press menu is for people).
 * Only the shell can send these: the manifest requires android.permission.DUMP, which apps can't hold.
 *
 *   am broadcast -n sa.yourtv.home/.DockReceiver -a sa.yourtv.home.GET_DOCK
 *   am broadcast -n sa.yourtv.home/.DockReceiver -a sa.yourtv.home.LIST_APPS
 *   am broadcast -n sa.yourtv.home/.DockReceiver -a sa.yourtv.home.SET_DOCK --es apps pkg1,pkg2,...
 *   am broadcast -n sa.yourtv.home/.DockReceiver -a sa.yourtv.home.RESET_DOCK
 *
 * The answer is in the "data" of am's output. optimize/dock.sh wraps all four.
 */
public class DockReceiver extends BroadcastReceiver {
    static final String CHANGED = "sa.yourtv.home.DOCK_CHANGED";   // tells a running home screen to redraw

    /** The same file the launcher's long-press menu writes (Activity.getPreferences of MainActivity). */
    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("MainActivity", Context.MODE_PRIVATE);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        String action = String.valueOf(i.getAction());
        Map<String, String> apps = launchable(c);
        switch (action) {
            case "sa.yourtv.home.LIST_APPS": {
                StringBuilder b = new StringBuilder();
                for (Map.Entry<String, String> e : apps.entrySet()) b.append(e.getKey()).append(" | ").append(e.getValue()).append('\n');
                setResultData(b.toString().trim());
                return;
            }
            case "sa.yourtv.home.GET_DOCK":
                setResultData("dock: " + String.join(",", current(c)));
                return;
            case "sa.yourtv.home.RESET_DOCK":
                prefs(c).edit().remove("dock").apply();
                changed(c);
                setResultData("dock: " + String.join(",", current(c)) + " (defaults)");
                return;
            case "sa.yourtv.home.SET_DOCK": {
                String raw = i.getStringExtra("apps");
                if (raw == null) { setResultData("error: add --es apps pkg1,pkg2,..."); return; }
                List<String> dock = new ArrayList<>(), skipped = new ArrayList<>();
                for (String p : raw.split(",")) {
                    p = p.trim();
                    if (p.isEmpty() || dock.contains(p)) continue;
                    if (apps.containsKey(p) && dock.size() < MainActivity.MAX_DOCK) dock.add(p); else skipped.add(p);
                }
                if (dock.isEmpty()) { setResultData("error: none of these apps are on this TV's home screen"); return; }
                prefs(c).edit().putString("dock", String.join(",", dock)).apply();
                changed(c);
                setResultData("dock: " + String.join(",", dock)
                    + (skipped.isEmpty() ? "" : "  skipped (not installed, hidden or over " + MainActivity.MAX_DOCK + "): "
                       + String.join(",", skipped))
                    + (dock.size() < MainActivity.MIN_DOCK ? "  (the row is topped up to " + MainActivity.MIN_DOCK
                       + " with other apps)" : ""));
                return;
            }
            default:
                setResultData("error: unknown action " + action);
        }
    }

    private static List<String> current(Context c) {
        String saved = prefs(c).getString("dock", null);
        return saved != null ? Arrays.asList(saved.isEmpty() ? new String[0] : saved.split(","))
                             : Arrays.asList(c.getResources().getStringArray(R.array.dock_apps));
    }

    /** What the home screen can show: TV apps, minus the hidden ones and the launcher itself. */
    private static Map<String, String> launchable(Context c) {
        PackageManager pm = c.getPackageManager();
        List<String> hidden = new ArrayList<>(Arrays.asList(c.getResources().getStringArray(R.array.hidden_apps)));
        hidden.add(c.getPackageName());
        Map<String, String> out = new LinkedHashMap<>();
        Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        for (ResolveInfo ri : pm.queryIntentActivities(q, 0)) {
            String p = ri.activityInfo.packageName;
            if (!hidden.contains(p) && !out.containsKey(p)) out.put(p, String.valueOf(ri.loadLabel(pm)));
        }
        return out;
    }

    private static void changed(Context c) {
        c.sendBroadcast(new Intent(CHANGED).setPackage(c.getPackageName()));
    }
}
