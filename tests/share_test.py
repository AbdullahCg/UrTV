"""optimize/share.py on a fake run folder: nothing of the owner's may reach the text that is sent.

    python3 tests/share_test.py          (no TV needed)
"""
import os, sys, tempfile
from pathlib import Path
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "optimize"))
import share

ours = next(l.split()[0] for l in open(os.path.join(here, "..", "optimize", "lists", "tcl-safe.txt"))
            if l.strip() and not l.startswith("#"))
share.live_versions = lambda: None   # no TV here: the report's own line
share.RUN = Path(tempfile.mkdtemp())
(share.RUN / "run.log").write_text("\n".join([
    "!! adb " + ".".join(["192", "168", "1", "23"]) + ":5555 refused",   # built apart: tests/check.py bars IPs in files
    "!! mac aa:bb:cc:dd:ee:ff and AA-BB-CC-DD-EE-FF",
    r"!! saved C:\Users\Ann Lee\x\run.log",
    r"!! also c:\documents and settings\Ann Lee\x",
    "!! /home/ann/x and /Users/Ann Lee/y and /c/Users/ann/z",
]), encoding="utf-8")
(share.RUN / "report.md").write_text("\n".join([
    "- ok: com.android.vending",
    "- home hides: com.thirdparty.secretapp | no TV activity",
    "- home hides: com.other.private | no TV activity",
    "- home hides: com.third.cfg | config.xml",
    f"- home hides: {ours} | config.xml",
]), encoding="utf-8")

text = share.scrub("\n".join(share.trouble() + share.report_checks()))
leaks = [w for w in ("192.168", "aa:bb", "AA-BB", "Ann", "Lee", "/ann", "secretapp", "other.private", "third.cfg")
         if w.lower() in text.lower()]
counts = "2 no TV activity" in text and "1 config.xml" in text and ours in text
print("share: " + ("nothing personal left, counts kept" if not leaks and counts else "WRONG")
      + (f", leaked {leaks}" if leaks else ""))

def keep_off(*pkgs, before=()):   # report lines naming these keep packages as off
    return share.packages([f"- pkg off: {p} (keep)" for p in pkgs], before=set(before))


by_design = [l for l in keep_off("com.google.android.apps.tv.launcherx") if l.startswith("!!")]
real = [l for l in keep_off("com.google.android.tungsten.setupwraith", "com.tcl.airplay2") if l.startswith("!!")]
factory = [l for l in keep_off("com.tcl.smartalexa", "com.tcl.airplay2", before=["com.tcl.smartalexa"]) if l.startswith("!!")]
alarm = not by_design and real == ["!! protected but off: com.tcl.airplay2"] \
    and factory == ["!! protected but off: com.tcl.airplay2"]
print("share: " + ("off-by-design keep packages not flagged, others still are" if alarm else f"WRONG alarm {by_design} {real}"))
# Windows 11 says «10» in platform.release(): the build number decides
wins = [(("Windows", "10.0.22631", "10"), "11"), (("Windows", "10.0.22000", "10"), "11"), (("Windows", "10.0.21996", "10"), "10"),
        (("Windows", "10.0.19045", "10"), "10"), (("MINGW64_NT-10.0-26100", "3.4.10", "3.4.10"), "11"),
        (("MINGW64_NT-10.0-19045", "3.4.10", "3.4.10"), "10"), (("Windows", "6.1.7601", "7"), "7")]
bad_win = [(a, share.windows_release(*a), want) for a, want in wins if share.windows_release(*a) != want]
print("share: " + ("Windows 11 told from 10 by the build number" if not bad_win else f"WRONG windows {bad_win}"))
# the Versions line: live from the TV when it answers, else the report's
(share.RUN / "report.md").write_text("Home: h\nVersions: screensaver 3.89, home 3.89\n", encoding="utf-8")
share.live_versions = lambda: "Versions: screensaver 3.124, home 3.124"
live = [l for l in share.report_checks() if l.startswith("Versions:")]
share.live_versions = lambda: None
old = [l for l in share.report_checks() if l.startswith("Versions:")]
(share.RUN / "report.md").write_text("Home: h\n", encoding="utf-8")
share.live_versions = lambda: "Versions: screensaver 3.124, home 3.124"
added = [l for l in share.report_checks() if l.startswith("Versions:")]
share.live_versions = lambda: None
versions_ok = live == ["Versions: screensaver 3.124, home 3.124"] and old == ["Versions: screensaver 3.89, home 3.89"] and len(added) == 1
print("share: " + ("Versions read live, the report's line as the fallback" if versions_ok else f"WRONG versions {live} {old} {added}"))
# --preview writes and prints the text and sends nothing; --send sends that file, or says there is none
import contextlib, io
run2 = Path(tempfile.mkdtemp())
(run2 / "tv.txt").write_text("ro.product.model = Test TV\n", encoding="utf-8")
share.RUN, share.OUT, share.QR = run2, run2 / "share.md", run2 / "share-qr.png"
sent = []
share.send = lambda text: sent.append(text) or True
share.qr = lambda link: False

def cli(*argv):
    sys.argv = ["share.py", *argv]
    out, err = io.StringIO(), io.StringIO()
    code = 0
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            share.main()
        except SystemExit as e:
            code = e.code if isinstance(e.code, int) else 1
            err.write(str(e.code))
    return code, out.getvalue(), err.getvalue()

code, out, err = cli("--send")
no_file = code != 0 and "Nothing to send" in err and not sent
code, out, err = cli("--preview", "--agent", "tester", "slow adb at step 3")
written = share.OUT.read_text(encoding="utf-8")
preview = code == 0 and not sent and "slow adb at step 3" in written and written.strip() in out and "NOT sent" in out
code, out, err = cli("--send")
sends = code == 0 and sent == [written]
code, out, err = cli("--send", "more notes")
refuses = code != 0 and "give the notes to --preview" in err and len(sent) == 1
sent.clear()
code, out, err = cli("an old-style note")
plain = code == 0 and len(sent) == 1 and "an old-style note" in sent[0]
ok = no_file and preview and sends and refuses and plain
print("share: " + ("--preview sends nothing, --send sends the file written, plain form still sends"
                    if ok else f"WRONG preview/send {no_file} {preview} {sends} {refuses} {plain}"))
sys.exit(1 if leaks or not counts or not alarm or not ok or bad_win or not versions_ok else 0)
