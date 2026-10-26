package sa.urtv.screensaver;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/** Refreshes important fixtures in the background so their local kickoff alarms are ready. */
public final class MatchReminderJob extends JobService {
    private static final int REFRESH_ID = 2;
    private static final int PERIODIC_ID = 3;

    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (js.getPendingJob(PERIODIC_ID) == null) {
            js.schedule(new JobInfo.Builder(PERIODIC_ID, new ComponentName(c, MatchReminderJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(6 * 60 * 60 * 1000L)
                    .setPersisted(true)
                    .build());
        }
        if (js.getPendingJob(REFRESH_ID) == null) {
            js.schedule(new JobInfo.Builder(REFRESH_ID, new ComponentName(c, MatchReminderJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setMinimumLatency(1000)
                    .setOverrideDeadline(60 * 1000)
                    .build());
        }
    }

    @Override public boolean onStartJob(JobParameters params) {
        if (!new Prefs(this).matchAlerts()) return false;
        new Thread(() -> {
            try { ImportantMatches.refresh(getApplicationContext()); }
            finally { jobFinished(params, false); }
        }, "urtv-match-reminders").start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) { return true; }
}
