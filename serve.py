"""Serve the exported Next.js build (out/) using Python's standard library."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if __name__ == '__main__':
    root = Path(__file__).resolve().parent / 'out'
    if not root.exists():
        raise SystemExit('out/ not found. Run `npm run build` first.')
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    port = 8000
    while True:
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), handler)
            break
        except OSError:
            port += 1
    print(f'Ropon Radar is ready at http://127.0.0.1:{port}/', flush=True)
    server.serve_forever()
