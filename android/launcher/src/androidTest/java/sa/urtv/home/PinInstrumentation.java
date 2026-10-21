package sa.urtv.home;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/** Device test: restores the entire original PIN store even on failure. No test PIN is left configured. */
public class PinInstrumentation extends Instrumentation {
    private Activity host;
    private String phase="setup";
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public void onStart() {
        Context c=getTargetContext(); SharedPreferences p=c.getSharedPreferences("AppLocks",Context.MODE_PRIVATE);
        if(!p.contains("pin:"+AppLocks.MASTER)) p.edit().remove("fails:global").remove("until:global").commit();
        Map<String,?> original=p.getAll(); Bundle out=new Bundle(); int result=Activity.RESULT_OK;
        try {
            p.edit().clear().putString("pin:"+AppLocks.MASTER,PinCrypto.create("1234"))
                .putString("pin:com.example.pin-test",PinCrypto.create("0012")).commit();
            step("master settings");host=startActivitySync(new Intent(c,AppLockSettingsActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            waitText("إلغاء"); enter("0000"); waitFailure(p,1,false);
            check(find("تغيير الرمز الرئيسي")==null,"wrong master PIN opened settings");
            waitText("إلغاء"); enter("1234"); waitView("تغيير الرمز الرئيسي");
            SystemClock.sleep(350);capture("app-lock-settings-preview.png");
            runOnMainSync(() -> host.finish()); waitForIdleSync();
            host=startActivitySync(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            step("app gates");AtomicInteger opened=new AtomicInteger();
            gate(opened); waitText("إلغاء"); click("إلغاء"); SystemClock.sleep(200);
            check(opened.get()==0,"cancel launched an app");
            gate(opened); waitText("إلغاء"); enter("0000"); waitFailure(p,1,false);
            check(opened.get()==0,"wrong app PIN passed");
            waitText("إلغاء"); enter("0012"); waitCount(opened,1);
            gate(opened);waitText("إلغاء");
            for(char ch:"009".toCharArray())sendKeyDownUpSync(KeyEvent.KEYCODE_NUMPAD_0+ch-'0');
            sendKeyDownUpSync(KeyEvent.KEYCODE_DEL);sendKeyDownUpSync(KeyEvent.KEYCODE_NUMPAD_1);sendKeyDownUpSync(KeyEvent.KEYCODE_NUMPAD_2);waitCount(opened,2);
            gate(opened);waitText("إلغاء");enter("1234");waitCount(opened,3);
            gate(opened);waitText("إلغاء");check(find("متابعة")==null,"Continue must not be required");
            click("0");click("0");click("1");click("2");waitCount(opened,4);
            step("create and confirm");java.util.concurrent.atomic.AtomicReference<String> chosen=new java.util.concurrent.atomic.AtomicReference<>();
            runOnMainSync(() -> AppLocks.choose(host,"Test",chosen::set));waitText("إلغاء");enter("0042");
            waitText("أعد إدخال الرمز");enter("0042");
            for(int i=0;i<50&&chosen.get()==null;i++)SystemClock.sleep(100);
            check("0042".equals(chosen.get()),"four-digit create/confirm did not auto-submit");
            check(PinCrypto.verify("0012",p.getString("pin:com.example.pin-test",null)),"saved app PIN changed");
            step("retry limit");gate(opened);
            for(int i=0;i<5;i++) {
                step("retry limit "+(i+1));
                waitText("إلغاء"); enter("9999");
                final int expected=(i+1)%5;
                waitFailure(p,expected,i==4);
            }
            check(opened.get()==4 && p.getLong("until:global",0)>System.currentTimeMillis(),"retry limit missing");
            final android.app.Dialog[] preview={null};
            runOnMainSync(() -> {
                preview[0]=PinPrompt.ask(host,"إنشاء الرمز الرئيسي","اختر رمزاً من 4 أرقام",value -> {});
                // Only this empty synthetic test prompt is captured. Production PIN dialogs stay secure.
                preview[0].getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
            });
            SystemClock.sleep(500);
            capture("pin-ui-preview.png");
            runOnMainSync(() -> preview[0].dismiss());
            out.putString("stream","PASS four-digit auto-submit: remote keys, numpad/delete, on-screen keypad, create/confirm; master gate, cancel, recovery and lockout; original PIN store restored\n");
        } catch(Throwable e) { result=Activity.RESULT_CANCELED; out.putString("stream","FAIL "+phase+": "+e.getClass().getSimpleName()+": "+e.getMessage()+"; host finishing="+(host!=null&&host.isFinishing())+"; failed attempts="+p.getInt("fails:global",0)+"; window="+windowText(getUiAutomation().getRootInActiveWindow())+"\n"); }
        finally {
            if(host!=null) runOnMainSync(() -> host.finish());
            SharedPreferences.Editor edit=p.edit().clear();
            for(Map.Entry<String,?> e:original.entrySet()) {
                Object v=e.getValue(); if(v instanceof String) edit.putString(e.getKey(),(String)v);
                else if(v instanceof Integer) edit.putInt(e.getKey(),(Integer)v);
                else if(v instanceof Long) edit.putLong(e.getKey(),(Long)v);
                else if(v instanceof Boolean) edit.putBoolean(e.getKey(),(Boolean)v);
            }
            edit.commit();
        }
        finish(result,out);
    }
    private void gate(AtomicInteger opened) { runOnMainSync(() -> AppLocks.guard(host,"com.example.pin-test","Test",opened::incrementAndGet)); }
    private void step(String name) {
        phase=name;Bundle status=new Bundle();status.putString("stream","Checking "+name+"\n");sendStatus(0,status);
    }
    private void waitFailure(SharedPreferences p,int expected,boolean cooldown) {
        for(int i=0;i<100;i++) {
            if(p.getInt("fails:global",0)==expected&&(!cooldown||p.getLong("until:global",0)>System.currentTimeMillis()))return;
            SystemClock.sleep(100);
        }
        throw new AssertionError("PIN verification did not finish");
    }
    private void capture(String name) throws java.io.IOException {
        java.io.File image=new java.io.File(getTargetContext().getExternalFilesDir(null),name);
        try(java.io.FileOutputStream file=new java.io.FileOutputStream(image)) {
            getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,file);
        }
    }
    private void enter(String value) { for(char ch:value.toCharArray()) sendKeyDownUpSync(KeyEvent.KEYCODE_0+ch-'0'); waitForIdleSync(); }
    private void waitCount(AtomicInteger count,int n) {
        for(int i=0;i<50&&count.get()!=n;i++) SystemClock.sleep(100);
        check(count.get()==n,"valid PIN not accepted");
    }
    private void waitText(String text) {
        for(int i=0;i<100;i++) {
            final boolean[] found={false};runOnMainSync(() -> {
                android.app.Dialog d=PinPrompt.visibleFor(host);
                found[0]=d!=null&&dialogText(d.getWindow().getDecorView(),text)!=null&&d.getWindow().getDecorView().hasWindowFocus();
            });
            if(found[0])return;SystemClock.sleep(100);
        }
        throw new AssertionError("UI not found: "+text);
    }
    private void waitView(String text) {
        for(int i=0;i<80;i++) {
            final boolean[] found={false}; runOnMainSync(() -> found[0]=viewHas(host.getWindow().getDecorView(),text));
            if(found[0])return; SystemClock.sleep(100);
        }
        throw new AssertionError("Activity view not found: "+text);
    }
    private boolean viewHas(android.view.View v,String text) {
        if(v instanceof android.widget.TextView && text.contentEquals(((android.widget.TextView)v).getText()))return true;
        if(v instanceof android.view.ViewGroup)for(int i=0;i<((android.view.ViewGroup)v).getChildCount();i++)
            if(viewHas(((android.view.ViewGroup)v).getChildAt(i),text))return true;
        return false;
    }
    private android.view.View dialogText(android.view.View v,String text) {
        if(v instanceof android.widget.TextView&&text.contentEquals(((android.widget.TextView)v).getText()))return v;
        if(v instanceof android.view.ViewGroup)for(int i=0;i<((android.view.ViewGroup)v).getChildCount();i++) {
            android.view.View found=dialogText(((android.view.ViewGroup)v).getChildAt(i),text);if(found!=null)return found;
        }
        return null;
    }
    private void click(String text) {
        runOnMainSync(() -> {
            android.app.Dialog d=PinPrompt.visibleFor(host);check(d!=null,"missing dialog");
            android.view.View button=dialogText(d.getWindow().getDecorView(),text);check(button!=null&&button.performClick(),"button not clickable");
        });waitForIdleSync();
    }
    private AccessibilityNodeInfo find(String text) { return find(getUiAutomation().getRootInActiveWindow(),text); }
    private AccessibilityNodeInfo find(AccessibilityNodeInfo node,String text) {
        if(node==null)return null;
        if(text.contentEquals(node.getText()==null?"":node.getText()))return node;
        for(int i=0;i<node.getChildCount();i++) { AccessibilityNodeInfo hit=find(node.getChild(i),text); if(hit!=null)return hit; }
        return null;
    }
    private String windowText(AccessibilityNodeInfo node) {
        if(node==null)return "";
        StringBuilder s=new StringBuilder();
        if(node.getText()!=null)s.append(node.getText()).append(" | ");
        for(int i=0;i<node.getChildCount();i++)s.append(windowText(node.getChild(i)));
        return s.toString();
    }
    private static void check(boolean ok,String why) { if(!ok)throw new AssertionError(why); }
}
