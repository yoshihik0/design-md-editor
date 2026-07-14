#!/usr/bin/env python3
"""D.md local server: static files plus safe workspace read/write APIs."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
MAX_BODY = 5 * 1024 * 1024


def safe_path(url_path: str):
    rel = unquote(urlparse(url_path).path).lstrip("/") or "index.html"
    target = (ROOT / rel).resolve()
    try:
        target.relative_to(ROOT)
    except ValueError:
        return None
    return target


def read_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length > MAX_BODY:
        raise ValueError("Request body too large")
    return json.loads(handler.rfile.read(length).decode("utf-8"))


def write_atomic(target: Path, content: str):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=target.name + ".", suffix=".tmp", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
            stream.write(content)
        os.replace(temp_name, target)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def list_markdown_files(kind: str):
    if kind != "design":
        return None
    base = ROOT / kind
    files = []
    if not base.exists():
        return files
    for item in base.rglob("*.md"):
        relative = item.relative_to(base)
        if relative.parts and relative.parts[0] == "templates":
            continue
        if len(relative.parts) > 1 and item.name.lower() != "design.md":
            continue
        files.append(f"{kind}/{relative.as_posix()}")
    return sorted(files)


def yaml_field(source: str, name: str):
    match = re.search(rf"^{re.escape(name)}:\s*(.+)$", source, re.MULTILINE)
    return match.group(1).strip().strip("'\"") if match else ""


def list_templates():
    base = ROOT / "design" / "templates"
    result = []
    if not base.exists():
        return result
    for folder in sorted(path for path in base.iterdir() if path.is_dir()):
        design = folder / "DESIGN.md"
        preview = folder / "PREVIEW.md"
        if not design.exists():
            continue
        source = design.read_text(encoding="utf-8")
        result.append({
            "id": folder.name,
            "name": yaml_field(source, "title") or folder.name,
            "description": yaml_field(source, "description"),
            "design": f"design/templates/{folder.name}/DESIGN.md",
            "preview": f"design/templates/{folder.name}/PREVIEW.md",
            "hasPreview": preview.exists(),
        })
    return sorted(result, key=lambda item: item["name"])


def valid_folder_name(name: str):
    return bool(name and name not in (".", "..") and "/" not in name and "\\" not in name)


def create_workspace(folder_name: str, design: str, preview: str):
    name = str(folder_name or "").strip()
    if not valid_folder_name(name):
        raise ValueError("Invalid folder name")
    target = ROOT / "design" / name
    target.mkdir(parents=False, exist_ok=False)
    write_atomic(target / "DESIGN.md", design)
    write_atomic(target / "PREVIEW.md", preview)
    return {
        "folder": f"design/{name}",
        "design": f"design/{name}/DESIGN.md",
        "preview": f"design/{name}/PREVIEW.md",
    }


def instantiate_template(template_id: str, design: str, preview: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", str(template_id or "")):
        raise ValueError("Invalid template id")
    number = 1
    while True:
        name = f"{template_id}-{number:03d}"
        if not (ROOT / "design" / name).exists():
            return create_workspace(name, design, preview)
        number += 1


def write_current(info):
    design = str(info.get("design", ""))
    preview = str(info.get("preview", ""))
    if not re.fullmatch(r"design/[A-Za-z0-9_./-]+\.md", design, re.I):
        raise ValueError("Invalid DESIGN.md path")
    if not re.fullmatch(r"design/[A-Za-z0-9_./-]+\.md", preview, re.I):
        raise ValueError("Invalid PREVIEW.md path")
    payload = {
        "folder": str(info.get("folder") or str(Path(design).parent).replace("\\", "/")),
        "design": design,
        "preview": preview,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    write_atomic(ROOT / ".dmd" / "current.json", json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return payload


class Handler(SimpleHTTPRequestHandler):
    server_version = "D.md Python Server"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def json_response(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        if self.path.split("?", 1)[0].lower().endswith(".md"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/__workspace":
            return self.json_response(200, {"name": ROOT.name, "mode": "local-server"})
        if parsed.path == "/__list":
            kind = parse_qs(parsed.query).get("dir", [""])[0]
            files = list_markdown_files(kind)
            return self.json_response(200 if files is not None else 400, {"files": files} if files is not None else {"error": "dir must be design"})
        if parsed.path == "/__templates":
            return self.json_response(200, {"templates": list_templates()})
        return super().do_GET()

    def do_PUT(self):
        target = safe_path(self.path)
        if target is None or target.suffix.lower() != ".md":
            return self.json_response(403, {"error": "PUT is allowed for .md files only"})
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_BODY:
            return self.json_response(413, {"error": "Request body too large"})
        write_atomic(target, self.rfile.read(length).decode("utf-8"))
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        try:
            body = read_json(self)
            path_name = urlparse(self.path).path
            if path_name == "/__instantiate-template":
                result = instantiate_template(body.get("template"), str(body.get("design", "")), str(body.get("preview", "")))
                return self.json_response(201, result)
            if path_name == "/__save-as-workspace":
                result = create_workspace(body.get("folderName"), str(body.get("design", "")), str(body.get("preview", "")))
                return self.json_response(201, result)
            if path_name == "/__current":
                return self.json_response(200, write_current(body))
            return self.json_response(404, {"error": "Not found"})
        except FileExistsError:
            return self.json_response(400, {"error": "同名の作業フォルダが既にあります"})
        except Exception as error:
            return self.json_response(400, {"error": str(error)})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"D.md: http://localhost:{PORT}/", flush=True)
    print("終了は Ctrl+C", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
