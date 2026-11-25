"""Development server: serves the project folder with caching turned off,
so the browser always loads the latest files after a change.

Usage: python3 scripts/serve.py [port] [--lan]   (default port 5173)
  --lan   also reachable from other devices on the same Wi-Fi (e.g. your phone):
          open http://<this Mac's address>:<port> there (the address is printed at start)
Hidden files and folders (.git, .claude, …) are never served.
"""
import http.server
import os
import socket
import sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
LAN = '--lan' in sys.argv
PORT = int(args[0]) if args else 5173
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        if any(part.startswith('.') for part in self.path.split('?')[0].split('/') if part):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def lan_address():
    """This Mac's address in the local network (the route a packet to the internet would take)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('192.0.2.1', 9))  # no packet is sent; this only picks the outgoing interface
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("0.0.0.0" if LAN else "127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"Tamago-ji on http://localhost:{PORT}", flush=True)
        if LAN:
            print(f"  from a phone on the same Wi-Fi: http://{lan_address()}:{PORT}", flush=True)
        httpd.serve_forever()
