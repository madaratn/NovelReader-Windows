# Sources architecture (v0.2)

NovelReader uses a small internal source contract and an adapter layer for LNReader-compatible providers.

## LNReader mapping

LNReader's current plugin API exposes the operations we need:
- searchNovels(term, page)
- parseNovel(path), which returns novel metadata and chapters
- parseChapter(path), which returns chapter HTML
- optional parsePage(path, page) for paginated chapter lists

The official repository publishes a JSON manifest from its plugins branch. NovelReader treats the manifest as untrusted remote metadata.

## Security boundary

Community plugins are executable JavaScript. They must not run in the renderer or with unrestricted Node/Electron privileges.

Planned execution flow:

renderer -> preload IPC -> Electron main -> isolated plugin worker -> allow-listed network requests

Before installation, NovelReader will validate manifest fields, plugin identity/version and download URL. Authentication/paywall/DRM rules remain enforced; the adapter does not bypass protected access.

## Update model

For a library item NovelReader stores source ID, novel path, last known chapter identity/count and last-read chapter. A refresh calls parseNovel (and parsePage when needed), compares the returned chapter list, and records newly discovered chapters.
