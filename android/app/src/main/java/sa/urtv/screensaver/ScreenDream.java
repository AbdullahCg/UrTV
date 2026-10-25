package sa.urtv.screensaver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.service.dreams.DreamService;
import android.util.Base64;
import android.webkit.WebView;

import org.json.JSONObject;

/** The system screensaver: starts on the TV's own idle timer, any key wakes it. */
public class ScreenDream extends DreamService {
    static final String SHOW_NOTE = "sa.urtv.home.SHOW_NOTE", NOTE_PERMISSION = "sa.urtv.home.permission.SHOW_NOTE";
    private WebView web;
    private boolean listening;

    private final BroadcastReceiver notes = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (web == null) return;
            byte[] img = i.getByteArrayExtra("image");
            String image = img == null ? "" : "data:image/jpeg;base64," + Base64.encodeToString(img, Base64.NO_WRAP);
            String title = i.getStringExtra("title"), message = i.getStringExtra("message");
            web.evaluateJavascript("window.urtvNote && urtvNote(" + JSONObject.quote(title == null ? "" : title) + ","
                    + JSONObject.quote(message == null ? "" : message) + "," + JSONObject.quote(image) + ","
                    + i.getIntExtra("seconds", 15) + ")", null);
            if (isOrderedBroadcast()) setResultCode(1);
        }
    };

    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(true);
        web = ScreenView.create(this);
        setContentView(web);
    }

    @Override public void onDreamingStarted() {
        super.onDreamingStarted();
        IntentFilter f = new IntentFilter(SHOW_NOTE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(notes, f, NOTE_PERMISSION, null, Context.RECEIVER_EXPORTED);
        else registerReceiver(notes, f, NOTE_PERMISSION, null);
        listening = true;
    }

    @Override public void onDreamingStopped() {
        if (listening) { unregisterReceiver(notes); listening = false; }
        super.onDreamingStopped();
    }

    @Override
    public void onDetachedFromWindow() {
        if (listening) { unregisterReceiver(notes); listening = false; }
        ScreenView.release(web);
        web = null;
        super.onDetachedFromWindow();
    }
}
