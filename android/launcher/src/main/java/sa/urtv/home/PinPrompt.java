package sa.urtv.home;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.function.Consumer;

/** Remote-friendly keypad; also accepts remote number keys, without invoking a keyboard app. */
final class PinPrompt {
    static void ask(Activity a, String title, String hint, Consumer<String> done) {
        final StringBuilder pin=new StringBuilder();
        LinearLayout root=new LinearLayout(a); root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24,12,24,12); root.setGravity(Gravity.CENTER);
        TextView help=new TextView(a); help.setText(hint); help.setGravity(Gravity.CENTER); help.setTextSize(17); root.addView(help);
        TextView masked=new TextView(a); masked.setText("○ ○ ○ ○"); masked.setGravity(Gravity.CENTER);
        masked.setTextSize(28); masked.setPadding(0,12,0,12); root.addView(masked);
        Runnable redraw=() -> masked.setText(pin.length()==0 ? "○ ○ ○ ○" : new String(new char[pin.length()]).replace('\0','●'));
        Consumer<String> add=d -> { if(pin.length()<8) { pin.append(d); redraw.run(); } };
        Runnable erase=() -> { if(pin.length()>0) pin.deleteCharAt(pin.length()-1); redraw.run(); };
        AlertDialog dialog=new AlertDialog.Builder(a).setTitle(title).setView(root)
                .setPositiveButton("متابعة",null).setNegativeButton("إلغاء",null).create();
        Button first=null;
        String[][] rows={{"1","2","3"},{"4","5","6"},{"7","8","9"},{"مسح","0","حذف"}};
        for(String[] keys:rows) {
            LinearLayout row=new LinearLayout(a); row.setGravity(Gravity.CENTER);
            root.addView(row,new LinearLayout.LayoutParams(-1,-2));
            for(String k:keys) {
                Button b=new Button(a); b.setText(k); b.setTextSize(20); b.setTypeface(Typeface.DEFAULT_BOLD);
                row.addView(b,new LinearLayout.LayoutParams(110,60));
                if(first==null) first=b;
                b.setOnClickListener(v -> { if("حذف".equals(k)) erase.run();
                    else if("مسح".equals(k)) { pin.setLength(0); redraw.run(); } else add.accept(k); });
            }
        }
        dialog.setOnKeyListener((d,key,event) -> {
            if(key>=KeyEvent.KEYCODE_0 && key<=KeyEvent.KEYCODE_9) {
                if(event.getAction()==KeyEvent.ACTION_UP) add.accept(String.valueOf(key-KeyEvent.KEYCODE_0)); return true;
            }
            if(key==KeyEvent.KEYCODE_DEL) { if(event.getAction()==KeyEvent.ACTION_UP) erase.run(); return true; }
            return false;
        });
        dialog.show();
        dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        dialog.getWindow().setLayout(520,WindowManager.LayoutParams.WRAP_CONTENT);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if(!PinCrypto.valid(pin.toString())) { help.setText("استخدم من 4 إلى 8 أرقام"); return; }
            String value=pin.toString(); pin.setLength(0); dialog.dismiss(); done.accept(value);
        });
        dialog.setOnDismissListener(d -> pin.setLength(0));
        if(first!=null) first.requestFocus();
    }
}
