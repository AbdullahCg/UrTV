"""Run the Android launcher's PIN-verifier tests on a desktop JDK, without Android dependencies."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
suffix = ".exe" if os.name == "nt" else ""
jdk = Path(os.environ["JAVA_HOME"]) / "bin" if os.environ.get("JAVA_HOME") else None
tool = lambda name: str(jdk / (name + suffix)) if jdk else name
with tempfile.TemporaryDirectory(prefix="urtv-pin-") as out:
    subprocess.run([tool("javac"), "-d", out,
        str(root / "android/launcher/src/main/java/sa/urtv/home/PinCrypto.java"),
        str(root / "tests/PinCryptoRun.java")], check=True)
    subprocess.run([tool("java"), "-cp", out, "sa.urtv.home.PinCryptoRun"], check=True)
