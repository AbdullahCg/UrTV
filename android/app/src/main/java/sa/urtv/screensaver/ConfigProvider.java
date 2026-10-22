package sa.urtv.screensaver;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;

import java.util.List;

/**
 * Hands the launcher (same signing key, see READ_CONFIG in the manifest) what its home-screen card needs:
 * the page settings as a URL fragment and which card to show ("none" = off).
 *
 * «المهام»: content://sa.urtv.screensaver.config/tasks lists the tasks (i from 1, t, done, at). The launcher
 * may also change them, which needs WRITE_TASKS (signature, same key as READ_CONFIG):
 *   insert  ContentValues t = the text               -> .../tasks/N, or null when refused (empty, full)
 *   update  ContentValues i = N                      -> 1 when task N is marked done
 *   delete  .../tasks/N                              -> 1 when task N is gone
 */
public class ConfigProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        Prefs p = new Prefs(getContext());
        if (isTasks(uri)) {
            MatrixCursor t = new MatrixCursor(new String[] {"i", "t", "done", "at"});
            List<Prefs.Task> all = p.tasks();
            for (int k = 0; k < all.size(); k++) {
                Prefs.Task x = all.get(k);
                t.addRow(new Object[] {k + 1, x.text, x.done ? 1 : 0, x.at});
            }
            return t;
        }
        MatrixCursor c = new MatrixCursor(new String[] {"fragment", "home_panel"});
        c.addRow(new Object[] {p.fragment(), p.homePanel()});
        return c;
    }

    @Override public String getType(Uri uri) { return null; }

    private static boolean isTasks(Uri uri) {
        return uri != null && uri.getPathSegments().size() >= 1 && "tasks".equals(uri.getPathSegments().get(0));
    }

    @Override
    public Uri insert(Uri uri, ContentValues v) {
        if (!isTasks(uri) || v == null) return null;
        Prefs p = new Prefs(getContext());
        if (p.addTask(v.getAsString("t")) != null) return null;
        return Uri.withAppendedPath(uri, String.valueOf(p.tasks().size()));
    }

    @Override
    public int delete(Uri uri, String s, String[] a) {
        if (!isTasks(uri) || uri.getPathSegments().size() < 2) return 0;
        try {
            return new Prefs(getContext()).deleteTask(Integer.parseInt(uri.getLastPathSegment())) ? 1 : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    @Override
    public int update(Uri uri, ContentValues v, String s, String[] a) {
        if (!isTasks(uri) || v == null || v.getAsInteger("i") == null) return 0;
        return new Prefs(getContext()).doneTask(v.getAsInteger("i")) ? 1 : 0;
    }
}
