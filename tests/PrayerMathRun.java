package sa.urtv.home.tilawah;

import java.time.Instant;
import java.util.Calendar;
import java.util.TimeZone;

/** For tests/prayer_math_test.py: PrayerMath.java (the times and their cache keys) on a plain JVM. Prints PASS/FAIL lines. */
public final class PrayerMathRun {
    static int failed;

    static void check(String name, boolean ok, String detail) {
        System.out.println((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + detail));
        if (!ok) failed++;
    }

    static String hm(long at, String tz) { return PrayerMath.clockOf(at, tz); }

    public static void main(String[] args) {
        // Riyadh, 23 October 2026: the five times come in order and Isha is 90 minutes after Maghrib
        long[] r = PrayerMath.compute(2026, 10, 23, 24.6877, 46.7219, "Asia/Riyadh", false);
        boolean ordered = true;
        for (int i = 1; i < 6; i++) ordered &= r[i] > r[i - 1];
        check("Riyadh: fajr < sunrise < dhuhr < asr < maghrib < isha", ordered, java.util.Arrays.toString(r));
        check("Riyadh: Fajr 04:3x, Dhuhr 11:2x-11:3x, Maghrib 17:0x-17:1x", hm(r[0], "Asia/Riyadh").startsWith("04:") && hm(r[2], "Asia/Riyadh").startsWith("11:")
                && hm(r[4], "Asia/Riyadh").startsWith("17:"), hm(r[0], "Asia/Riyadh") + " " + hm(r[2], "Asia/Riyadh") + " " + hm(r[4], "Asia/Riyadh"));
        check("Riyadh: Isha is Maghrib + 90 minutes", r[5] - r[4] == 90 * 60_000L, String.valueOf(r[5] - r[4]));
        long[] ram = PrayerMath.compute(2026, 10, 23, 24.6877, 46.7219, "Asia/Riyadh", true);
        check("Ramadan: Isha is Maghrib + 120 minutes", ram[5] - ram[4] == 120 * 60_000L, String.valueOf(ram[5] - ram[4]));

        // Oslo, midsummer: Maghrib at 22:4x, so Isha is after midnight: the next day's, not 00:1x of the day that began 24 hours before
        long[] o = PrayerMath.compute(2026, 6, 21, 59.91, 10.75, "Europe/Oslo", false);
        long day0 = PrayerMath.midnight(2026, 6, 21, "Europe/Oslo");
        check("Oslo midsummer: Maghrib is late evening", o[4] - day0 > 22 * 3600_000L && o[4] - day0 < 24 * 3600_000L, hm(o[4], "Europe/Oslo"));
        check("Oslo midsummer: Isha is after Maghrib, past midnight, a day-1 moment (not wrapped back into the morning)",
                o[5] > o[4] && o[5] - o[4] == 90 * 60_000L && o[5] - day0 >= 24 * 3600_000L, hm(o[5], "Europe/Oslo") + " +" + (o[5] - day0) / 60000 + " min");
        check("Oslo midsummer: its clock reads 00:xx", hm(o[5], "Europe/Oslo").startsWith("00:"), hm(o[5], "Europe/Oslo"));

        // the cache key and Aladhan's date go by the city's zone and name the city
        long t = Instant.parse("2026-10-23T21:30:00Z").toEpochMilli();   // Saturday 00:30 in Riyadh, Friday evening in New York
        check("key: Riyadh's date, not the TV's", PrayerMath.key(t, 24.6877, 46.7219, "Asia/Riyadh").startsWith("times_20261024_"), PrayerMath.key(t, 24.6877, 46.7219, "Asia/Riyadh"));
        check("key: New York's date", PrayerMath.key(t, 40.71, -74.0, "America/New_York").startsWith("times_20261023_"), PrayerMath.key(t, 40.71, -74.0, "America/New_York"));
        check("key: another city the same day is another key", !PrayerMath.key(t, 24.6877, 46.7219, "Asia/Riyadh").equals(PrayerMath.key(t, 21.4858, 39.1925, "Asia/Riyadh")), "same");
        check("key: the same city is the same key", PrayerMath.key(t, 24.6877, 46.7219, "Asia/Riyadh").equals(PrayerMath.key(t + 3600_000L, 24.6877, 46.7219, "Asia/Riyadh")), "differs");
        check("key: the same instant in another zone of the same place is another key", !PrayerMath.key(t, 24.6877, 46.7219, "Asia/Riyadh").equals(PrayerMath.key(t, 24.6877, 46.7219, "Asia/Kuwait")), "same");
        check("Aladhan's date is the city's day: 24-10-2026 for Riyadh, 23-10-2026 for New York",
                PrayerMath.aladhanDate(t, "Asia/Riyadh").equals("24-10-2026") && PrayerMath.aladhanDate(t, "America/New_York").equals("23-10-2026"),
                PrayerMath.aladhanDate(t, "Asia/Riyadh") + " " + PrayerMath.aladhanDate(t, "America/New_York"));
        TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Auckland"));   // the TV's own zone must not leak in
        check("key and date ignore the machine's zone", PrayerMath.aladhanDate(t, "Asia/Riyadh").equals("24-10-2026")
                && PrayerMath.key(t, 24.6877, 46.7219, "Asia/Riyadh").startsWith("times_20261024_"), PrayerMath.aladhanDate(t, "Asia/Riyadh"));

        // Aladhan's «5:12 (+03)» must not crash the receiver
        check("parse: 05:12", ok(PrayerMath.parseClock("05:12"), 5, 12), "");
        check("parse: 5:12", ok(PrayerMath.parseClock("5:12"), 5, 12), "");
        check("parse: «5:12 (+03)»", ok(PrayerMath.parseClock("5:12 (+03)"), 5, 12), "");
        check("parse: «17:42 (AST)»", ok(PrayerMath.parseClock("17:42 (AST)"), 17, 42), "");
        check("parse: not a time -> null, no exception", PrayerMath.parseClock("--") == null && PrayerMath.parseClock("") == null
                && PrayerMath.parseClock(null) == null && PrayerMath.parseClock("24:00") == null && PrayerMath.parseClock("12:7") == null && PrayerMath.parseClock("x5:12") == null, "");
        System.exit(failed == 0 ? 0 : 1);
    }

    static boolean ok(int[] hm, int h, int m) { return hm != null && hm[0] == h && hm[1] == m; }
}
