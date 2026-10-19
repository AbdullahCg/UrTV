"""optimize/tv.py's APK upload through a flaky fake ADB connection: it drops connections, loses replies after
the command ran, and the upload is killed half way and started again. The file must arrive exactly.

    python3 tests/upload_test.py          (no TV needed; 50 random runs)
"""
import base64, hashlib, os, random, re, sys, tempfile, types

FS = {}
stats = {"drop": 0, "lost": 0}

def run(cmd):
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
        m = re.fullmatch(r"\[ -f (\S+) \] && base64 -d \S+ > (\S+) && rm -f \S+", part)
        if m:
            if m.group(1) in FS: FS[m.group(2)] = base64.b64decode(FS[m.group(1)]); FS.pop(m.group(1))
            continue
        m = re.fullmatch(r"\[ -f (\S+) \] && echo y", part)
        if m: out.append("y" if m.group(1) in FS else ""); continue
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
    FS.clear()
    data = os.urandom(700_000)
    src = os.path.join(tempfile.mkdtemp(), "x.apk")
    open(src, "wb").write(data)
    t = tv.TV()
    orig, calls = t.shell, {"n": 0}
    def dying(cmd, timeout=120):   # the process is killed at its 6th call
        calls["n"] += 1
        if calls["n"] == 6:
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
sys.exit(1 if bad else 0)
