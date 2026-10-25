"""Run tests/grader.html in headless Edge or Chrome and print the results (no Node needed).

    python tests/run_grader_tests.py            exit code 0 = all passed
"""
from __future__ import annotations

import html
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def find_browser() -> str | None:
    for c in CANDIDATES:
        if os.path.exists(c):
            return c
    for name in ("msedge", "google-chrome", "chromium", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    return None


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    browser = find_browser()
    if not browser:
        print("No Edge/Chrome found: open tests/grader.html in a browser instead.")
        return 2
    url = (HERE / "grader.html").as_uri()
    out = subprocess.run([browser, "--headless=new", "--disable-gpu", "--no-first-run", "--allow-file-access-from-files",
                          "--virtual-time-budget=5000", "--dump-dom", url],
                         capture_output=True, text=True, encoding="utf-8", timeout=90).stdout
    summary = re.search(r'<h2 id="summary">([^<]*)</h2>', out)
    rows = re.findall(r'<div class="(pass|fail)"><b>\w+</b> (.*?)<br><small>(.*?)</small></div>', out, re.S)
    if not summary:
        print("Could not read results; raw output:\n", out[:3000])
        return 2
    for cls, name, info in rows:
        print(f"{'PASS' if cls == 'pass' else 'FAIL'}  {html.unescape(name)}")
        if info:
            print("      " + html.unescape(info)[:400])
    print(summary.group(1))
    return 0 if all(c == "pass" for c, _, _ in rows) else 1


if __name__ == "__main__":
    sys.exit(main())
