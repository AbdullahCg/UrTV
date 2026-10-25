package sa.urtv.home;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** Four-digit TV keypad: remote or on-screen input submits on the fourth digit. */
final class PinPrompt {
    private static java.lang.ref.WeakReference<Dialog> visible=new java.lang.ref.WeakReference<>(null);
    static Dialog visibleFor(Activity a){Dialog d=visible.get();return d!=null&&d.isShowing()&&d.getOwnerActivity()==a?d:null;}
    static void dismiss(Activity a){Dialog d=visibleFor(a);if(d!=null)d.dismiss();}
    static Dialog ask(Activity a,String title,String hint,Consumer<String> done) {
        return ask(a,title,hint,done,() -> {});
    }
    static Dialog ask(Activity a,String title,String hint,Consumer<String> done,Runnable cancelled) {
        Dialog dialog=new Dialog(a,android.R.style.Theme_Material_NoActionBar);
        dialog.setOwnerActivity(a);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        StringBuilder pin=new StringBuilder();
        boolean[] submitted={false};
        LinearLayout root=new LinearLayout(a); root.setOrientation(LinearLayout.HORIZONTAL);
        root.setGravity(Gravity.CENTER_VERTICAL); root.setPadding(dp(a,28),dp(a,28),dp(a,28),dp(a,28));
        root.setBackground(PinUi.panel(a,PinUi.BG,0x3DD6AF6B));
        LinearLayout keypad=new LinearLayout(a); keypad.setOrientation(LinearLayout.VERTICAL);keypad.setClipChildren(false);
        root.addView(keypad,new LinearLayout.LayoutParams(0,-2,1.1f));
        LinearLayout info=new LinearLayout(a); info.setOrientation(LinearLayout.VERTICAL); info.setGravity(Gravity.RIGHT);
        LinearLayout.LayoutParams infoLp=new LinearLayout.LayoutParams(0,-2,1f); infoLp.leftMargin=dp(a,32); root.addView(info,infoLp);
        info.addView(PinUi.text(a,title,27,PinUi.GOLD),new LinearLayout.LayoutParams(-1,-2));
        TextView help=PinUi.text(a,hint,18,PinUi.TEXT); help.setLineSpacing(dp(a,3),1.1f);
        LinearLayout.LayoutParams hp=new LinearLayout.LayoutParams(-1,-2); hp.topMargin=dp(a,14); info.addView(help,hp);
        TextView masked=PinUi.text(a,"○ ○ ○ ○",38,PinUi.GOLD); masked.setGravity(Gravity.CENTER);
        masked.setTextDirection(View.TEXT_DIRECTION_LTR);
        LinearLayout.LayoutParams mp=new LinearLayout.LayoutParams(-1,dp(a,72)); mp.topMargin=dp(a,24); mp.bottomMargin=dp(a,20); info.addView(masked,mp);
        info.addView(PinUi.text(a,"يُفتح تلقائياً بعد الرقم الرابع\nاستخدم أرقام الريموت أو الأسهم",16,PinUi.MUTED),new LinearLayout.LayoutParams(-1,-2));
        Runnable redraw=() -> masked.setText(pin.length()==0?"○ ○ ○ ○":new String(new char[pin.length()]).replace('\0','●'));
        Consumer<String> add=value -> {
            if(!submitted[0]&&pin.length()<4&&dialog.isShowing()) {
                pin.append(value);redraw.run();
                if(pin.length()==4){
                    submitted[0]=true;String code=pin.toString();
                    // Finish consuming the remote event before replacing the window.
                    root.post(() -> {if(dialog.isShowing()&&!a.isFinishing()){pin.setLength(0);dialog.dismiss();done.accept(code);}});
                }
            }
        };
        Runnable erase=() -> { if(pin.length()>0)pin.deleteCharAt(pin.length()-1); redraw.run(); };
        List<Button> keys=new ArrayList<>();
        String[] labels={"1","2","3","4","5","6","7","8","9","مسح","0","حذف"};
        for(int r=0;r<4;r++) {
            LinearLayout row=new LinearLayout(a); row.setOrientation(LinearLayout.HORIZONTAL);row.setClipChildren(false);
            LinearLayout.LayoutParams rowLp=new LinearLayout.LayoutParams(-1,dp(a,54)); if(r>0)rowLp.topMargin=dp(a,12); keypad.addView(row,rowLp);
            for(int c=0;c<3;c++) {
                String key=labels[r*3+c]; Button b=PinUi.button(a,key);
                if(r==3&&c!=1)b.setTextSize(17);
                LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-1,1f); if(c>0)lp.leftMargin=dp(a,12); row.addView(b,lp); keys.add(b);
                b.setOnClickListener(v -> { if("حذف".equals(key))erase.run();
                    else if("مسح".equals(key)){pin.setLength(0);redraw.run();} else add.accept(key); });
            }
        }
        Button cancel=PinUi.button(a,"إلغاء");
        LinearLayout.LayoutParams ap=new LinearLayout.LayoutParams(-1,dp(a,48));ap.topMargin=dp(a,20);keypad.addView(cancel,ap);
        cancel.setOnClickListener(v -> dialog.cancel());
        for(int i=0;i<12;i++) {
            Button b=keys.get(i);int row=i/3,col=i%3;
            b.setNextFocusLeftId(keys.get(col==0?i:i-1).getId());b.setNextFocusRightId(keys.get(col==2?i:i+1).getId());
            b.setNextFocusUpId(keys.get(row==0?i:i-3).getId());
            b.setNextFocusDownId(row<3?keys.get(i+3).getId():cancel.getId());
        }
        cancel.setNextFocusUpId(keys.get(10).getId());
        dialog.setContentView(root);
        dialog.setOnKeyListener((d,key,event) -> {
            int digit=key>=KeyEvent.KEYCODE_0&&key<=KeyEvent.KEYCODE_9?key-KeyEvent.KEYCODE_0:
                key>=KeyEvent.KEYCODE_NUMPAD_0&&key<=KeyEvent.KEYCODE_NUMPAD_9?key-KeyEvent.KEYCODE_NUMPAD_0:-1;
            if(digit>=0) {
                // Consume the release before closing; otherwise Sony can treat it as a channel-number key.
                if(event.getAction()==KeyEvent.ACTION_UP)add.accept(String.valueOf(digit));return true;
            }
            if(key==KeyEvent.KEYCODE_DEL||key==KeyEvent.KEYCODE_FORWARD_DEL||key==KeyEvent.KEYCODE_CLEAR) {
                if(event.getAction()==KeyEvent.ACTION_DOWN&&event.getRepeatCount()==0){
                    if(key==KeyEvent.KEYCODE_CLEAR){pin.setLength(0);redraw.run();}else erase.run();
                }return true;
            }
            return false;
        });
        dialog.setOnDismissListener(d -> {pin.setLength(0);if(visible.get()==dialog)visible.clear();});
        dialog.setOnCancelListener(d -> cancelled.run());
        dialog.setCanceledOnTouchOutside(false);
        dialog.show();visible=new java.lang.ref.WeakReference<>(dialog);Window w=dialog.getWindow();w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        w.addFlags(WindowManager.LayoutParams.FLAG_SECURE|WindowManager.LayoutParams.FLAG_DIM_BEHIND);w.setDimAmount(.72f);
        int width=Math.min(dp(a,760),Math.round(a.getResources().getDisplayMetrics().widthPixels*.9f));
        w.setLayout(width,WindowManager.LayoutParams.WRAP_CONTENT);
        keys.get(0).requestFocus();return dialog;
    }
    private static int dp(Activity a,float n){return PinUi.dp(a,n);}
}
