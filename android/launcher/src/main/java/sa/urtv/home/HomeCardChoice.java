package sa.urtv.home;

/**
 * Which page the home card shows, from what the screensaver's settings say now and what this app last read from them.
 * Plain Java (no Android classes) so tests/home_card_test.py can run it.
 */
final class HomeCardChoice {
    static final String BASE = "file:///android_asset/web/tv.html#";
    static final String PRAYERS = BASE + "panel=prayers&widget=1";

    private HomeCardChoice() { }

    /**
     * The settings to use as {fragment, panel}: the ones just read (both non-null), else the last ones read
     * successfully, else null (nothing known).
     */
    static String[] pick(String frag, String panel, String savedFrag, String savedPanel) {
        if (frag != null && panel != null) return new String[] { frag, panel };
        if (savedFrag != null && savedPanel != null) return new String[] { savedFrag, savedPanel };
        return null;
    }

    /** The card's page for a pick: null when the user turned the card off («بدون»), the prayers when nothing is known. */
    static String url(String[] choice) {
        if (choice == null) return PRAYERS;
        if ("none".equals(choice[1])) return null;
        String frag = choice[0].replaceAll("(^|&)(panel|week)=[^&]*", "");   // the screensaver's own card choice
        return BASE + frag + "&panel=" + choice[1] + "&widget=1";
    }
}
