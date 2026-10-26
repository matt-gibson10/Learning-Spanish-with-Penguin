"""Install the offline chat partner ("Charla con Penguin"): the inference runtime + one small GGUF model.

    .venv\\Scripts\\python.exe scripts\\setup_chat_model.py            # default model (see DEFAULT below)
    .venv\\Scripts\\python.exe scripts\\setup_chat_model.py --list     # show the models it knows
    .venv\\Scripts\\python.exe scripts\\setup_chat_model.py --model qwen2.5-1.5b

Runtimes (both by default; the app uses llama-server when present, else llama-cpp-python):
  server  llama.cpp's official llama-server.exe (pinned release, ~24 MB zip, SHA-256 checked) -> models\\llama.cpp\\
  python  llama-cpp-python prebuilt CPU wheel from requirements-chat.txt -> the app's .venv
  --engine server|python installs only one.

Idempotent: skips what is already installed (runtime present, model present with the right size and SHA-256).
Downloads resume if interrupted. The rest of the app works without any of this.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import os
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"
REQ = ROOT / "requirements-chat.txt"
VENV_PY = ROOT / ".venv" / "Scripts" / "python.exe"

# key: (Hugging Face repo, file, size in bytes, sha256, licence)
CATALOG = {
    "qwen3-4b": ("lmstudio-community/Qwen3-4B-Instruct-2507-GGUF", "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
                 2497280448, "8cdb57cbb880d313736a9bc4e3d3d2485f145b5e19cf33783746e753e82641fc", "Apache-2.0"),
    "gemma3-4b": ("lmstudio-community/gemma-3-4b-it-GGUF", "gemma-3-4b-it-Q4_K_M.gguf",
                  2489757856, "be49949e48422e4547b00af14179a193d3777eea7fbbd7d6e1b0861304628a01", "Gemma Terms of Use"),
    "qwen2.5-1.5b": ("Qwen/Qwen2.5-1.5B-Instruct-GGUF", "qwen2.5-1.5b-instruct-q4_k_m.gguf",
                     1117320736, "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e", "Apache-2.0"),
}
DEFAULT = "qwen3-4b"

# llama.cpp release with llama-server.exe (Windows x64, CPU; picks the best AVX2/AVX-VNNI kernels at run time).
LLAMA_TAG = "b11905"
LLAMA_ZIP = f"llama-{LLAMA_TAG}-bin-win-cpu-x64.zip"
LLAMA_URL = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}/{LLAMA_ZIP}"
LLAMA_SHA = "d7607fb22bd1e4a5c73de8910ea2b3641aab797c7e6db04ef79777bb6a18cd93"
LLAMA_DIR = MODELS / "llama.cpp"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 22), b""):
            h.update(block)
    return h.hexdigest()


def _bar(done: int, total: int, t0: float) -> None:
    frac = done / total if total else 0
    speed = done / max(time.time() - t0, 1e-6) / 1e6
    fill = int(frac * 30)
    sys.stdout.write(f"\r  [{'#' * fill}{'.' * (30 - fill)}] {frac * 100:5.1f}%  "
                     f"{done / 1e6:,.0f}/{total / 1e6:,.0f} MB  {speed:5.1f} MB/s ")
    sys.stdout.flush()


def download(url: str, part: Path, size: int | None) -> None:
    """Download url to part with a progress bar; resumes a partial file when the size is known."""
    have = part.stat().st_size if (size and part.is_file()) else 0
    if size and have > size:
        part.unlink()
        have = 0
    if have:
        print(f"  resuming at {have / 1e6:,.0f} MB")
    req = urllib.request.Request(url, headers={"User-Agent": "learning-spanish-with-penguin-setup"})
    if have:
        req.add_header("Range", f"bytes={have}-")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=60) as r:
        if have and r.status != 206:      # server ignored the Range header: start over
            have = 0
        total = size or int(r.headers.get("Content-Length") or 0)
        with open(part, "ab" if have else "wb") as f:
            done = have
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
                done += len(chunk)
                if total:
                    _bar(done, total, t0)
    print()


def ensure_llama_server() -> bool:
    """Download and unpack llama-server.exe + its DLLs. False where no prebuilt binary applies."""
    if os.name != "nt":
        print("llama-server: no pinned build for this OS; using llama-cpp-python.")
        return False
    marker = LLAMA_DIR / "BUILD.txt"
    if (LLAMA_DIR / "llama-server.exe").is_file() and marker.is_file() and marker.read_text().strip() == LLAMA_TAG:
        print(f"llama-server: llama.cpp {LLAMA_TAG} already installed.")
        return True
    print(f"llama-server: downloading llama.cpp {LLAMA_TAG} (~24 MB)\n  from {LLAMA_URL}")
    LLAMA_DIR.mkdir(parents=True, exist_ok=True)
    zpath = LLAMA_DIR / LLAMA_ZIP
    download(LLAMA_URL, zpath, None)
    if sha256(zpath) != LLAMA_SHA:
        zpath.unlink()
        sys.exit("llama.cpp download checksum mismatch: the file was deleted. Run the script again.")
    with zipfile.ZipFile(zpath) as z:
        for m in z.infolist():
            name = Path(m.filename).name
            if name == "llama-server.exe" or name.lower().endswith(".dll") or name.startswith("LICENSE"):
                (LLAMA_DIR / name).write_bytes(z.read(m))
    zpath.unlink()
    marker.write_text(LLAMA_TAG)
    print("  OK.")
    return True


def ensure_python_runtime() -> None:
    if importlib.util.find_spec("llama_cpp") is not None:
        print("llama-cpp-python: already installed.")
        return
    print("llama-cpp-python: installing the prebuilt CPU wheel (~8 MB) ...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(REQ)])
    importlib.invalidate_caches()
    if importlib.util.find_spec("llama_cpp") is None:
        sys.exit("llama-cpp-python did not install. See docs/CHAT.md (Troubleshooting).")


def ensure_model(key: str) -> Path:
    repo, fname, size, digest, lic = CATALOG[key]
    MODELS.mkdir(exist_ok=True)
    dest = MODELS / fname
    ok_marker = dest.with_suffix(dest.suffix + ".ok")
    if dest.is_file() and dest.stat().st_size == size:
        if ok_marker.is_file() and ok_marker.read_text().strip() == digest:
            print(f"Model: {fname} already installed and verified.")
            return dest
        print(f"Model: {fname} present, checking SHA-256 ...")
        if sha256(dest) == digest:
            ok_marker.write_text(digest)
            print("  OK.")
            return dest
        print("  Checksum mismatch, downloading again.")
        dest.unlink()
    url = f"https://huggingface.co/{repo}/resolve/main/{fname}"
    part = dest.with_suffix(dest.suffix + ".part")
    print(f"Model: downloading {fname} ({size / 1e9:.2f} GB, licence {lic})\n  from {url}")
    download(url, part, size)
    if part.stat().st_size != size:
        sys.exit(f"Download incomplete ({part.stat().st_size} of {size} bytes). Run the script again to resume.")
    print("  checking SHA-256 ...")
    if sha256(part) != digest:
        part.unlink()
        sys.exit("Checksum mismatch: the file was deleted. Run the script again.")
    os.replace(part, dest)
    ok_marker.write_text(digest)
    print("  OK.")
    return dest


def smoke_test(path: Path) -> None:
    """Load the model with the app's own code and ask one question."""
    print("Test: loading the model and asking one question (10-30 s) ...")
    os.environ["CHAT_MODEL_PATH"] = str(path)
    sys.path.insert(0, str(ROOT))
    from server import chat
    t0 = time.time()
    text, _ = chat.LOCAL.complete([{"role": "user", "content": "Di hola en una frase corta."}],
                                  schema=None, temperature=0.2, max_tokens=24)
    print(f"  Penguin says: {text.strip()}   ({time.time() - t0:.1f}s, engine: {chat.LOCAL.engine.name})")
    chat.LOCAL.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=DEFAULT, choices=sorted(CATALOG), help=f"which model (default {DEFAULT})")
    ap.add_argument("--engine", choices=["both", "server", "python"], default="both",
                    help="which runtime(s) to install (default both)")
    ap.add_argument("--list", action="store_true", help="list known models and exit")
    ap.add_argument("--no-test", action="store_true", help="skip the quick load test")
    a = ap.parse_args()
    if a.list:
        for k, (repo, fname, size, _, lic) in CATALOG.items():
            star = "  (default)" if k == DEFAULT else ""
            print(f"{k:14s} {size / 1e9:4.1f} GB  {lic:20s} {repo}/{fname}{star}")
        return
    # Always install into the app's venv, even if started with another Python.
    if VENV_PY.is_file() and Path(sys.executable).resolve() != VENV_PY.resolve():
        sys.exit(subprocess.call([str(VENV_PY), str(Path(__file__).resolve()), *sys.argv[1:]]))
    engine = a.engine
    if engine in ("both", "server") and not ensure_llama_server() and engine == "server":
        engine = "python"
    if engine in ("both", "python"):
        ensure_python_runtime()
    path = ensure_model(a.model)
    if not a.no_test:
        smoke_test(path)
    print("\nDone. Restart start.bat and open the Chat page.")
    if a.model != DEFAULT and (MODELS / CATALOG[DEFAULT][1]).is_file():
        print(f"The default model is also installed and wins: set CHAT_MODEL_PATH=models\\{path.name} "
              f"before start.bat to use this one.")


if __name__ == "__main__":
    main()
