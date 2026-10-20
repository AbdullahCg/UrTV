#!/usr/bin/env python3
"""Make the apps' signing key once, on your own computer, for the repository's secrets.

The key signs both APKs; Android only installs an update signed with the same key, so keep the file and the
password it prints somewhere safe (a password manager). It is written to your home folder, outside the repo, and
must never be committed.

  pip install cryptography
  python .github/tools/make_signing_key.py

Then on GitHub: the repository → Settings → Secrets and variables → Actions → New repository secret, twice:
  ANDROID_KEYSTORE_B64       the long text it prints
  ANDROID_KEYSTORE_PASSWORD  the password it prints
The next build signs with it. TVs that have the apps from before need them installed again once
(optimize/install.sh does that by itself; their settings start over).
"""
import base64
import datetime
import secrets
import sys
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

ALIAS = b"urtv"   # android/*/build.gradle signs with this alias


def make(password):
    key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "UrTV"), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "UrTV")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now)
            .not_valid_after(now + datetime.timedelta(days=365 * 100))   # Android wants it valid long after the last update
            .sign(key, hashes.SHA256()))
    return pkcs12.serialize_key_and_certificates(ALIAS, key, cert, None,
                                                 serialization.BestAvailableEncryption(password.encode()))


def main():
    out = Path.home() / "urtv-signing-key.p12"
    if out.exists():
        sys.exit(f"{out} already exists: that is your key. Use it, or move it away first to make a new one.")
    password = secrets.token_urlsafe(30)
    data = make(password)
    out.write_bytes(data)
    print(f"Key saved to {out}  (keep it, with the password, somewhere safe; never commit it)\n")
    print("GitHub secret ANDROID_KEYSTORE_PASSWORD:")
    print(password + "\n")
    print("GitHub secret ANDROID_KEYSTORE_B64:")
    print(base64.b64encode(data).decode())


if __name__ == "__main__":
    main()
