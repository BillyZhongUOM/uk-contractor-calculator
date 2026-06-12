#!/usr/bin/env python3
"""Local dev server only (NOT used in production / GitHub Pages).
Threaded so concurrent requests never block, and no-store so edits show
up immediately during preview."""
import http.server
import socketserver

PORT = 8200


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


with Server(("", PORT), Handler) as httpd:
    httpd.serve_forever()
