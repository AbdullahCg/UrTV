package sa.urtv.home.tilawah;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * ADB control for agents and optimize/music.sh: GET_PLAYER state, play, pause, next, sleep, and the
 * adhan (play now, switch it on or off, pick the voice).
 */
public class MusicReceiver extends BroadcastReceiver {

    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        if ("sa.urtv.home.GET_PLAYER".equals(action)) {
            setResultData(status(context));
            return;
        }

        Prefs prefs = new Prefs(context);
        switch (action) {
            case "sa.urtv.home.ADHAN":
                MusicService.adhan(context, intent.getIntExtra(MusicService.EXTRA_VOICE, prefs.voice()), null, 0);
                return;
            case "sa.urtv.home.ADHAN_ON":
            case "sa.urtv.home.ADHAN_OFF":
                prefs.setAdhanOn("sa.urtv.home.ADHAN_ON".equals(action));
                AdhanScheduler.schedule(context);
                return;
            case "sa.urtv.home.VOICE": {
                int voice = intent.getIntExtra(MusicService.EXTRA_VOICE, prefs.voice());
                if (voice < 1 || voice > Adhan.VOICES) return;
                prefs.setVoice(voice);
                return;
            }
            default:
                break;
        }

        Catalog cat = Catalog.get(context);
        Intent service = new Intent(context, MusicService.class).setAction(action);
        switch (action) {
            case MusicService.ACTION_PLAY_SURAH:
                service.putExtra(MusicService.EXTRA_RECITER, intent.getStringExtra("reciter"));
                service.putExtra(MusicService.EXTRA_SURAH, intent.getIntExtra("surah", 1));
                break;
            case MusicService.ACTION_PLAY_RADIO: {
                int index = intent.getIntExtra("station", -1);
                String name = intent.getStringExtra("station");
                if (index < 0 && name != null) index = cat.stationIndex(name);
                if (index < 0) return;
                service.putExtra(MusicService.EXTRA_STATION, index);
                break;
            }
            case MusicService.ACTION_SLEEP:
                service.putExtra(MusicService.EXTRA_MINUTES, intent.getIntExtra("minutes", 0));
                break;
            case MusicService.ACTION_SEEK_BY:
                service.putExtra(MusicService.EXTRA_DELTA, intent.getIntExtra("delta", 0));
                break;
            default:
                break;
        }
        MusicService.start(context, service);
    }

    private String status(Context context) {
        Catalog cat = Catalog.get(context);
        Prefs prefs = new Prefs(context);
        int source = MusicService.currentSource();
        boolean playing = MusicService.isPlaying();
        int reciter = MusicService.reciterIndex();
        int surah = MusicService.currentSurah();
        int station = MusicService.currentStation();
        int position = MusicService.currentPosition();
        int duration = MusicService.currentDuration();
        String error = MusicService.currentError();
        long sleepAt = MusicService.sleepAt();

        if (source == Prefs.SOURCE_NONE) {
            source = prefs.source();
            surah = prefs.surah();
            station = prefs.station();
            position = prefs.position();
            reciter = cat.reciterIndex(prefs.reciter());
            duration = 0;
            error = null;
            sleepAt = 0;
        }

        String reciterId = reciter >= 0 && reciter < cat.reciters.size() ? cat.reciters.get(reciter).id : "";
        String reciterName = reciter >= 0 && reciter < cat.reciters.size() ? cat.reciters.get(reciter).name : "";
        String stationName = station >= 0 && station < cat.stations.size() ? cat.stations.get(station).name : "";
        long sleepLeft = sleepAt > 0 ? Math.max(0, (sleepAt - System.currentTimeMillis()) / 1000) : 0;
        PrayerTimes.Next next = PrayerTimes.next(context);

        return "playing=" + (playing ? 1 : 0)
                + "|source=" + (source == Prefs.SOURCE_SURAH ? "surah"
                        : source == Prefs.SOURCE_RADIO ? "radio"
                        : source == Prefs.SOURCE_ADHAN ? "adhan" : "none")
                + "|reciter=" + reciterId
                + "|reciter_name=" + reciterName
                + "|surah=" + (source == Prefs.SOURCE_SURAH ? surah : 0)
                + "|surah_name=" + (source == Prefs.SOURCE_SURAH ? cat.surahName(surah) : "")
                + "|station=" + (source == Prefs.SOURCE_RADIO ? station : -1)
                + "|station_name=" + (source == Prefs.SOURCE_RADIO ? stationName : "")
                + "|pos=" + position
                + "|dur=" + duration
                + "|sleep=" + sleepLeft
                + "|adhan=" + (prefs.adhanOn() ? "on" : "off")
                + "|voice=" + prefs.voice()
                + "|adhan_next=" + (next == null ? 0 : next.at)
                + "|adhan_next_name=" + (next == null ? "" : next.name())
                + "|adhan_next_clock=" + (next == null ? "" : next.clock)
                + "|adhan_last=" + prefs.lastAdhan()
                + "|error=" + (error == null ? "" : error);
    }
}
