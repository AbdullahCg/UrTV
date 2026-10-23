package sa.urtv.home;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.util.Collections;

/**
 * The optional cards on the home screen: the screensaver's page in card-only mode (#widget=1), showing
 * up to three cards picked in the screensaver's settings («البطاقة الأولى» … «الثالثة»), all in one WebView
 * whose box grows with their number (see Sizer). Off by default; while off no WebView is created. Settings
 * come from the screensaver app's ConfigProvider (same signing key).
 */
final class HomeCard {
    private static final Uri CONFIG = Uri.parse("content://sa.urtv.screensaver.config");
    private static final String FONTS = "https://raw.githubusercontent.com/tshi-dev/UrTV/master/assets/fonts/";

    /** The box in pixels, {width, height}, for that many cards; asked again whenever the screen is laid out. */
    interface Sizer { int[] box(int cards); }

    private final Activity activity;
    private final ViewGroup parent;
    private final FrameLayout.LayoutParams params;
    private final Sizer sizer;
    private WebView web;
    private String url;
    private int cards;   // how many the page in `web` shows

    HomeCard(Activity activity, ViewGroup parent, FrameLayout.LayoutParams params, Sizer sizer) {
        this.activity = activity;
        this.parent = parent;
        this.params = params;
        this.sizer = sizer;
    }

    /** The screen was laid out again (the dock's names, the clock's width): the box may have to move. */
    void fit() {
        if (web == null) return;
        int[] b = sizer.box(cards);
        if (b[0] == params.width && b[1] == params.height) return;
        params.width = b[0];
        params.height = b[1];
        web.setLayoutParams(params);
    }

    /** onResume: follow the current settings; a changed choice gets a fresh page. */
    void refresh() {
        String want = readUrl();
        if (want == null) { destroy(); return; }
        if (!want.equals(url)) { destroy(); create(want); }
        web.onResume();
        web.resumeTimers();
    }

    /** onPause: no timers or network while an app is in front. */
    void pause() {
        if (web != null) { web.onPause(); web.pauseTimers(); }
    }

    void destroy() {
        if (web == null) return;
        parent.removeView(web);
        web.destroy();
        web = null;
        url = null;
    }

    private String readUrl() {
        try (Cursor c = activity.getContentResolver().query(CONFIG, null, null, null, null)) {
            if (c == null || !c.moveToFirst()) return fallback();
            String frag = c.getString(0), panel = c.getString(1);
            int all = c.getColumnIndex("home_panels");   // "a,b,c": every card; an older screensaver has only the first
            if (all >= 0 && c.getString(all) != null) panel = c.getString(all);
            if (frag == null || panel == null) return fallback();
            if ("none".equals(panel) || panel.isEmpty()) return null;    // the user turned the cards off
            cards = Math.max(1, Math.min(3, panel.split(",").length));
            frag = frag.replaceAll("(^|&)(panel|week)=[^&]*", "");   // the screensaver's own card choice
            // panel= is the first card, for a page that knows only one; home_panel= the whole list
            return "file:///android_asset/web/tv.html#" + frag + "&panel=" + panel.split(",")[0]
                + "&home_panel=" + panel + "&widget=1";
        } catch (RuntimeException e) {
            return fallback();   // the screensaver's settings are out of reach
        }
    }

    /**
     * The screensaver's settings could not be read: it is missing, too old, or signed with another
     * key (a test build of this app). The prayer times of the default city are shown instead of
     * an empty screen.
     */
    private String fallback() {
        cards = 1;
        return "file:///android_asset/web/tv.html#panel=prayers&widget=1";
    }

    @SuppressLint("SetJavaScriptEnabled")
    @SuppressWarnings("deprecation")
    private void create(String u) {
        web = new WebView(activity);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.setFocusable(false);
        web.setFocusableInTouchMode(false);
        web.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient() {
            // the page asks GitHub for its fonts; answer from the APK
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                String s = r.getUrl().toString();
                if (s.startsWith(FONTS)) {
                    String name = s.substring(FONTS.length());
                    if (name.matches("[A-Za-z0-9_-]+\\.woff2")) {
                        try {
                            return new WebResourceResponse("font/woff2", null, 200, "OK",
                                Collections.singletonMap("Access-Control-Allow-Origin", "*"),
                                activity.getAssets().open("fonts/" + name));
                        } catch (java.io.IOException ignored) { }
                    }
                }
                return super.shouldInterceptRequest(v, r);
            }
        });
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // same as the screensaver: the page calls its data APIs directly from file://
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        // The page sizes its text to the screen; the TV's font size setting (Android scales WebView text by it) made
        // it larger than its boxes, so the left column spilled off screen and moved as the clock and the matches changed.
        s.setTextZoom(100);
        int[] b = sizer.box(cards);
        params.width = b[0];
        params.height = b[1];
        parent.addView(web, params);
        url = u;
        web.loadUrl(u);
    }
}
