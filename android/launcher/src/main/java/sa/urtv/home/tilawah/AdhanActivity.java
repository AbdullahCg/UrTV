package sa.urtv.home.tilawah;

import android.app.Activity;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.TextView;

import sa.urtv.home.R;

/** The 21 adhan recordings: OK picks one and plays a few seconds of it. */
public class AdhanActivity extends Activity {

    private Prefs prefs;
    private ListView list;
    private Voices adapter;
    private View lastSelected;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_adhan);
        prefs = new Prefs(this);

        Ui.text((TextView) findViewById(R.id.title), "ThmanyahDisplay-Bold.otf", 40, R.color.sand);
        Ui.text((TextView) findViewById(R.id.hint), "Thmanyah-Light.otf", 13, R.color.dim);

        list = findViewById(R.id.list);
        adapter = new Voices();
        list.setAdapter(adapter);
        list.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                highlight(view);
            }
            @Override public void onNothingSelected(AdapterView<?> parent) { }
        });
        list.setOnItemClickListener((parent, view, position, id) -> {
            int voice = position + 1;
            prefs.setVoice(voice);
            MusicService.adhan(this, voice, Adhan.name(voice), 12);
            finish();
        });

        int selected = prefs.voice() - 1;
        list.setSelection(selected);
        list.post(() -> {
            list.requestFocus();
            highlight(list.getSelectedView());
        });
    }

    private void highlight(View view) {
        if (lastSelected != null && lastSelected != view) resetRow(lastSelected);
        if (view == null) { lastSelected = null; return; }
        view.setBackgroundResource(R.drawable.row_selected);
        View cursor = view.findViewById(R.id.cursor);
        if (cursor != null) cursor.setVisibility(View.VISIBLE);
        lastSelected = view;
    }

    private void resetRow(View view) {
        view.setBackgroundResource(R.drawable.row_bg);
        View cursor = view.findViewById(R.id.cursor);
        if (cursor != null) cursor.setVisibility(View.INVISIBLE);
    }

    private final class Voices extends BaseAdapter {
        @Override public int getCount() { return Adhan.VOICES; }
        @Override public Object getItem(int position) { return position + 1; }
        @Override public long getItemId(int position) { return position; }

        @Override public View getView(int position, View convertView, ViewGroup parent) {
            View view = convertView != null ? convertView
                    : LayoutInflater.from(parent.getContext()).inflate(R.layout.item_row, parent, false);
            resetRow(view);
            int voice = position + 1;
            TextView name = view.findViewById(R.id.name);
            TextView detail = view.findViewById(R.id.detail);
            name.setText(Adhan.name(voice));
            name.setTypeface(Ui.font(AdhanActivity.this, "Thmanyah-Medium.otf"));
            boolean chosen = voice == prefs.voice();
            detail.setText(chosen
                    ? getString(R.string.adhan_chosen, Adhan.place(voice))
                    : Adhan.place(voice));
            detail.setTypeface(Ui.font(AdhanActivity.this, "Thmanyah-Light.otf"));
            detail.setTextColor(getResources().getColor(chosen ? R.color.gold : R.color.dim));
            return view;
        }
    }
}
