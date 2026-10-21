package sa.urtv.home.tilawah;

import android.content.Context;
import android.graphics.Typeface;
import android.widget.TextView;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** The project's type and small formatting helpers. */
final class Ui {
    private static final Map<String, Typeface> FONTS = new HashMap<>();

    private Ui() {}

    static Typeface font(Context c, String file) {
        Typeface cached = FONTS.get(file);
        if (cached != null) return cached;
        Typeface made = Typeface.createFromAsset(c.getAssets(), "fonts/" + file);
        FONTS.put(file, made);
        return made;
    }

    static void text(TextView view, String file, int sizeSp, int color) {
        view.setTypeface(font(view.getContext(), file));
        view.setTextSize(sizeSp);
        view.setTextColor(view.getResources().getColor(color));
    }

    /** 1:05, 12:40, 1:02:03 */
    static String time(int ms) {
        if (ms < 0) ms = 0;
        int total = ms / 1000;
        int h = total / 3600, m = (total % 3600) / 60, s = total % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, s)
                     : String.format(Locale.US, "%d:%02d", m, s);
    }

    /** 114 -> ١١٤: the UI uses Arabic-Indic digits, like the rest of the project */
    static String arabic(int n) { return digits(String.valueOf(n)); }

    /** "05:12" -> "٠٥:١٢" */
    static String digits(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            out.append(c >= '0' && c <= '9' ? (char) ('٠' + (c - '0')) : c);
        }
        return out.toString();
    }
}
