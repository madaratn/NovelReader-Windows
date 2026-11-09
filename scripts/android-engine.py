"""Prepares the video engine sources for the Android app (android/engine/vendor).

The phone runs the same engine as the PC (Miwayomi v0.2.9 with the NovelReader
patches of .github/workflows/build-patched-miwayomi.yml and
scripts/engine-patches/), compiled for Android: the Aniyomi API (source-api,
core-common) and the HTTP routes the interface uses. What only makes sense on a PC
is left out or replaced by android/engine/src (extensions load as dex directly, no
dex2jar; SQLite through Android; JavaScript through QuickJS; no self-update).

Usage: python scripts/android-engine.py   (needs git and network)
"""
import os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "android" / "engine" / "vendor"
WORK = OUT / "miwayomi-work"
TAG = "v0.2.9"

SERVER_FILES = [
    "Config.kt", "di/ConfigHolder.kt", "source/SourceManagers.kt", "extension/ExtensionMeta.kt",
    "api/AnimeRoutes.kt", "api/ApiHelpers.kt", "api/Dtos.kt", "api/ExtensionRoutes.kt",
    "api/KeiIndexProto.kt", "api/Mappers.kt", "api/MimeTypes.kt", "api/ProxyHelpers.kt",
    "api/StreamProxy.kt", "api/StreamingRoutes.kt", "api/ImageCache.kt", "api/MangaRoutes.kt",
    "api/FavoritesRoutes.kt", "api/WatchRoutes.kt",
]
# Replaced by android/engine/src.
SKIP = {"core-common/src/main/kotlin/eu/kanade/tachiyomi/network/JavaScriptEngine.kt"}


def run(*a, cwd=None):
    subprocess.run(a, cwd=cwd, check=True)


def edit(p: Path, old, new, what, regex=False):
    s = p.read_text()
    if regex:
        s2, n = re.subn(old, new, s, flags=re.S)
    else:
        n = s.count(old); s2 = s.replace(old, new)
    if not n:
        sys.exit(f"{what}: anchor not found in {p}")
    p.write_text(s2)


def main():
    import yaml  # pip install pyyaml
    if OUT.exists():
        shutil.rmtree(OUT)
    WORK.mkdir(parents=True)
    run("git", "-c", "advice.detachedHead=false", "clone", "-q", "--depth", "1", "--branch", TAG, "https://github.com/miwayomi/miwayomi.git", str(WORK / "miwayomi"))
    # Same patches as the PC engine, run like the workflow does (cwd with miwayomi/ and nr/).
    nr = WORK / "nr" / "scripts"
    nr.mkdir(parents=True)
    shutil.copytree(ROOT / "scripts" / "engine-patches", nr / "engine-patches")
    wf = yaml.safe_load((ROOT / ".github" / "workflows" / "build-patched-miwayomi.yml").read_text())
    for st in wf["jobs"]["build"]["steps"]:
        if st.get("shell") == "python":
            subprocess.run([sys.executable, "-c", st["run"]], cwd=WORK, check=True)
    run(sys.executable, str(nr / "engine-patches" / "v16_compat.py"), "miwayomi", cwd=WORK)

    src = OUT / "src"
    m = WORK / "miwayomi"
    for mod in ("source-api", "core-common"):
        base = m / mod / "src" / "main" / "kotlin"
        for f in base.rglob("*.kt"):
            rel = f.relative_to(m).as_posix()
            if rel in SKIP:
                continue
            d = src / f.relative_to(base)
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(f, d)
    sbase = m / "server" / "src" / "main" / "kotlin" / "miwayomi"
    for rel in SERVER_FILES:
        d = src / "miwayomi" / rel
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(sbase / rel, d)

    # Android edits.
    for f in src.rglob("*.kt"):
        s = f.read_text()
        if "import android.compat.CompatRuntime" in s:
            f.write_text(s.replace("import android.compat.CompatRuntime", "import nr.engine.CompatRuntime"))
    edit(src / "eu/kanade/tachiyomi/network/SqliteStore.kt",
         'DriverManager.getConnection("jdbc:sqlite:${dbFile.absolutePath}")',
         "nr.engine.AndroidJdbc.connect(dbFile)", "sqlite on android")
    # The WebView check takes longer than FlareSolverr on a PC: more time for it.
    edit(src / "eu/kanade/tachiyomi/network/NetworkHelper.kt",
         r"\.readTimeout\(15, TimeUnit\.SECONDS\)(\s*)\.callTimeout\(25, TimeUnit\.SECONDS\)",
         r".readTimeout(60, TimeUnit.SECONDS)\1.callTimeout(75, TimeUnit.SECONDS)", "flare timeouts", regex=True)
    # No desktop jars on the phone: the APK's dex is loaded as is.
    edit(src / "miwayomi/api/ExtensionRoutes.kt",
         r"            // Best-effort: some repos also publish a desktop JVM jar.*?(?=            val loaded = try \{)",
         "", "skip desktop jar", regex=True)
    shutil.rmtree(WORK)
    n = sum(1 for _ in src.rglob("*.kt"))
    print(f"android engine sources ready: {n} files in {src.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
