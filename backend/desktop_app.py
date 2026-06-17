"""Desktop launcher for Creator Hub.

Starts the bundled FastAPI server on a local port, seeds demo data, and opens
the default browser. Packaged into a single double-click .exe with PyInstaller
(see build_exe.bat). Reviewer needs nothing installed — no Python required.

Data (SQLite DB, uploads, backups) is written to a `CreatorHubData` folder next
to the .exe so it persists between runs and stays writable.
"""
import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path


def _resource(rel: str) -> str:
    """Path to a bundled resource (works both frozen and from source)."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, rel)


def _data_dir() -> Path:
    root = (Path(os.path.dirname(sys.executable)) if getattr(sys, "frozen", False)
            else Path(__file__).resolve().parent)
    d = root / "CreatorHubData"
    (d / "uploads").mkdir(parents=True, exist_ok=True)
    (d / "backups").mkdir(parents=True, exist_ok=True)
    return d


def _free_port(preferred: int = 8000) -> int:
    for port in (preferred, 8001, 8080, 8123, 0):
        try:
            s = socket.socket()
            s.bind(("127.0.0.1", port))
            chosen = s.getsockname()[1]
            s.close()
            return chosen
        except OSError:
            continue
    return preferred


def main() -> None:
    data = _data_dir()
    # Point all writable paths + the frontend at the right places BEFORE importing the app.
    os.environ.setdefault("FRONTEND_DIR", _resource("frontend"))
    os.environ.setdefault("DATABASE_URL", "sqlite:///" + str(data / "creatorhub.db").replace("\\", "/"))
    os.environ.setdefault("UPLOADS_DIR", str(data / "uploads"))
    os.environ.setdefault("BACKUPS_DIR", str(data / "backups"))

    port = int(os.environ.get("CREATORHUB_PORT") or _free_port())

    from app.main import app          # noqa: E402 (must follow env setup)
    from app.seed import run as seed_run  # noqa: E402
    import uvicorn                     # noqa: E402

    try:
        seed_run()
    except Exception as exc:  # noqa: BLE001
        print("[seed] skipped:", exc)

    url = f"http://127.0.0.1:{port}"
    if os.environ.get("CREATORHUB_NO_BROWSER") != "1":
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    print("\n" + "=" * 52)
    print("  Creator Hub is running:")
    print(f"     {url}")
    print("  Login: admin / admin123   (viewer / viewer123)")
    print("  Close this window to stop the program.")
    print("=" * 52 + "\n")

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
