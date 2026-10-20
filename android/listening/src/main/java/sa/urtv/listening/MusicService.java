package sa.urtv.listening;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import java.util.Locale;

/**
 * Plays a surah or a live stream, keeps playing when the screensaver starts, and answers the
 * remote's media keys through a MediaSession. State is static because the screens read it too
 * (same process); the service owns the player and updates it.
 */
public class MusicService extends Service implements AudioManager.OnAudioFocusChangeListener {

    private static final String TAG = "Listening";
    private static final String CHANNEL = "playback";
    private static final int NOTIF = 41;

    static final String ACTION_PLAY_SURAH = "sa.urtv.listening.PLAY_SURAH";
    static final String ACTION_PLAY_RADIO = "sa.urtv.listening.PLAY_RADIO";
    static final String ACTION_PAUSE = "sa.urtv.listening.PAUSE";
    static final String ACTION_RESUME = "sa.urtv.listening.RESUME";
    static final String ACTION_TOGGLE = "sa.urtv.listening.TOGGLE";
    static final String ACTION_NEXT = "sa.urtv.listening.NEXT";
    static final String ACTION_PREV = "sa.urtv.listening.PREV";
    static final String ACTION_STOP = "sa.urtv.listening.STOP";
    static final String ACTION_SLEEP = "sa.urtv.listening.SLEEP";
    static final String ACTION_SEEK_BY = "sa.urtv.listening.SEEK_BY";

    static final String EXTRA_RECITER = "reciter";
    static final String EXTRA_SURAH = "surah";
    static final String EXTRA_STATION = "station";
    static final String EXTRA_MINUTES = "minutes";
    static final String EXTRA_DELTA = "delta";

    private static volatile int source = Prefs.SOURCE_NONE;
    private static volatile boolean playing, buffering, prepared;
    private static volatile int reciter = -1, surah = 1, station = -1;
    private static volatile int position, duration;
    private static volatile String error;
    private static volatile long sleepUntil;

    private Catalog cat;
    private Prefs prefs;
    private MediaPlayer player;
    private MediaSession session;
    private AudioManager audio;
    private WifiManager.WifiLock wifi;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean foregroundStarted;
    private boolean resumeOnFocus;
    private int retries;
    private int pendingSeek;
    private int tickCount;
    private int fadeStep;
    private String currentUrl;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player != null && prepared) {
                try {
                    position = player.getCurrentPosition();
                    int d = player.getDuration();
                    if (d > 0) duration = d;
                    if (playing && ++tickCount % 5 == 0) save();
                    updateSession();
                } catch (IllegalStateException ignored) {}
            }
            handler.postDelayed(this, 1000);
        }
    };

    private final Runnable sleepStart = new Runnable() {
        @Override public void run() { fadeStep = 0; fadeOut(); }
    };

    // ---- state for the screens and optimize/music.sh ----
    static int currentSource() { return source; }
    static boolean isPlaying() { return playing; }
    static boolean isBuffering() { return buffering; }
    static int reciterIndex() { return reciter; }
    static int currentSurah() { return surah; }
    static int currentStation() { return station; }
    static int currentPosition() { return position; }
    static int currentDuration() { return duration; }
    static String currentError() { return error; }
    static long sleepAt() { return sleepUntil; }

    // ---- starting it from an activity or the receiver ----
    static void start(Context c, Intent intent) {
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(intent); else c.startService(intent);
    }

    private static Intent intent(Context c, String action) {
        return new Intent(c, MusicService.class).setAction(action);
    }

    static void playSurah(Context c, String reciterId, int surah) {
        start(c, intent(c, ACTION_PLAY_SURAH).putExtra(EXTRA_RECITER, reciterId).putExtra(EXTRA_SURAH, surah));
    }

    static void playRadio(Context c, int index) {
        start(c, intent(c, ACTION_PLAY_RADIO).putExtra(EXTRA_STATION, index));
    }

    static void resumeLast(Context c) { start(c, intent(c, ACTION_RESUME)); }
    static void pause(Context c) { start(c, intent(c, ACTION_PAUSE)); }
    static void resume(Context c) { start(c, intent(c, ACTION_RESUME)); }
    static void toggle(Context c) { start(c, intent(c, ACTION_TOGGLE)); }
    static void nextAction(Context c) { start(c, intent(c, ACTION_NEXT)); }
    static void prevAction(Context c) { start(c, intent(c, ACTION_PREV)); }
    static void stopAction(Context c) { start(c, intent(c, ACTION_STOP)); }
    static void sleep(Context c, int minutes) { start(c, intent(c, ACTION_SLEEP).putExtra(EXTRA_MINUTES, minutes)); }
    static void seekBy(Context c, int delta) { start(c, intent(c, ACTION_SEEK_BY).putExtra(EXTRA_DELTA, delta)); }

    @Override public void onCreate() {
        super.onCreate();
        cat = Catalog.get(this);
        prefs = new Prefs(this);
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        createChannel();
        session = new MediaSession(this, "urtv-listening");
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(); }
            @Override public void onSkipToNext() { next(); }
            @Override public void onSkipToPrevious() { prev(); }
            @Override public void onStop() { stopPlayback(); }
            @Override public void onSeekTo(long pos) { seekTo((int) pos); }
        });
        session.setActive(true);
        handler.post(tick);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (action == null) { stopSelf(); return START_NOT_STICKY; }

        // every entry point may come from startForegroundService(): be foreground within 5 s
        foreground();

        switch (action) {
            case ACTION_PLAY_SURAH:
                playSurahById(intent.getStringExtra(EXTRA_RECITER), intent.getIntExtra(EXTRA_SURAH, 1), 0);
                break;
            case ACTION_PLAY_RADIO:
                playRadio(intent.getIntExtra(EXTRA_STATION, 0));
                break;
            case ACTION_PAUSE: pause(); break;
            case ACTION_RESUME: resume(); break;
            case ACTION_TOGGLE: toggle(); break;
            case ACTION_NEXT: next(); break;
            case ACTION_PREV: prev(); break;
            case ACTION_SEEK_BY: seekBy(intent.getIntExtra(EXTRA_DELTA, 0)); break;
            case ACTION_SLEEP: setSleep(intent.getIntExtra(EXTRA_MINUTES, 0)); break;
            case ACTION_STOP: stopPlayback(); break;
            default: break;
        }
        return START_NOT_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        releasePlayer();
        abandonFocus();
        if (session != null) { session.release(); session = null; }
        super.onDestroy();
    }

    // ---- playing ----

    private void playSurahById(String id, int n, int startAt) {
        int index = id == null ? -1 : cat.reciterIndex(id);
        if (index < 0) {
            error = getString(R.string.no_connection);
            updateSession();
            updateNotification();
            return;
        }
        playSurah(index, n, startAt);
    }

    private void playSurah(int index, int n, int startAt) {
        if (index < 0 || index >= cat.reciters.size()) return;
        Catalog.Reciter r = cat.reciters.get(index);
        if (n < 1) n = 1;
        if (n > r.surahs) n = r.surahs;
        source = Prefs.SOURCE_SURAH;
        reciter = index;
        surah = n;
        station = -1;
        retries = 0;
        pendingSeek = Math.max(0, startAt);
        prefs.save(source, r.id, surah, station, pendingSeek);
        startUrl(r.server + String.format(Locale.US, "%03d", n) + ".mp3");
    }

    private void playRadio(int index) {
        if (index < 0 || index >= cat.stations.size()) return;
        source = Prefs.SOURCE_RADIO;
        station = index;
        reciter = -1;
        surah = 1;
        retries = 0;
        pendingSeek = 0;
        prefs.save(source, "", surah, station, 0);
        startUrl(cat.stations.get(index).url);
    }

    private void startUrl(String url) {
        releasePlayer();
        currentUrl = url;
        error = null;
        buffering = true;
        playing = false;
        prepared = false;
        position = 0;
        duration = 0;
        foreground();

        player = new MediaPlayer();
        player.setAudioStreamType(AudioManager.STREAM_MUSIC);
        player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
        player.setVolume(1f, 1f);
        player.setOnPreparedListener(mp -> {
            prepared = true;
            buffering = false;
            retries = 0;
            error = null;
            if (requestFocus()) {
                if (pendingSeek > 0) {
                    try { mp.seekTo(pendingSeek); } catch (IllegalStateException ignored) {}
                    position = pendingSeek;
                    pendingSeek = 0;
                }
                mp.start();
                playing = true;
                acquireWifi();
            } else {
                error = "الصوت مشغول";
            }
            updateSession();
            updateNotification();
        });
        player.setOnCompletionListener(mp -> {
            if (source == Prefs.SOURCE_SURAH) next();
            else { playing = false; updateSession(); updateNotification(); }
        });
        player.setOnErrorListener((mp, what, extra) -> { onPlaybackError(); return true; });
        try {
            player.setDataSource(url);
            player.prepareAsync();
        } catch (Exception e) {
            Log.w(TAG, "cannot play " + url, e);
            onPlaybackError();
        }
        updateSession();
        updateNotification();
    }

    private void onPlaybackError() {
        playing = false;
        buffering = false;
        prepared = false;
        if (source == Prefs.SOURCE_SURAH && position > 0) pendingSeek = position;
        final String failed = currentUrl;
        if (failed != null && retries < 2) {
            retries++;
            error = getString(R.string.retrying);
            updateSession();
            updateNotification();
            handler.postDelayed(() -> {
                if (failed.equals(currentUrl) && !playing) startUrl(failed);
            }, 3000);
        } else {
            error = getString(R.string.no_connection);
            updateSession();
            updateNotification();
            save();
        }
    }

    private void playSurahAgain(int index, int n) { playSurah(index, n, 0); }

    void next() {
        if (source == Prefs.SOURCE_SURAH && reciter >= 0) {
            int total = cat.reciters.get(reciter).surahs;
            playSurahAgain(reciter, surah >= total ? 1 : surah + 1);
        } else if (source == Prefs.SOURCE_RADIO && station >= 0) {
            playRadio((station + 1) % cat.stations.size());
        } else {
            resumeLastInternal();
        }
    }

    void prev() {
        if (source == Prefs.SOURCE_SURAH && reciter >= 0) {
            if (position > 5000) { seekTo(0); return; }
            int total = cat.reciters.get(reciter).surahs;
            playSurahAgain(reciter, surah <= 1 ? total : surah - 1);
        } else if (source == Prefs.SOURCE_RADIO && station >= 0) {
            playRadio((station - 1 + cat.stations.size()) % cat.stations.size());
        }
    }

    void seekTo(int ms) {
        if (source != Prefs.SOURCE_SURAH || player == null || !prepared) return;
        if (ms < 0) ms = 0;
        if (duration > 0 && ms > duration) ms = duration;
        try { player.seekTo(ms); } catch (IllegalStateException ignored) {}
        position = ms;
        updateSession();
    }

    void seekBy(int delta) {
        if (source == Prefs.SOURCE_SURAH) seekTo(position + delta);
        else if (delta > 0) next();
        else if (delta < 0) prev();
    }

    void toggle() {
        if (player == null) { resumeLastInternal(); return; }
        if (playing) pause(); else resume();
    }

    void pause() {
        if (player != null && playing) {
            player.pause();
            playing = false;
            resumeOnFocus = false;
            abandonFocus();
            save();
            updateSession();
            updateNotification();
        }
    }

    void resume() {
        if (player == null) { resumeLastInternal(); return; }
        if (!prepared) return;
        if (requestFocus()) {
            player.start();
            playing = true;
            error = null;
            acquireWifi();
            updateSession();
            updateNotification();
        }
    }

    private void resumeLastInternal() {
        int last = prefs.source();
        if (last == Prefs.SOURCE_SURAH) {
            playSurahById(prefs.reciter(), prefs.surah(), prefs.position());
        } else if (last == Prefs.SOURCE_RADIO) {
            playRadio(prefs.station());
        } else if (!cat.reciters.isEmpty()) {
            playSurah(0, 1, 0);
        }
    }

    void stopPlayback() {
        save();
        releasePlayer();
        playing = false;
        buffering = false;
        prepared = false;
        position = 0;
        duration = 0;
        error = null;
        source = Prefs.SOURCE_NONE;
        handler.removeCallbacks(sleepStart);
        sleepUntil = 0;
        foregroundStarted = false;
        stopForeground(true);
        if (session != null) {
            session.setPlaybackState(new PlaybackState.Builder()
                    .setState(PlaybackState.STATE_NONE, 0, 0f).build());
        }
        stopSelf();
    }

    private void releasePlayer() {
        if (player != null) {
            try { player.reset(); } catch (Exception ignored) {}
            try { player.release(); } catch (Exception ignored) {}
            player = null;
        }
        releaseWifi();
    }

    private void save() {
        String id = reciter >= 0 && reciter < cat.reciters.size() ? cat.reciters.get(reciter).id : "";
        prefs.save(source, id, surah, station, position);
    }

    // ---- sleep timer: a 15-second gentle fade, then stop ----

    void setSleep(int minutes) {
        handler.removeCallbacks(sleepStart);
        if (minutes <= 0) {
            sleepUntil = 0;
            updateSession();
            updateNotification();
            return;
        }
        sleepUntil = System.currentTimeMillis() + minutes * 60_000L;
        handler.postDelayed(sleepStart, minutes * 60_000L);
        updateSession();
        updateNotification();
    }

    private void fadeOut() {
        if (player == null || !playing) { sleepUntil = 0; stopPlayback(); return; }
        fadeStep++;
        float volume = Math.max(0f, 1f - fadeStep / 30f);
        try { player.setVolume(volume, volume); } catch (IllegalStateException ignored) {}
        if (fadeStep < 30) handler.postDelayed(this::fadeOut, 500);
        else { sleepUntil = 0; stopPlayback(); }
    }

    // ---- audio focus ----

    private boolean requestFocus() {
        return audio.requestAudioFocus(this, AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonFocus() {
        if (audio != null) audio.abandonAudioFocus(this);
    }

    @Override public void onAudioFocusChange(int change) {
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            if (player != null && playing) {
                player.pause();
                playing = false;
                resumeOnFocus = true;
                save();
                updateSession();
                updateNotification();
            }
        } else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            if (player != null) player.setVolume(0.2f, 0.2f);
        } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
            if (player != null) player.setVolume(1f, 1f);
            if (resumeOnFocus && player != null && prepared && !playing) {
                player.start();
                playing = true;
                resumeOnFocus = false;
                updateSession();
                updateNotification();
            }
        }
    }

    // ---- MediaSession + notification ----

    private void updateSession() {
        if (session == null) return;
        String title = "استماع", artist = "";
        if (source == Prefs.SOURCE_SURAH && reciter >= 0 && reciter < cat.reciters.size()) {
            title = "سورة " + cat.surahName(surah);
            artist = cat.reciters.get(reciter).name;
        } else if (source == Prefs.SOURCE_RADIO && station >= 0 && station < cat.stations.size()) {
            title = cat.stations.get(station).name;
            artist = getString(R.string.live);
        }
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, "القرآن الكريم");
        if (source == Prefs.SOURCE_SURAH && duration > 0) {
            meta.putLong(MediaMetadata.METADATA_KEY_DURATION, duration);
        }
        session.setMetadata(meta.build());

        int state = error != null ? PlaybackState.STATE_ERROR
                : buffering ? PlaybackState.STATE_BUFFERING
                : playing ? PlaybackState.STATE_PLAYING
                : prepared ? PlaybackState.STATE_PAUSED
                : PlaybackState.STATE_NONE;
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        if (source == Prefs.SOURCE_SURAH) actions |= PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(state, source == Prefs.SOURCE_RADIO ? 0 : position, playing ? 1f : 0f)
                .build());
        session.setActive(true);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }

    private static int pendingFlags() {
        return PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    private PendingIntent command(String action) {
        return PendingIntent.getService(this, action.hashCode(),
                intent(this, action), pendingFlags());
    }

    private Notification buildNotification() {
        String title = "استماع", text = "";
        if (source == Prefs.SOURCE_SURAH && reciter >= 0 && reciter < cat.reciters.size()) {
            title = "سورة " + cat.surahName(surah);
            text = cat.reciters.get(reciter).name;
        } else if (source == Prefs.SOURCE_RADIO && station >= 0 && station < cat.stations.size()) {
            title = cat.stations.get(station).name;
            text = getString(R.string.live);
        }
        if (error != null) text = error;
        else if (buffering) text = getString(R.string.buffering);

        Intent open = new Intent(this, PlayerActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, pendingFlags());

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_note)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(content)
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(getResources().getColor(R.color.gold))
                .addAction(R.drawable.ic_prev, getString(R.string.previous), command(ACTION_PREV))
                .addAction(playing ? R.drawable.ic_pause : R.drawable.ic_play,
                        getString(R.string.play_pause), command(ACTION_TOGGLE))
                .addAction(R.drawable.ic_next, getString(R.string.next), command(ACTION_NEXT))
                .addAction(R.drawable.ic_stop, getString(R.string.stop), command(ACTION_STOP));
        if (Build.VERSION.SDK_INT >= 21) {
            builder.setStyle(new Notification.MediaStyle()
                    .setMediaSession(session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));
        }
        return builder.build();
    }

    private void foreground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF, notification);
        }
        foregroundStarted = true;
    }

    private void updateNotification() {
        if (!foregroundStarted) return;
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIF, buildNotification());
    }

    // ---- Wi-Fi stays awake while streaming ----

    private void acquireWifi() {
        try {
            if (wifi == null) {
                WifiManager manager = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                if (manager != null) {
                    wifi = manager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "urtv:listening");
                    wifi.setReferenceCounted(false);
                }
            }
            if (wifi != null && !wifi.isHeld()) wifi.acquire();
        } catch (Exception ignored) {}
    }

    private void releaseWifi() {
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) {}
    }
}
