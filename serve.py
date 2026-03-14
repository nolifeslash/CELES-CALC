#!/usr/bin/env python3
"""
serve.py — Lightweight local development server for CELES-CALC.

Usage:
    python3 serve.py            # starts on http://localhost:8080
    python3 serve.py 9000       # starts on http://localhost:9000

Opens the Calculator in your default browser automatically.

Why use this instead of opening index.html directly?
  Some browsers block ES module imports (import/export) from file:// URLs.
  Running a local HTTP server avoids that restriction without any build step.

Requirements: Python 3 standard library only — no pip install needed.
"""

import http.server
import socketserver
import sys
import webbrowser
import os
import threading

DEFAULT_PORT = 8080


def _get_port():
    if len(sys.argv) > 1:
        try:
            return int(sys.argv[1])
        except ValueError:
            print(f"Warning: invalid port '{sys.argv[1]}', using {DEFAULT_PORT}")
    return DEFAULT_PORT


class _Handler(http.server.SimpleHTTPRequestHandler):
    """Serve files from the current directory with correct MIME types."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js":   "application/javascript",
        ".mjs":  "application/javascript",
        ".json": "application/json",
        ".css":  "text/css",
        ".html": "text/html",
        ".md":   "text/markdown",
    }

    def log_message(self, fmt, *args):
        # Suppress noisy request logs — only print errors.
        if args and len(args) >= 2 and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main():
    port = _get_port()
    url = f"http://localhost:{port}"

    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with socketserver.TCPServer(("", port), _Handler) as httpd:
        httpd.allow_reuse_address = True
        print(f"CELES-CALC local server running at {url}")
        print(f"  Calculator : {url}/index.html")
        print(f"  Visualizer : {url}/visualizer.html")
        print("Press Ctrl+C to stop.\n")

        # Open browser after a short delay so the server is ready.
        def _open():
            webbrowser.open(url)

        threading.Timer(0.5, _open).start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
