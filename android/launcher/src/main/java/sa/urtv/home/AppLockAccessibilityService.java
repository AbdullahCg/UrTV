package sa.urtv.home;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.Locale;

/** Intercepts launches outside UrTV (voice search, deep links, other apps) when the user enables it. */
public final class AppLockAccessibilityService extends AccessibilityService {
    private static volatile AppLockAccessibilityService instance;
    private String pendingPackage;
    private String authorizedPackage;
    private boolean videoSelectionArmed;

    static boolean enabled(android.content.Context c) {
        if (Settings.Secure.getInt(c.getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 0) != 1) return false;
        String enabled = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        String expected = new ComponentName(c, AppLockAccessibilityService.class).flattenToString();
        for (String item : enabled.split(":")) {
            ComponentName parsed = ComponentName.unflattenFromString(item);
            if (parsed != null && expected.equals(parsed.flattenToString())) return true;
        }
        return false;
    }

    static void allowOnce(String pkg) {
        AppLockAccessibilityService s = instance;
        if (s != null) {
            s.authorizedPackage = pkg;
            s.videoSelectionArmed = isYoutube(pkg);
            s.pendingPackage = null;
        }
    }

    static void cancelGate(String pkg) {
        AppLockAccessibilityService s = instance;
        if (s != null && pkg.equals(s.pendingPackage)) s.pendingPackage = null;
    }

    @Override public void onServiceConnected() { super.onServiceConnected(); instance = this; }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();
        if (pkg.equals(getPackageName())) return;

        // A pending PIN is not a one-time bypass. Voice search can launch the same app again
        // while the first gate is being ignored, so put the gate back in front on every retry.
        if (pendingPackage != null) {
            int type = event.getEventType();
            boolean appBecameVisible = type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                    || type == AccessibilityEvent.TYPE_WINDOWS_CHANGED;
            if (appBecameVisible && AppLocks.locked(this, pkg)) showGate(pkg);
            return;
        }

        // A PIN grants entry to YouTube and one video choice. Each later thumbnail choice is gated
        // again; otherwise the app's own recommendations bypass the app-launch lock entirely.
        if (isYoutube(pkg) && isVideoSelection(event)) {
            if (videoSelectionArmed) { videoSelectionArmed = false; return; }
            showGate(pkg);
            return;
        }

        if (authorizedPackage != null) {
            if (authorizedPackage.equals(pkg)) return;
            authorizedPackage = null;
        }
        if (!AppLocks.locked(this, pkg)) return;

        showGate(pkg);
    }

    private void showGate(String pkg) {
        pendingPackage = pkg;
        authorizedPackage = null;
        String name;
        try { name = getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(pkg, 0)).toString(); }
        catch (Exception e) { name = pkg; }
        Intent gate = new Intent(this, AppLockGateActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_ANIMATION)
                .putExtra(AppLockGateActivity.EXTRA_PACKAGE, pkg)
                .putExtra(AppLockGateActivity.EXTRA_NAME, name);

        // Hide the protected app first, including apps opened by voice search.
        performGlobalAction(GLOBAL_ACTION_HOME);
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (!pkg.equals(pendingPackage)) return;
            try { startActivity(gate); }
            catch (RuntimeException e) { pendingPackage = null; }
        }, 180);
    }

    private static boolean isYoutube(String pkg) {
        return "com.google.android.youtube.tv".equals(pkg) || "com.google.android.youtube".equals(pkg);
    }

    /** A selected YouTube video is an accessible card with descriptive text, unlike transport controls. */
    private boolean isVideoSelection(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_VIEW_CLICKED) return false;
        AccessibilityNodeInfo node = event.getSource();
        if (node == null) return false;
        StringBuilder label = new StringBuilder();
        for (CharSequence part : event.getText()) append(label, part);
        AccessibilityNodeInfo current = node;
        boolean collectionItem = false;
        for (int depth = 0; current != null && depth < 4; depth++) {
            append(label, current.getText());
            append(label, current.getContentDescription());
            if (current.getCollectionItemInfo() != null) collectionItem = true;
            current = current.getParent();
        }
        String text = label.toString().toLowerCase(Locale.ROOT).trim();
        boolean videoLabel = text.contains("thumbnail") || text.contains("video") || text.contains("episode")
                || text.contains("فيديو") || text.contains("حلقة") || text.contains("مقطع");
        if (!videoLabel && text.length() < (collectionItem ? 9 : 24)) return false;
        // Keep playback and navigation controls usable while protecting descriptive video cards.
        String[] controls = {"play", "pause", "seek", "forward", "rewind", "next", "previous", "settings",
                "search", "back", "home", "playback", "تشغيل", "إيقاف", "تقديم", "ترجيع", "التالي", "السابق",
                "إعدادات", "بحث", "رجوع", "الرئيسية", "إيقاف مؤقت"};
        for (String control : controls) {
            if (text.equals(control) || (text.startsWith(control + " ") && text.length() <= control.length() + 12)) return false;
        }
        return collectionItem || node.isClickable() || node.isFocusable();
    }

    private static void append(StringBuilder out, CharSequence value) {
        if (value == null || value.length() == 0) return;
        if (out.length() > 0) out.append(' ');
        out.append(value);
    }

    @Override public void onInterrupt() { }

    @Override public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }
}
