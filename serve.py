#!/usr/bin/env python3
"""
Local development server.

Python's stock http.server sends Last-Modified, which lets a browser cache ES
modules aggressively. During a rebuild that means index.html updates while its
imports stay stale, and the app dies on an export that no longer exists — with
no visible error. This sends no-store on everything so a reload is always a
real reload.

    python serve.py [port]

GitHub Pages handles this correctly on its own; this is only for local work.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    """Serve the working tree with caching disabled."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Only surface failures; a normal page load is ~30 lines of noise.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=".")

    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"JIBON running at http://localhost:{port}  (caching disabled)")
        print("Ctrl-C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
