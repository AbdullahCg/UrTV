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
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public void onStart() {
        Context c=getTargetContext(); SharedPreferences p=c.getSharedPreferences("AppLocks",Context.MODE_PRIVATE);
        if(!p.contains("pin:"+AppLocks.MASTER)) p.edit().remove("fails:global").remove("until:global").commit();
        Map<String,?> original=p.getAll(); Bundle out=new Bundle(); int result=Activity.RESULT_OK;
        try {
            p.edit().clear().putString("pin:"+AppLocks.MASTER,PinCrypto.create("1234"))
                .putString("pin:com.example.pin-test",PinCrypto.create("0012")).commit();
            host=startActivitySync(new Intent(c,AppLockSettingsActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            waitText("متابعة"); enter("0000"); click("متابعة"); SystemClock.sleep(1200);
            check(find("تغيير الرمز الرئيسي")==null,"wrong master PIN opened settings");
            waitText("متابعة"); enter("1234"); click("متابعة"); waitView("تغيير الرمز الرئيسي");
            runOnMainSync(() -> host.finish()); waitForIdleSync();
            host=startActivitySync(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            AtomicInteger opened=new AtomicInteger();
            gate(opened); waitText("إلغاء"); click("إلغاء"); SystemClock.sleep(200);
            check(opened.get()==0,"cancel launched an app");
            gate(opened); waitText("متابعة"); enter("0000"); click("متابعة"); SystemClock.sleep(1200);
            check(opened.get()==0,"wrong app PIN passed");
            waitText("متابعة"); enter("0012"); click("متابعة"); waitCount(opened,1);
            gate(opened); waitText("متابعة"); enter("1234"); click("متابعة"); waitCount(opened,2);
            check(PinCrypto.verify("0012",p.getString("pin:com.example.pin-test",null)),"saved app PIN changed");
            gate(opened);
            for(int i=0;i<5;i++) {
                waitText("متابعة"); enter("9999"); click("متابعة");
                final int expected=(i+1)%5;
                for(int j=0;j<100;j++) {
                    if(p.getInt("fails:global",0)==expected && (i<4 || p.getLong("until:global",0)>System.currentTimeMillis()))break;
                    SystemClock.sleep(100);
                }
                check(p.getInt("fails:global",0)==expected,"PIN verification did not finish");
            }
            check(opened.get()==2 && p.getLong("until:global",0)>System.currentTimeMillis(),"retry limit missing");
            out.putString("stream","PASS master gate, per-app PIN, wrong PIN, cancel, master recovery, persistent verifier and retry lockout; original PIN store restored\n");
        } catch(Throwable e) { result=Activity.RESULT_CANCELED; out.putString("stream","FAIL "+e.getClass().getSimpleName()+": "+e.getMessage()+"; host finishing="+(host!=null&&host.isFinishing())+"; failed attempts="+p.getInt("fails:global",0)+"; window="+windowText(getUiAutomation().getRootInActiveWindow())+"\n"); }
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
    private void enter(String value) { for(char ch:value.toCharArray()) sendKeyDownUpSync(KeyEvent.KEYCODE_0+ch-'0'); waitForIdleSync(); }
    private void waitCount(AtomicInteger count,int n) {
        for(int i=0;i<50&&count.get()!=n;i++) SystemClock.sleep(100);
        check(count.get()==n,"valid PIN not accepted");
    }
    private void waitText(String text) { for(int i=0;i<50;i++) { if(find(text)!=null)return; SystemClock.sleep(100); } throw new AssertionError("UI not found: "+text); }
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
    private void click(String text) { AccessibilityNodeInfo node=find(text); check(node!=null,"missing button"); check(node.performAction(AccessibilityNodeInfo.ACTION_CLICK),"button not clickable"); waitForIdleSync(); }
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
