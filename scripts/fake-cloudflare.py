"""CI only: a site "protected by Cloudflare" for the Android emulator test.
Without the cf_clearance cookie every page is Cloudflare's check page (503, "Just a
moment...", the cookie is set by JavaScript); with it, the real page. /stats counts
the check pages served. The emulator reaches it at http://10.0.2.2:8099."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATS = {"challenges": 0, "real": 0}
CHALLENGE = b"""<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>
<div id="cf-chl-widget">Checking your browser before accessing the site.</div>
<script>setTimeout(function(){document.cookie='cf_clearance=passed; path=/; max-age=3600';location.reload()},1500)</script>
</body></html>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/stats":
            return self.send(200, "application/json", json.dumps(STATS).encode())
        if "cf_clearance=passed" not in (self.headers.get("Cookie") or ""):
            STATS["challenges"] += 1
            return self.send(503, "text/html", CHALLENGE, {"Server": "cloudflare", "cf-mitigated": "challenge"})
        STATS["real"] += 1
        if self.path.startswith("/api.json"):
            return self.send(200, "application/json", b'{"ok":true,"items":[1,2,3]}')
        return self.send(200, "text/html", b"<html><head><title>Real page</title></head><body><h1>REAL CONTENT</h1></body></html>")

    def send(self, code, ctype, body, headers=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)


ThreadingHTTPServer(("0.0.0.0", 8099), H).serve_forever()
