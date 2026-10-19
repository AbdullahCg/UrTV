package com.abdullah.tvsaver;

import android.annotation.SuppressLint;
import android.content.Context;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** The WebView shared by the preview activity and the dream. */
final class Dashboard {
    private Dashboard() {}

    @SuppressLint("SetJavaScriptEnabled")
    @SuppressWarnings("deprecation")
    static WebView create(Context c) {
        WebView w = new WebView(c);
        w.setBackgroundColor(0xFF040E09);   // no white flash before the page paints
        w.setFocusable(false);
        w.setVerticalScrollBarEnabled(false);
        w.setHorizontalScrollBarEnabled(false);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.setWebViewClient(new WebViewClient());
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // lets the page call Yahoo and other APIs directly, without a CORS gateway
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        w.loadUrl(new Prefs(c).dashboardUrl(c));
        UpdateJob.schedule(c);
        return w;
    }
}
