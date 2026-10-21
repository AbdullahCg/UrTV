package sa.urtv.home;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** A fresh master-PIN check is required each time this private activity is opened. */
public class AppLockSettingsActivity extends Activity {
    private boolean authorized;
    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        TextView loading=new TextView(this); loading.setText("قفل التطبيقات"); loading.setGravity(Gravity.CENTER);
        setContentView(loading);
        if(AppLocks.locked(this,AppLocks.MASTER)) {
            AppLocks.guard(this,AppLocks.MASTER,"إعدادات قفل التطبيقات",() -> { authorized=true; render(); });
        } else {
            AppLocks.choose(this,"إنشاء الرمز الرئيسي",pin -> AppLocks.save(this,AppLocks.MASTER,pin,() -> {
                authorized=true; render();
            }));
        }
    }
    @Override protected void onStop() { super.onStop(); finish(); }
    private void render() {
        if(!authorized) return;
        ScrollView scroll=new ScrollView(this); scroll.setBackgroundColor(0xFF071510);
        LinearLayout col=new LinearLayout(this); col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(80,32,80,48); scroll.addView(col);
        TextView title=new TextView(this); title.setText("قفل التطبيقات"); title.setTextColor(0xFFD6AF6B); title.setTextSize(28); col.addView(title);
        TextView help=new TextView(this); help.setText("اختر لكل تطبيق رمزاً من 4 إلى 8 أرقام. الرمز الرئيسي يفتح الإعدادات وأي تطبيق مقفل.\nالقفل عند الفتح من تلفزيونك فقط؛ لا يشمل البحث الصوتي أو التطبيقات الأخرى.");
        help.setTextColor(Color.WHITE); help.setTextSize(17); help.setPadding(0,12,0,20); col.addView(help);
        button(col,"تغيير الرمز الرئيسي",() -> AppLocks.choose(this,"رمز رئيسي جديد",pin -> AppLocks.save(this,AppLocks.MASTER,pin,() -> AppLocks.toast(this,"تم تغيير الرمز الرئيسي"))));
        button(col,"إزالة جميع الأقفال والرمز الرئيسي",() -> new AlertDialog.Builder(this)
            .setTitle("إزالة جميع الأقفال؟").setMessage("ستفتح كل التطبيقات بدون رمز. يمكنك إعداد الأقفال من جديد لاحقاً.")
            .setNegativeButton("إلغاء",null).setPositiveButton("إزالة",(d,n) -> { AppLocks.reset(this); finish(); }).show());
        Map<String,String> apps=Dock.launchable(this);
        List<String> pkgs=new ArrayList<>(apps.keySet()); pkgs.sort((x,y) -> apps.get(x).compareToIgnoreCase(apps.get(y)));
        for(String pkg:pkgs) {
            if(pkg.equals(getPackageName())) continue;
            String name=apps.get(pkg);
            button(col,(AppLocks.locked(this,pkg)?"🔒  ":"○  ")+name,() -> edit(pkg,name));
        }
        setContentView(scroll);
    }
    private void edit(String pkg,String name) {
        if(!AppLocks.locked(this,pkg)) { choose(pkg,name); return; }
        new AlertDialog.Builder(this).setTitle(name).setItems(new String[]{"تغيير رمز التطبيق","إزالة قفل التطبيق"},(d,n) -> {
            if(n==0) choose(pkg,name);
            else new AlertDialog.Builder(this).setTitle("إزالة القفل؟").setMessage(name)
                .setNegativeButton("إلغاء",null).setPositiveButton("إزالة",(x,y) -> { AppLocks.remove(this,pkg); render(); }).show();
        }).show();
    }
    private void choose(String pkg,String name) {
        AppLocks.choose(this,"رمز "+name,pin -> AppLocks.save(this,pkg,pin,() -> { AppLocks.toast(this,"تم حفظ قفل التطبيق"); render(); }));
    }
    private void button(LinearLayout col,String label,Runnable action) {
        Button b=new Button(this); b.setText(label); b.setAllCaps(false); b.setTextSize(18);
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,70); lp.topMargin=8;
        col.addView(b,lp); b.setOnClickListener(v -> action.run());
    }
}
