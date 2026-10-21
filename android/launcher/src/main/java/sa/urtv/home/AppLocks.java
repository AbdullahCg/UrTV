package sa.urtv.home;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.Toast;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Launch-time gates only: Android voice/deep links and other launchers are outside this feature. */
final class AppLocks {
    static final String MASTER = "@master";
    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("AppLocks", Context.MODE_PRIVATE); }
    static boolean locked(Context c, String pkg) { return prefs(c).contains("pin:" + pkg); }
    static void remove(Context c, String pkg) {
        prefs(c).edit().remove("pin:"+pkg).remove("fails:"+pkg).remove("until:"+pkg).commit();
    }
    static void reset(Context c) { prefs(c).edit().clear().commit(); }
    static void save(Activity a, String pkg, String pin, Runnable done) {
        WORK.execute(() -> {
            boolean saved = false;
            try { saved = prefs(a).edit().putString("pin:"+pkg, PinCrypto.create(pin))
                    .remove("fails:"+pkg).remove("until:"+pkg).commit(); }
            catch (RuntimeException ignored) { }
            final boolean ok = saved;
            a.runOnUiThread(() -> { if (!a.isFinishing()) {
                if (ok) done.run(); else toast(a, "تعذر حفظ الرمز، حاول مرة أخرى");
            }});
        });
    }
    static void guard(Activity a, String pkg, String name, Runnable allowed) {
        if (!locked(a, pkg)) { allowed.run(); return; }
        long wait = prefs(a).getLong("until:global",0) - System.currentTimeMillis();
        if (wait > 0) { toast(a, "محاولات كثيرة. انتظر " + ((wait+999)/1000) + " ثانية"); return; }
        PinPrompt.ask(a, "رمز " + name, "أدخل رمز التطبيق أو الرمز الرئيسي", pin -> {
            WORK.execute(() -> {
                SharedPreferences p = prefs(a);
                boolean ok = PinCrypto.verify(pin,p.getString("pin:"+pkg,null));
                if (!ok && !MASTER.equals(pkg)) ok = PinCrypto.verify(pin,p.getString("pin:"+MASTER,null));
                if (ok) p.edit().remove("fails:global").remove("until:global").commit();
                else {
                    int fails=p.getInt("fails:global",0)+1;
                    p.edit().putInt("fails:global",fails%5)
                            .putLong("until:global",fails>=5 ? System.currentTimeMillis()+30000 : 0).commit();
                }
                final boolean accepted=ok;
                a.runOnUiThread(() -> { if (!a.isFinishing()) {
                    if (accepted) allowed.run();
                    else { toast(a,"الرمز غير صحيح"); guard(a,pkg,name,allowed); }
                }});
            });
        });
    }
    static void choose(Activity a, String title, java.util.function.Consumer<String> save) {
        PinPrompt.ask(a,title,"اختر رمزاً من 4 أرقام",first ->
            PinPrompt.ask(a,"تأكيد الرمز","أعد إدخال الرمز",second -> {
                if (first.equals(second)) save.accept(first);
                else toast(a,"الرمزان غير متطابقين. لم يتغير شيء");
            }));
    }
    static void toast(Context c,String s) { Toast.makeText(c,s,Toast.LENGTH_LONG).show(); }
}
