"""optimize/run.sh: one run at a time, and a last line that says how it ended. A stub tv.py and stub steps, no TV needed.

    python3 tests/run_lock_test.py

Each case copies run.sh into a scratch tree whose steps are stubs (a step named in FAIL_AT fails, one named in SLOW_AT
waits for a file), then checks what run.sh printed last and how the lock file behaved.
"""
import os, shutil, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

STUB_PY = '#!/usr/bin/env bash\n[ "$2" = optimize/tv.py ] || exit 0\nshift 2\ncase "$1" in\n  "getprop ro.serialno") echo 0123456789 ;;\nesac\nexit 0\n'


def tree(slow=False, fail=""):
    t = Path(tempfile.mkdtemp())
    (t / "optimize" / "lists").mkdir(parents=True); (t / "bin").mkdir()
    shutil.copy(ROOT / "optimize" / "run.sh", t / "optimize")
    (t / "optimize" / "lists" / "tcl-safe.txt").write_text("# none\n")
    (t / "bin" / "py").write_text(STUB_PY); (t / "bin" / "py").chmod(0o755)
    for step in ("precheck", "autostart", "backup", "keep", "measure", "disable", "tweaks", "install", "dock"):
        body = "#!/usr/bin/env bash\n"
        if step == "backup": body += "echo x > optimize/backup-1.txt\n"
        if step == "measure": body += "echo '| ok |' >> optimize/run/summary.md\n"
        if step == "keep" and slow: body += 'while [ ! -f "$GO" ]; do sleep 0.1; done\n'   # holds the first run here
        if step == fail: body += "exit 3\n"
        (t / "optimize" / f"{step}.sh").write_text(body); (t / "optimize" / f"{step}.sh").chmod(0o755)
    (t / "optimize" / "check-packages.py").write_text("")
    return t


def env(t, **extra):
    return dict(os.environ, PY=str(t / "bin" / "py"), TV_HOST="1.2.3.4", GO=str(t / "go"), **extra)


def run(t, *args, **kw):
    r = subprocess.run(["bash", str(t / "optimize" / "run.sh"), *args], cwd=t, env=env(t), capture_output=True, text=True, **kw)
    return r.returncode, (r.stdout + r.stderr).strip().splitlines()


results = []

# a finished run ends with "run.sh: done" and leaves no lock behind
t = tree()
code, out = run(t)
results.append(("finished run: last line is «run.sh: done», no lock left",
                code == 0 and out[-1] == "run.sh: done" and not (t / "optimize/run/.lock").exists(), out[-3:]))

# a step that fails: the last line names it and says to run again; the lock is released
t = tree(fail="keep")
code, out = run(t)
results.append(("failed step: «stopped at keep, run the same command again»",
                code == 3 and out[-1] == "run.sh: stopped at keep, run the same command again"
                and not (t / "optimize/run/.lock").exists(), out[-3:]))

# not an Android TV: the first step stops the run with its own last line (nothing else was touched)
t = tree(fail="precheck")
code, out = run(t)
results.append(("precheck says «not an Android TV»: stops there, no later step ran",
                code == 3 and out[-1].startswith("run.sh: stopped at precheck: this device is not an Android TV")
                and not (t / "optimize/run/.done-probe").exists() and not (t / "optimize/run/.done-precheck").exists()
                and not (t / "optimize/run/.lock").exists(), out[-3:]))

# a second run while the first is alive is refused, and the first one's marks are left alone
t = tree(slow=True)
first = subprocess.Popen(["bash", str(t / "optimize" / "run.sh")], cwd=t, env=env(t), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    if (t / "optimize/run/.done-backup").exists(): break
    time.sleep(0.1)
marks = sorted(p.name for p in (t / "optimize/run").glob(".done-*"))
code, out = run(t)
again_code, again_out = run(t, "again")
still = sorted(p.name for p in (t / "optimize/run").glob(".done-*"))
(t / "go").write_text("")
first.wait(timeout=60)
results.append(("second run while the first works: refused, marks untouched, first still ends «done»",
                code == 1 and "not started: another run" in out[0] and f"process {first.pid}" in out[0]
                and again_code == 1 and marks == still and marks and first.returncode == 0
                and not (t / "optimize/run/.lock").exists(), (code, out, again_code, marks, still, first.returncode)))

# a lock whose process is gone is taken over
t = tree()
(t / "optimize/run").mkdir()
gone = subprocess.Popen(["true"]); gone.wait()
(t / "optimize/run/.lock").write_text(f"{gone.pid}\n")
code, out = run(t)
results.append(("stale lock: taken over, run goes through",
                code == 0 and out[-1] == "run.sh: done" and any("taken over" in l for l in out), out[:3]))

# status never needs the lock
t = tree()
(t / "optimize/run").mkdir()
(t / "optimize/run/.lock").write_text(f"{os.getpid()}\n")
code, out = run(t, "status")
results.append(("status while locked: still answers", code == 0 and out and out[-1].startswith(("·", "✓")), out[-2:]))

for name, ok, info in results:
    print(f"run.sh: {name}: " + ("ok" if ok else f"WRONG {info}"))
sys.exit(0 if all(ok for _, ok, _ in results) else 1)
