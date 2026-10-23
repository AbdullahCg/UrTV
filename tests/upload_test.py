"""optimize/tv.py's APK upload through a flaky fake ADB connection: it drops connections, loses replies after
the command ran, and the upload is killed half way and started again. The file must arrive exactly.

    python3 tests/upload_test.py          (no TV needed; 50 random runs)
"""
import base64, hashlib, os, random, re, sys, tempfile, types

FS = {}
JOB = {}   # name -> {"src", "dst", "left"}: a background job on the TV; it finishes after "left" looks at it
stats = {"drop": 0, "lost": 0, "polls": 0}
J = "/data/local/tmp/urtv-job-"

def job_step(name):
    """One look at a job: running, done or dead. The decode only lands when it is finished, as on a slow TV."""
    j = JOB.get(name)
    if j and j["left"] > 0:
        j["left"] -= 1; stats["polls"] += 1
        return "running %d" % (len(FS.get(j["dst"], b"")) * 100 // 700_000)
    if j:
        FS[j["dst"]] = base64.b64decode(FS[j["src"]]); FS[J + name + ".rc"] = "0"; del JOB[name]
    return "done" if J + name + ".rc" in FS else "dead"

def run(cmd):
    if "nohup sh -c" in cmd:   # start a background job, or join the one still running
        m = re.search(r"\(base64 -d (\S+) > (\S+)\) > " + re.escape(J) + r"(\w+)\.out", cmd)
        src, dst, name = m.groups()
        if name in JOB: return "joined"
        for f in (".rc", ".out"): FS.pop(J + name + f, None)
        JOB[name] = {"src": src, "dst": dst, "left": random.randint(0, 3)}
        return "started"
    m = re.search(r"if grep -q " + re.escape(J) + r"(\w+) ", cmd)
    if m: return job_step(m.group(1))
    m = re.fullmatch(r"cat " + re.escape(J) + r"(\w+)\.rc", cmd)
    if m: return FS[J + m.group(1) + ".rc"]
    m = re.fullmatch(r"cat " + re.escape(J) + r"(\w+)\.out", cmd)
    if m: return ""
    out = []
    for part in [c.strip() for c in cmd.split(";")]:
        m = re.fullmatch(r"echo -n '([^']*)' >> (\S+)", part)
        if m: FS[m.group(2)] = FS.get(m.group(2), "") + m.group(1); continue
        m = re.fullmatch(r"wc -c < (\S+)", part)
        if m: out.append(str(len(FS.get(m.group(1), "")))); continue
        m = re.fullmatch(r"\[ -f (\S+) \] && wc -c < \S+ \|\| echo 0", part)
        if m: out.append(str(len(FS[m.group(1)])) if m.group(1) in FS else "0"); continue
        m = re.fullmatch(r"head -c (\d+) (\S+) > \S+ && mv \S+ \S+", part)
        if m: FS[m.group(2)] = FS[m.group(2)][:int(m.group(1))]; continue
        m = re.fullmatch(r"rm -f (.+)", part)
        if m:
            for f in m.group(1).split(): FS.pop(f, None)
            continue
        m = re.fullmatch(r"\[ -f (\S+) \] && mv (\S+) (\S+)", part)
        if m:
            if m.group(1) in FS: FS[m.group(3)] = FS.pop(m.group(2))
            continue
        m = re.fullmatch(r"\[ -f (\S+) \] && echo y", part)
        if m: out.append("y" if m.group(1) in FS else ""); continue
        m = re.fullmatch(r"\[ -d '(\S+)' \] && echo y", part)
        if m: out.append("y" if m.group(1) == "/data/local/tmp" else ""); continue
        m = re.fullmatch(r"df -h (\S+) \| tail -1", part)
        if m: out.append(m.group(1) + " 4.0G 3.0G 1.0G 75%"); continue
        m = re.fullmatch(r"md5sum (\S+)", part)
        if m:
            v = FS[m.group(1)]
            out.append(hashlib.md5(v if isinstance(v, bytes) else v.encode()).hexdigest() + "  " + m.group(1)); continue
        raise SystemExit("fake: unknown command " + part)
    return "\n".join(out)

class Dev:
    def __init__(self, *a, **k): pass
    def connect(self, **k):
        if random.random() < 0.1: stats["drop"] += 1; raise ConnectionError("refused")
    def shell(self, cmd, read_timeout_s=0):
        if random.random() < 0.08: stats["drop"] += 1; raise ConnectionResetError("dropped before")
        r = run(cmd)
        if random.random() < 0.08: stats["lost"] += 1; raise TimeoutError("reply lost")   # ran, reply lost
        return r
    def close(self): pass

for name in ["adb_shell", "adb_shell.adb_device", "adb_shell.auth", "adb_shell.auth.keygen", "adb_shell.auth.sign_pythonrsa"]:
    sys.modules[name] = types.ModuleType(name)
sys.modules["adb_shell.adb_device"].AdbDeviceTcp = Dev
sys.modules["adb_shell.auth.keygen"].keygen = lambda p: None
sys.modules["adb_shell.auth.sign_pythonrsa"].PythonRSASigner = lambda a, b: None
os.environ["TV_HOST"] = "1.2.3.4"; os.environ["TV_TRIES"] = "6"
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "optimize"))
import tv
tv.time.sleep = lambda s: None
tv.signer = lambda: None

import contextlib, io

def one(seed):
    random.seed(seed)
    FS.clear(); JOB.clear()
    data = os.urandom(700_000)
    src = os.path.join(tempfile.mkdtemp(), "x.apk")
    open(src, "wb").write(data)
    t = tv.TV()
    orig, calls = t.shell, {"n": 0}
    def dying(cmd, timeout=120):   # the process is killed at its 6th call, or (even seeds) at the first look at the decode
        calls["n"] += 1
        if calls["n"] == 6 and seed % 2 or seed % 2 == 0 and "if grep -q" in cmd and not calls.get("polled"):
            calls["polled"] = True
            raise KeyboardInterrupt
        return orig(cmd, timeout)
    t.shell = dying
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        try:
            tv.push_b64(t, src, "/data/local/tmp/x.apk")
        except KeyboardInterrupt:
            pass
        tv.push_b64(tv.TV(), src, "/data/local/tmp/x.apk")   # run again: resumes or restarts
    return FS.get("/data/local/tmp/x.apk") == data

bad = [seed for seed in range(50) if not one(seed)]
print(f"upload: {50 - len(bad)}/50 intact despite {stats['drop']} dropped connections and {stats['lost']} lost replies")
print(f"decode: run in the background and looked at {stats['polls']} times")

# run_bg: a long command is started once, polled with short calls, its output and exit code come back;
# a job that never ends is given up on after the limit; a job that died without an answer is run directly.
class Fake:
    def __init__(self, polls, dead=False): self.polls, self.dead, self.calls = polls, dead, []   # dead: True at once, "later" after a while
    def shell(self, cmd, timeout=120):
        self.calls.append(cmd)
        if "nohup sh -c" in cmd: return "started"
        if cmd.endswith("echo __rc=$?"): return "Success\n__rc=0\n"   # run directly, the old way
        if "if grep -q" in cmd:
            if self.dead == "later" and len([c for c in self.calls if "if grep -q" in c]) > 2: return "dead"
            if self.dead is True: return "dead"
            self.polls -= 1
            return "running" if self.polls > 0 else "done"
        if cmd.startswith("cat") and cmd.endswith(".rc"): return "1\n"
        if cmd.startswith("cat"): return "Failure [INSTALL_FAILED_X]\n"
        return ""
bgbad = []
f = Fake(4)
with contextlib.redirect_stderr(io.StringIO()):
    got = tv.run_bg(f, "install", "pm install -r /data/local/tmp/x.apk")
if got != (1, "Failure [INSTALL_FAILED_X]"): bgbad.append(f"result {got}")
if sum("nohup" in c for c in f.calls) != 1: bgbad.append("started more than once")
if any("pm install" in c and "nohup" not in c for c in f.calls): bgbad.append("ran in the foreground")
# a TV that ends a shell's background jobs when the shell closes: the job is dead at the first look, so it runs directly
f = Fake(5, dead=True)
with contextlib.redirect_stderr(io.StringIO()):
    got = tv.run_bg(f, "install", "pm install -r /data/local/tmp/x.apk")
if got != (0, "Success"): bgbad.append(f"no background jobs: {got}")
if sum(c.endswith("echo __rc=$?") for c in f.calls) != 1: bgbad.append("no background jobs: not run directly once")
# the same TV, but the job lives a few seconds first (a TCL on Android 14): still run directly, once
f = Fake(10**9, dead="later")
with contextlib.redirect_stderr(io.StringIO()):
    got = tv.run_bg(f, "install", "pm install -r /data/local/tmp/x.apk")
if got != (0, "Success"): bgbad.append(f"dies after a while: {got}")
if sum(c.endswith("echo __rc=$?") for c in f.calls) != 1: bgbad.append("dies after a while: not run directly once")
for name, fake, limit, word in (("never ends", Fake(10**9), 30, "still running after"),):
    err = io.StringIO()
    try:
        with contextlib.redirect_stderr(err): tv.run_bg(fake, "install", "pm install -r /x.apk", limit_s=limit)
        bgbad.append(name + ": no exit")
    except SystemExit as e:
        if word not in str(e): bgbad.append(f"{name}: said {e}")
print("run_bg: " + ("ok" if not bgbad else f"WRONG {bgbad}"))

# Git Bash on Windows rewrites /data/local/tmp/x into its own folder before Python sees it: tv.py cuts it back off
tv.is_git_folder = lambda f: f in ("C:/Program Files/Git", "D:/data/Git")
real_name, tv.os.name = tv.os.name, "nt"
paths = {
    "C:/Program Files/Git/data/local/tmp/x.apk": "/data/local/tmp/x.apk",
    "C:\\Program Files\\Git\\sdcard\\shot.png": "/sdcard/shot.png",
    "D:/data/Git/data/local/tmp/x.apk": "/data/local/tmp/x.apk",   # a Git folder that itself has /data/ in it
    "C:/Users/me/data/x.apk": "C:/Users/me/data/x.apk",             # a real Windows path stays as it is
    "/data/local/tmp/x.apk": "/data/local/tmp/x.apk",
    "pm install -r /data/local/tmp/x.apk": "pm install -r /data/local/tmp/x.apk",
}
wrong = {k: tv.tv_path(k) for k, v in paths.items() if tv.tv_path(k) != v}
tv.os.name = real_name
print(f"Git Bash paths: {len(paths) - len(wrong)}/{len(paths)} put back" + (f": wrong {wrong}" if wrong else ""))
sys.exit(1 if bad or wrong or bgbad else 0)
