"""
COMEX Track · Exportaciones — servidor local (solo librería estándar de Python 3).
- Sirve la aplicación desde la carpeta ./public en http://localhost:8000
- Responde /api/config con SUPABASE_URL y SUPABASE_ANON_KEY del archivo .env
  (la llave anon es pública por diseño; aquí no se usa ninguna llave secreta).
"""
import http.server
import json
import os
import socketserver
import sys
from pathlib import Path

PORT = int(os.environ.get("COMEX_EXPO_PORT", "8000"))
BASE = Path(__file__).resolve().parent
PUBLIC = BASE / "public"


def load_env():
    cfg = {}
    env = BASE / ".env"
    if env.exists():
        for raw in env.read_text(encoding="utf-8-sig").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg


CFG = load_env()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/config":
            url = CFG.get("SUPABASE_URL", "").rstrip("/")
            anon = CFG.get("SUPABASE_ANON_KEY", "")
            if not url or not anon:
                return self._json(503, {"message": "Falta SUPABASE_URL o SUPABASE_ANON_KEY en el archivo .env"})
            allowed = [e.strip().lower() for e in CFG.get("ALLOWED_EMAILS", "").split(",") if e.strip()]
            return self._json(200, {"supabaseUrl": url, "supabaseAnonKey": anon, "allowedEmails": allowed})
        if self.path.startswith("/api/"):
            return self._json(404, {"message": "No encontrado"})
        return super().do_GET()


def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("=" * 60)
        print(" COMEX Track · Exportaciones")
        print(f" Servidor iniciado en: http://localhost:{PORT}")
        if not CFG.get("SUPABASE_ANON_KEY"):
            print(" OJO: falta SUPABASE_ANON_KEY en .env (ver README)")
        print(" Presione Ctrl+C para detener el servidor.")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")
            sys.exit(0)


if __name__ == "__main__":
    run_server()
