package sa.urtv.home.tilawah;

import android.content.Context;

import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/**
 * What the home screen's greeting needs from the prayer times (PrayerTimes stays private to this package): the
 * moments of Fajr, Dhuhr, Asr and Isha today, and the next sunrise or sunset. The same numbers as the adhan.
 */
public final class DayParts {
    /** Fajr, Dhuhr, Asr and Isha today, in epoch millis */
    public final long fajr, dhuhr, asr, isha;
    /** «الغروب» until Maghrib, then «الشروق» (the coming one); sunClock is "17:57" in the city's time */
    public final String sunLabel, sunClock;

    private DayParts(long fajr, long dhuhr, long asr, long isha, String sunLabel, String sunClock) {
        this.fajr = fajr; this.dhuhr = dhuhr; this.asr = asr; this.isha = isha;
        this.sunLabel = sunLabel; this.sunClock = sunClock;
    }

    public static DayParts now(Context c) {
        PrayerTimes t = PrayerTimes.today(c);
        long now = System.currentTimeMillis();
        String label, clock;
        if (now < t.at[PrayerTimes.SUNRISE]) {            // before dawn: today's sunrise is next
            label = "الشروق"; clock = t.clock[PrayerTimes.SUNRISE];
        } else if (now < t.at[PrayerTimes.MAGHRIB]) {
            label = "الغروب"; clock = t.clock[PrayerTimes.MAGHRIB];
        } else {                                          // after sunset: tomorrow's sunrise
            Place place = Place.get(c);
            Calendar tomorrow = Calendar.getInstance(TimeZone.getTimeZone(place.tz), Locale.US);
            tomorrow.add(Calendar.DAY_OF_MONTH, 1);
            label = "الشروق"; clock = PrayerTimes.of(tomorrow, place).clock[PrayerTimes.SUNRISE];
        }
        return new DayParts(t.at[PrayerTimes.FAJR], t.at[PrayerTimes.DHUHR], t.at[PrayerTimes.ASR],
                t.at[PrayerTimes.ISHA], label, clock);
    }
}
