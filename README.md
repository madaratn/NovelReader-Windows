# Novel Reader Windows — v0.2 alpha

Windows desktop novel reader with an extensible source engine.

## v0.2 source-engine milestone
- Source registry and stable provider contract
- Parallel search across enabled providers
- Chapter-list/content provider methods
- LNReader adapter boundary prepared
- Electron desktop shell

The included remote provider is deliberately a demo provider. Real providers must respect source access rules, authentication, paywalls and DRM.

## Run

    npm install
    npm run start

## Local videos
Anime mode → **Local Videos**: add a folder from your PC, then play MP4/WebM/MKV files in the app. Seeking works, playback position is remembered per file, and the next file plays automatically. Files are served through a private `nrlocal://` scheme, only from folders you added.

Note: the built-in (Chromium) player decodes H.264/VP9/AV1 video with AAC/Opus audio. MKV files using HEVC (H.265) or AC3/DTS audio will show a codec message.

## Windows build (GitHub Actions)
The **Build Windows EXE** workflow runs on pushes to `main`, on `v*` tags, or manually (Actions → Build Windows EXE → Run workflow). The installer is attached to the run as the `NovelReader-Windows` artifact.

## UI tests
The interface is covered by Playwright tests (`tests/ui/`) that run the built renderer in Chromium with a stubbed Electron bridge: navigation, library and shelves, novel page, reader (settings, resume, read aloud), global search, sources, settings and backups, welcome guide, crash screen, French UI and Local Videos.

    npm run build
    npx playwright install chromium   # first time only
    npm run test:ui

They run automatically on every push and pull request (workflow **UI tests**).

## Architecture
src/sources/registry.ts defines the provider contract. Community plugins should not execute with unrestricted Electron/Node privileges. Next: isolated adapter, manifest validation, global-search UI and update checks.
