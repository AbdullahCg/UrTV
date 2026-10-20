package sa.urtv.listening;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/** The home screen: continue, then the ten reciters, then the live streams. */
public class MainActivity extends Activity {

    private static final int KIND_RESUME = 0, KIND_RECITER = 1, KIND_STATION = 2;

    private Catalog cat;
    private ListView list;
    private RowsAdapter adapter;
    private View lastSelected;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        cat = Catalog.get(this);

        Ui.text((TextView) findViewById(R.id.title), "ThmanyahDisplay-Bold.otf", 44, R.color.sand);
        Ui.text((TextView) findViewById(R.id.tagline), "Thmanyah-Regular.otf", 17, R.color.dim);
        Ui.text((TextView) findViewById(R.id.hint), "Thmanyah-Light.otf", 13, R.color.dim);

        list = findViewById(R.id.list);
        adapter = new RowsAdapter();
        list.setAdapter(adapter);
        list.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                if (position >= 0 && position < adapter.rows.size() && !adapter.rows.get(position).header) {
                    highlight(view);
                }
            }
            @Override public void onNothingSelected(AdapterView<?> parent) { }
        });
        list.setOnItemClickListener((parent, view, position, id) -> {
            Row row = adapter.rows.get(position);
            if (row.kind == KIND_RESUME) {
                MusicService.resumeLast(this);
                openPlayer();
            } else if (row.kind == KIND_RECITER) {
                startActivity(new Intent(this, SurahActivity.class).putExtra("reciter", row.index));
            } else if (row.kind == KIND_STATION) {
                MusicService.playRadio(this, row.index);
                openPlayer();
            }
        });

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        int first = list.getFirstVisiblePosition();
        adapter.rebuild();
        int target = first <= 1 ? 0 : Math.min(first, adapter.getCount() - 1);
        while (target < adapter.getCount() && adapter.rows.get(target).header) target++;
        if (target >= adapter.getCount()) target = 0;
        focusList(target);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && list != null) {
            focusList(Math.max(0, list.getSelectedItemPosition()));
        }
    }

    private void focusList(int position) {
        list.setSelection(position);
        list.post(() -> {
            list.requestFocus();
            int selected = list.getSelectedItemPosition();
            if (selected >= 0 && selected < adapter.rows.size() && !adapter.rows.get(selected).header) {
                highlight(list.getSelectedView());
            }
        });
    }

    /** The TV is far away: the selected row gets a solid gold frame and a chevron, not just a hairline. */
    private void highlight(View view) {
        if (lastSelected != null && lastSelected != view) resetRow(lastSelected);
        if (view == null) {
            lastSelected = null;
            return;
        }
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

    private void openPlayer() {
        startActivity(new Intent(this, PlayerActivity.class));
    }

    private static final class Row {
        final boolean header;
        final int kind, index;
        final String title, detail;
        Row(boolean header, int kind, String title, String detail, int index) {
            this.header = header; this.kind = kind; this.title = title; this.detail = detail; this.index = index;
        }
        static Row header(String title) { return new Row(true, -1, title, null, -1); }
    }

    private final class RowsAdapter extends BaseAdapter {
        final List<Row> rows = new ArrayList<>();

        void rebuild() {
            rows.clear();
            Prefs prefs = new Prefs(MainActivity.this);
            int source = prefs.source();
            if (source == Prefs.SOURCE_SURAH) {
                int index = cat.reciterIndex(prefs.reciter());
                if (index >= 0) {
                    rows.add(new Row(false, KIND_RESUME, getString(R.string.continue_listening),
                            getString(R.string.continue_detail,
                                    cat.surahName(prefs.surah()), cat.reciters.get(index).name), index));
                }
            } else if (source == Prefs.SOURCE_RADIO && prefs.station() < cat.stations.size()) {
                rows.add(new Row(false, KIND_RESUME, getString(R.string.continue_listening),
                        cat.stations.get(prefs.station()).name, -1));
            }
            rows.add(Row.header(getString(R.string.reciters)));
            for (int i = 0; i < cat.reciters.size(); i++) {
                Catalog.Reciter reciter = cat.reciters.get(i);
                rows.add(new Row(false, KIND_RECITER, reciter.name,
                        getString(R.string.surah_count, Ui.arabic(reciter.surahs)), i));
            }
            rows.add(Row.header(getString(R.string.stations)));
            for (int i = 0; i < cat.stations.size(); i++) {
                rows.add(new Row(false, KIND_STATION, cat.stations.get(i).name, getString(R.string.live), i));
            }
            notifyDataSetChanged();
        }

        @Override public int getCount() { return rows.size(); }
        @Override public Object getItem(int position) { return rows.get(position); }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean areAllItemsEnabled() { return false; }
        @Override public boolean isEnabled(int position) { return !rows.get(position).header; }
        @Override public int getViewTypeCount() { return 2; }
        @Override public int getItemViewType(int position) { return rows.get(position).header ? 0 : 1; }

        @Override public View getView(int position, View convertView, ViewGroup parent) {
            Row row = rows.get(position);
            LayoutInflater inflater = LayoutInflater.from(parent.getContext());
            if (row.header) {
                TextView header = (TextView) (convertView != null ? convertView
                        : inflater.inflate(R.layout.item_header, parent, false));
                header.setText(row.title);
                header.setTypeface(Ui.font(MainActivity.this, "Thmanyah-Medium.otf"));
                return header;
            }
            View view = convertView != null ? convertView : inflater.inflate(R.layout.item_row, parent, false);
            resetRow(view);
            TextView name = view.findViewById(R.id.name);
            TextView detail = view.findViewById(R.id.detail);
            name.setText(row.title);
            detail.setText(row.detail);
            name.setTypeface(Ui.font(MainActivity.this, "Thmanyah-Medium.otf"));
            detail.setTypeface(Ui.font(MainActivity.this, "Thmanyah-Light.otf"));
            return view;
        }
    }
}
