package sa.urtv.home;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.widget.ImageView;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.FrameLayout;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** A fresh master-PIN check is required each time this private activity is opened. */
public class AppLockSettingsActivity extends Activity {
    private boolean authorized;
    private String selectedPkg;
    private boolean openedAccessibilitySettings;
    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        TextView loading=PinUi.text(this,"قفل التطبيقات",28,PinUi.TEXT); loading.setGravity(Gravity.CENTER);loading.setBackgroundColor(PinUi.BG);
        setContentView(loading);
        if(AppLocks.locked(this,AppLocks.MASTER)) {
            AppLocks.guard(this,AppLocks.MASTER,"إعدادات قفل التطبيقات",() -> { authorized=true; render(); });
        } else {
            AppLocks.choose(this,"إنشاء الرمز الرئيسي",pin -> AppLocks.save(this,AppLocks.MASTER,pin,() -> {
                authorized=true; render();
            }));
        }
    }
    @Override protected void onResume() { super.onResume(); if(authorized&&openedAccessibilitySettings){openedAccessibilitySettings=false;render();} }
    @Override protected void onStop() { PinPrompt.dismiss(this);super.onStop(); if(!openedAccessibilitySettings)finish(); }
    private void render() {
        if(!authorized) return;
        ScrollView scroll=new ScrollView(this);scroll.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0xFF0A2016,0xFF04120C,0xFF020806}));
        FrameLayout frame=new FrameLayout(this);scroll.addView(frame);
        LinearLayout col=new LinearLayout(this); col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(PinUi.dp(this,20),PinUi.dp(this,32),PinUi.dp(this,20),PinUi.dp(this,48));
        int width=Math.min(PinUi.dp(this,760),Math.round(getResources().getDisplayMetrics().widthPixels*.9f));
        frame.addView(col,new FrameLayout.LayoutParams(width,-2,Gravity.CENTER_HORIZONTAL));
        col.addView(PinUi.text(this,"قفل التطبيقات",32,PinUi.GOLD),new LinearLayout.LayoutParams(-1,-2));
        TextView help=PinUi.text(this,"رمز مستقل من 4 أرقام لكل تطبيق\nيُطلب الرمز عند الفتح من تلفزيونك",17,PinUi.MUTED);
        help.setPadding(0,PinUi.dp(this,10),0,PinUi.dp(this,24)); col.addView(help);
        LinearLayout access=new LinearLayout(this);access.setGravity(Gravity.CENTER_VERTICAL);
        access.setPadding(PinUi.dp(this,16),PinUi.dp(this,12),PinUi.dp(this,16),PinUi.dp(this,12));
        access.setBackground(PinUi.panel(this,PinUi.SURFACE,0x26FFFFFF));
        LinearLayout.LayoutParams accessLp=new LinearLayout.LayoutParams(-1,-2);accessLp.bottomMargin=PinUi.dp(this,16);col.addView(access,accessLp);
        LinearLayout accessCopy=new LinearLayout(this);accessCopy.setOrientation(LinearLayout.VERTICAL);
        access.addView(accessCopy,new LinearLayout.LayoutParams(0,-2,1f));
        accessCopy.addView(PinUi.text(this,"حماية الفتح الصوتي",18,PinUi.TEXT),new LinearLayout.LayoutParams(-1,-2));
        String gateState=AppLockAccessibilityService.enabled(this)?"مفعّلة · تحمي الفتح من الصوت والتطبيقات الأخرى":"غير مفعّلة · تسمح بفتح التطبيقات المحمية بالصوت";
        TextView accessStatus=PinUi.text(this,gateState,14,PinUi.MUTED);accessStatus.setPadding(0,PinUi.dp(this,4),0,0);accessCopy.addView(accessStatus,new LinearLayout.LayoutParams(-1,-2));
        Button accessButton=PinUi.button(this,"إعداد");accessButton.setTextSize(16);access.addView(accessButton,new LinearLayout.LayoutParams(PinUi.dp(this,150),PinUi.dp(this,52)));
        accessButton.setOnClickListener(v->{
            openedAccessibilitySettings=true;
            try { startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); }
            catch (RuntimeException e) { openedAccessibilitySettings=false; AppLocks.toast(this,"تعذّر فتح إعدادات إمكانية الوصول"); }
        });
        LinearLayout actions=new LinearLayout(this);actions.setClipChildren(false);col.addView(actions,new LinearLayout.LayoutParams(-1,PinUi.dp(this,54)));
        Button master=PinUi.button(this,"تغيير الرمز الرئيسي");master.setTextSize(16);
        actions.addView(master,new LinearLayout.LayoutParams(0,-1,1f));
        master.setOnClickListener(v -> AppLocks.choose(this,"رمز رئيسي جديد",pin -> AppLocks.save(this,AppLocks.MASTER,pin,() -> AppLocks.toast(this,"تم تغيير الرمز الرئيسي"))));
        Button clear=PinUi.button(this,"إزالة الأقفال");clear.setTextSize(16);
        LinearLayout.LayoutParams clearLp=new LinearLayout.LayoutParams(0,-1,1f);clearLp.leftMargin=PinUi.dp(this,14);actions.addView(clear,clearLp);
        clear.setOnClickListener(v -> new AlertDialog.Builder(this)
            .setTitle("إزالة جميع الأقفال؟").setMessage("ستفتح كل التطبيقات بدون رمز. يمكنك إعداد الأقفال من جديد لاحقاً.")
            .setNegativeButton("إلغاء",null).setPositiveButton("إزالة",(d,n) -> { AppLocks.reset(this); finish(); }).show());
        TextView section=PinUi.text(this,"التطبيقات",16,PinUi.GOLD);section.setPadding(0,PinUi.dp(this,28),0,PinUi.dp(this,6));col.addView(section,new LinearLayout.LayoutParams(-1,-2));
        Map<String,String> apps=Dock.launchable(this);
        List<String> pkgs=new ArrayList<>(apps.keySet()); pkgs.sort((x,y) -> apps.get(x).compareToIgnoreCase(apps.get(y)));
        for(String pkg:pkgs) {
            if(pkg.equals(getPackageName())) continue;
            String name=apps.get(pkg);
            appRow(col,pkg,name);
        }
        setContentView(scroll);
    }
    private void edit(String pkg,String name) {
        selectedPkg=pkg;
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
    private void appRow(LinearLayout col,String pkg,String name) {
        boolean locked=AppLocks.locked(this,pkg);
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setFocusable(true);row.setClickable(true);
        row.setPadding(PinUi.dp(this,20),PinUi.dp(this,12),PinUi.dp(this,20),PinUi.dp(this,12));
        row.setBackground(PinUi.panel(this,PinUi.SURFACE,0x26FFFFFF));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,PinUi.dp(this,86));lp.topMargin=PinUi.dp(this,12);col.addView(row,lp);
        ImageView state=new ImageView(this);state.setImageResource(android.R.drawable.ic_lock_lock);state.setColorFilter(PinUi.GOLD);state.setVisibility(locked?View.VISIBLE:View.INVISIBLE);
        row.addView(state,new LinearLayout.LayoutParams(PinUi.dp(this,20),PinUi.dp(this,20)));
        LinearLayout labels=new LinearLayout(this);labels.setOrientation(LinearLayout.VERTICAL);labels.setPadding(PinUi.dp(this,20),0,PinUi.dp(this,18),0);
        row.addView(labels,new LinearLayout.LayoutParams(0,-2,1f));
        TextView title=PinUi.text(this,name,20,PinUi.TEXT);title.setSingleLine(true);title.setEllipsize(android.text.TextUtils.TruncateAt.END);labels.addView(title,new LinearLayout.LayoutParams(-1,-2));
        TextView subtitle=PinUi.text(this,locked?"محمي برمز":"بدون قفل",14,PinUi.MUTED);labels.addView(subtitle,new LinearLayout.LayoutParams(-1,-2));
        ImageView icon=new ImageView(this);icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        try{icon.setImageDrawable(getPackageManager().getApplicationIcon(pkg));}catch(Exception ignored){}
        row.addView(icon,new LinearLayout.LayoutParams(PinUi.dp(this,48),PinUi.dp(this,48)));
        row.setContentDescription(name+"، "+(locked?"محمي برمز":"بدون قفل"));
        row.setOnFocusChangeListener((v,on) -> {
            row.setBackground(PinUi.panel(this,on?PinUi.FOCUS:PinUi.SURFACE,on?PinUi.FOCUS:0x26FFFFFF));
            title.setTextColor(on?PinUi.INK:PinUi.TEXT);subtitle.setTextColor(on?0xFF4B5B50:PinUi.MUTED);state.setColorFilter(on?PinUi.INK:PinUi.GOLD);
            row.animate().scaleX(on?1.015f:1f).scaleY(on?1.015f:1f).setDuration(140).start();
        });
        row.setOnClickListener(v -> edit(pkg,name));
        if(pkg.equals(selectedPkg))row.post(row::requestFocus);
    }
}
