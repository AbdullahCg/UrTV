package sa.urtv.home;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

/** PIN gate shown when a protected app is opened outside the UrTV launcher. */
public final class AppLockGateActivity extends Activity {
    static final String EXTRA_PACKAGE = "locked_package";
    static final String EXTRA_NAME = "locked_name";
    private String pkg;
    private boolean handled;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        pkg = getIntent().getStringExtra(EXTRA_PACKAGE);
        String name = getIntent().getStringExtra(EXTRA_NAME);
        if (pkg == null || !AppLocks.locked(this, pkg)) { finish(); return; }

        TextView background = PinUi.text(this, "تلفزيونك", 24, PinUi.GOLD);
        background.setGravity(Gravity.CENTER);
        background.setBackgroundColor(PinUi.BG);
        setContentView(background);

        AppLocks.guard(this, pkg, name == null ? pkg : name, () -> {
            handled = true;
            AppLockAccessibilityService.allowOnce(pkg);
            Intent launch = getPackageManager().getLeanbackLaunchIntentForPackage(pkg);
            if (launch == null) launch = getPackageManager().getLaunchIntentForPackage(pkg);
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                try { startActivity(launch); }
                catch (RuntimeException ignored) { }
            }
            finish();
        }, () -> {
            handled = true;
            AppLockAccessibilityService.cancelGate(pkg);
            // The service moved to Home before showing this screen. Keep the app closed on Cancel/Back.
            finish();
        });
    }

    @Override public void onBackPressed() {
        PinPrompt.dismiss(this);
        if (!handled) {
            handled = true;
            AppLockAccessibilityService.cancelGate(pkg);
        }
        finish();
    }
}
