#!/usr/bin/env python3
"""Write how the setup went, for its owner to send to UrTV's author if they want to (optimize/share.sh).

Only what helps fix the setup for others: the TV's maker, model and Android version, the computer's system, how
long each step took and where it stopped, memory before and after, the protected-features check, and the agent's
notes. Nothing personal: no city, clubs, favourites or apps, no names, network addresses or file paths.
"""
import datetime
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path

for stream in (sys.stdout, sys.stderr):   # Windows writes pipes in its own code page
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

RUN = Path(__file__).resolve().parent / "run"
OUT = RUN / "share.md"
SEND_TO = "https://x.com/A_Albihlal"


def scrub(text):   # in case a note or an output carries something personal
    text = re.sub(r"\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b", "<ip>", text)
    text = re.sub(r"\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b", "<mac>", text)
    text = re.sub(r"(?i)\b[A-Z]:[\\/]+Users[\\/]+[^\\/\s]+", "<home>", text)
    text = re.sub(r"(?i)(/c)?/Users/[^/\s]+|/home/[^/\s]+", "<home>", text)
    return text


def tv():
    props = dict(re.findall(r"^(\S+) = (.*)$", (RUN / "tv.txt").read_text(encoding="utf-8"), re.M))
    return (f"{props.get('ro.product.manufacturer', '?')} {props.get('ro.product.model', '?')}, "
            f"Android {props.get('ro.build.version.release', '?')} (SDK {props.get('ro.build.version.sdk', '?')})")


def computer():
    name = platform.system()
    if name == "Windows" or "MINGW" in name.upper() or "MSYS" in name.upper():
        return f"Windows {platform.release()}"
    return {"Darwin": f"macOS {platform.mac_ver()[0]}"}.get(name, f"{name} {platform.release()}")


def steps():
    log = RUN / "steps.log"
    if not log.exists():
        return ["(no steps.log: an older run.sh)"]
    lines, started, first, last, stopped_at = [], {}, None, None, None
    for row in log.read_text(encoding="utf-8").splitlines():
        m = re.match(r"(\S+ \S+) (start|done|stopped) (\S+)(.*)", row)
        if not m:
            continue
        t = datetime.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
        first, last = first or t, t
        what, step = m.group(2), m.group(3)
        if what == "start":
            started[step] = t
            if stopped_at:   # the time between a stop and the next try went into finding out why
                gap = int((t - stopped_at).total_seconds())
                lines.append(f"- {gap // 60}m {gap % 60:02d}s stopped, until it was run again")
                stopped_at = None
        elif step in started:
            took = int((t - started.pop(step)).total_seconds())
            lines.append(f"- {step}: {took // 60}m {took % 60:02d}s" + ("" if what == "done" else f" — stopped{m.group(4)}"))
            stopped_at = t if what == "stopped" else None
    if first:
        total = int((last - first).total_seconds())
        lines.append(f"- total, first step to last: {total // 60} min")
    return lines


def report_checks():
    report = RUN / "report.md"
    if not report.exists():
        return ["(no report.md yet: the setup didn't finish)"]
    keep = [l for l in report.read_text(encoding="utf-8").splitlines()
            if l.startswith(("- ok:", "- !!", "Home:", "Screensaver:"))]
    return keep or ["(nothing in report.md)"]


def main():
    if not (RUN / "tv.txt").exists():
        sys.exit("!! No setup results here (optimize/run/tv.txt): run the setup first.")
    notes = " ".join(sys.argv[1:]).strip()
    summary = RUN / "summary.md"
    parts = [
        f"UrTV setup report, {datetime.date.today()}",
        "",
        f"TV: {tv()}",
        f"Computer: {computer()}",
        "",
        "Steps (how long each took):",
        *steps(),
        "",
        "Memory:",
        summary.read_text(encoding="utf-8").strip() if summary.exists() else "(not measured)",
        "",
        "Checks:",
        *report_checks(),
    ]
    if notes:
        parts += ["", "Notes from the agent:", notes]
    text = scrub("\n".join(parts)) + "\n"
    OUT.write_text(text, encoding="utf-8")
    print(text)
    print(f"Saved in {OUT.relative_to(RUN.parent.parent)}.")
    print(("Copied to the clipboard. " if copy(OUT) else "") + f"Send it as a message to {SEND_TO} (Message → paste).")


def copy(path):
    """Best effort: the system's own clipboard tool, if there is one."""
    tools = [["powershell", "-NoProfile", "-Command", f"Get-Content -Raw -Encoding UTF8 '{path}' | Set-Clipboard"],
             ["pbcopy"], ["wl-copy"], ["xclip", "-selection", "clipboard"]]
    for cmd in tools:
        if shutil.which(cmd[0]):
            try:
                feed = None if cmd[0] == "powershell" else path.read_bytes()
                return subprocess.run(cmd, input=feed, capture_output=True, timeout=20).returncode == 0
            except Exception:  # noqa: BLE001
                continue
    return False


if __name__ == "__main__":
    main()
