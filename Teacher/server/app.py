"""机房教师端后端：标准库实现，无第三方依赖。

职责：
  - 托管 Teacher/web-console 的静态页面，并让页面里的 ../icon 相对路径可用
  - 提供机房状态 API（机器、投屏、策略、设置、操作日志）
  - 通过 SSE 把状态变化实时推给前端
  - --simulate 时用后台线程模拟设备状态变化，方便演示

用法：
  python app.py                 # http://127.0.0.1:8800/web-console/index.html
  python app.py --port 9000 --simulate
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import queue
import random
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

TEACHER_ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = TEACHER_ROOT / "web-console"
ICON_ROOT = TEACHER_ROOT / "icon"

MACHINE_TEMPLATE = [
    {"id": "PC-01", "user": "陈一诺", "ip": "192.168.10.11", "row": "A", "state": "active"},
    {"id": "PC-02", "user": "林小满", "ip": "192.168.10.12", "row": "A", "state": "active"},
    {"id": "PC-03", "user": "周予安", "ip": "192.168.10.13", "row": "A", "state": "locked"},
    {"id": "PC-04", "user": "许星河", "ip": "192.168.10.14", "row": "A", "state": "alert"},
    {"id": "PC-05", "user": "沈知夏", "ip": "192.168.10.15", "row": "A", "state": "idle"},
    {"id": "PC-06", "user": "", "ip": "192.168.10.16", "row": "A", "state": "offline"},
    {"id": "PC-07", "user": "唐可欣", "ip": "192.168.10.17", "row": "B", "state": "active"},
    {"id": "PC-08", "user": "贺嘉树", "ip": "192.168.10.18", "row": "B", "state": "active"},
    {"id": "PC-09", "user": "江语澄", "ip": "192.168.10.19", "row": "B", "state": "idle"},
    {"id": "PC-10", "user": "陆景行", "ip": "192.168.10.20", "row": "B", "state": "alert"},
    {"id": "PC-11", "user": "苏念安", "ip": "192.168.10.21", "row": "B", "state": "active"},
    {"id": "PC-12", "user": "", "ip": "192.168.10.22", "row": "B", "state": "offline"},
]

VALID_STATES = {"active", "idle", "locked", "alert", "offline"}
MAX_LOG = 80


class Lab:
    """机房状态与命令处理，所有读写都在锁内完成。"""

    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.machines = [dict(m) for m in MACHINE_TEMPLATE]
        for m in self.machines:
            m["blank"] = False
        self.casting = {"on": False, "source": "teacher", "scope": "all"}
        self.policy = {
            "block": True,
            "log": False,
            "whitelist": ["edu.cn", "python.org", "code.org", "khanacademy.org"],
        }
        self.settings = {"defaultSource": "整个屏幕", "columns": "自动"}
        self.log: list[dict] = []
        self.clients: set[queue.Queue] = set()
        self._log("控制台就绪", f"{len(self.machines)} 个座位")

    # ---------- 日志 ----------
    def _log(self, action: str, detail: str = "") -> None:
        self.log.insert(0, {"time": time.strftime("%H:%M:%S"), "action": action, "detail": detail})
        del self.log[MAX_LOG:]

    # ---------- 快照 ----------
    def snapshot(self) -> dict:
        with self.lock:
            return {
                "room": "第三机房 · A 区",
                "teacher": {"host": "TEACHER-01", "ip": "192.168.10.2"},
                "machines": [dict(m) for m in self.machines],
                "casting": dict(self.casting),
                "policy": {**self.policy, "whitelist": list(self.policy["whitelist"])},
                "settings": dict(self.settings),
                "log": [dict(e) for e in self.log[:40]],
            }

    # ---------- 订阅 ----------
    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=64)
        with self.lock:
            self.clients.add(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self.lock:
            self.clients.discard(q)

    def _broadcast(self) -> None:
        payload = {"type": "state", "data": self.snapshot()}
        with self.lock:
            targets = list(self.clients)
        for q in targets:
            try:
                q.put_nowait(payload)
            except queue.Full:
                pass

    # ---------- 命令 ----------
    def command(self, action: str, machine_ids: list[str], payload: dict) -> dict:
        ids = set(machine_ids or [])
        targets = [m for m in self.machines if not ids or m["id"] in ids]

        with self.lock:
            if action == "cast":
                self.casting = {
                    "on": bool(payload.get("on", True)),
                    "source": payload.get("source", self.casting["source"]),
                    "scope": payload.get("scope", self.casting["scope"]),
                }
                src = "教师机" if self.casting["source"] == "teacher" else "学生机"
                if self.casting["on"]:
                    self._log("投屏开始", f"{src} · {len(targets)} 台")
                else:
                    self._log("投屏停止", "")

            elif action == "power":
                mode = payload.get("mode", "off")
                state = {"on": "idle", "off": "offline", "restart": "active"}.get(mode, "offline")
                for m in targets:
                    m["state"] = state
                    if state == "offline":
                        m["blank"] = False
                self._log(
                    {"on": "开机", "off": "关机", "restart": "重启"}[mode],
                    f"→ {len(targets)} 台",
                )

            elif action in ("lock", "unlock"):
                state = "locked" if action == "lock" else "active"
                for m in targets:
                    m["state"] = state
                self._log("锁定屏幕" if action == "lock" else "解锁屏幕", f"→ {len(targets)} 台")

            elif action == "blank":
                on = bool(payload.get("on", True))
                for m in targets:
                    m["blank"] = on
                self._log("黑屏肃静 开启" if on else "黑屏肃静 关闭", f"→ {len(targets)} 台")

            elif action in ("remote", "demo"):
                self._log("远程控制" if action == "remote" else "学生演示", f"→ {len(targets)} 台")

            elif action == "task":
                self._log(payload.get("title", "下发任务"), payload.get("detail", ""))

            elif action == "policy":
                self.policy = {
                    "block": bool(payload.get("block", True)),
                    "log": bool(payload.get("log", False)),
                    "whitelist": [str(s) for s in payload.get("whitelist", [])],
                }
                self._log("白名单保存", f"{len(self.policy['whitelist'])} 个域名")

            elif action == "settings":
                self.settings = {
                    "defaultSource": payload.get("defaultSource", self.settings["defaultSource"]),
                    "columns": payload.get("columns", self.settings["columns"]),
                }
                self._log(
                    "控制台设置保存",
                    f"{self.settings['defaultSource']} · {self.settings['columns']}",
                )

            else:
                raise ValueError(f"unknown action: {action}")

            self._broadcast()
            return self.snapshot()

    # ---------- 模拟器 ----------
    def simulate_tick(self) -> None:
        """随机制造一点机房动静：学生打开非教学程序、离线机器上线等。"""
        with self.lock:
            online = [m for m in self.machines if m["state"] != "offline"]
            offline = [m for m in self.machines if m["state"] == "offline"]
            roll = random.random()
            if roll < 0.4 and online:
                m = random.choice(online)
                if m["state"] == "alert":
                    m["state"] = "active"
                    self._log("恢复", f"{m['id']} 关闭了非教学程序")
                else:
                    m["state"] = "alert"
                    self._log("异常", f"{m['id']} 检测到非教学程序")
            elif roll < 0.55 and offline:
                m = random.choice(offline)
                m["state"] = "idle"
                self._log("上线", m["id"])
            else:
                return
            self._broadcast()


class Handler(BaseHTTPRequestHandler):
    server_version = "OEC/1.0"
    protocol_version = "HTTP/1.1"

    @property
    def lab(self) -> Lab:
        return self.server.lab  # type: ignore[attr-defined]

    # ---------- 基础响应 ----------
    def _send(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, data: dict) -> None:
        self._send(code, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _error(self, code: int, message: str) -> None:
        self._json(code, {"ok": False, "error": message})

    # ---------- 路由 ----------
    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path

        if path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/web-console/index.html")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if path == "/api/state":
            self._json(200, {"ok": True, "state": self.lab.snapshot()})
            return

        if path == "/api/health":
            self._json(200, {"ok": True, "machines": len(self.lab.machines)})
            return

        if path == "/api/events":
            self._events()
            return

        if path.startswith("/web-console/"):
            self._static(WEB_ROOT / path[len("/web-console/"):])
            return

        if path.startswith("/icon/"):
            self._static(ICON_ROOT / path[len("/icon/"):])
            return

        self._error(404, "not found")

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/api/command":
            self._error(404, "not found")
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 1_000_000:
            self._error(400, "empty or oversized body")
            return

        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error(400, "invalid JSON")
            return

        action = body.get("action")
        if not isinstance(action, str):
            self._error(400, "missing action")
            return

        ids = body.get("machines") or []
        if not isinstance(ids, list) or any(not isinstance(i, str) for i in ids):
            self._error(400, "machines must be a list of ids")
            return

        payload = body.get("payload") or {}
        if not isinstance(payload, dict):
            self._error(400, "payload must be an object")
            return

        try:
            snapshot = self.lab.command(action, ids, payload)
        except ValueError as exc:
            self._error(400, str(exc))
            return

        self._json(200, {"ok": True, "state": snapshot})

    # ---------- SSE ----------
    def _events(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        client = self.lab.subscribe()
        try:
            self.wfile.write(b"retry: 3000\n\n")
            self.wfile.write(
                f"data: {json.dumps({'type': 'state', 'data': self.lab.snapshot()}, ensure_ascii=False)}\n\n".encode()
            )
            self.wfile.flush()
            while not self.server.stopping:  # type: ignore[attr-defined]
                try:
                    message = client.get(timeout=15)
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    continue
                self.wfile.write(f"data: {json.dumps(message, ensure_ascii=False)}\n\n".encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            self.lab.unsubscribe(client)
            self.close_connection = True

    # ---------- 静态文件 ----------
    def _static(self, path: Path) -> None:
        try:
            resolved = path.resolve()
            resolved.relative_to(TEACHER_ROOT)
        except (ValueError, OSError):
            self._error(403, "forbidden")
            return

        if not resolved.is_file():
            self._error(404, "not found")
            return

        ctype = mimetypes.guess_type(str(resolved))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        body = resolved.read_bytes()
        self._send(200, body, ctype)

    def log_message(self, fmt: str, *args) -> None:  # 安静一点
        if "/api/events" in self.path:
            return
        super().log_message(fmt, *args)


def build_server(host: str, port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    server.lab = Lab()  # type: ignore[attr-defined]
    server.stopping = False  # type: ignore[attr-defined]
    return server


def run_simulator(server: ThreadingHTTPServer, interval: float) -> None:
    lab: Lab = server.lab  # type: ignore[attr-defined]
    while not server.stopping:  # type: ignore[attr-defined]
        time.sleep(interval)
        if server.stopping:  # type: ignore[attr-defined]
            break
        lab.simulate_tick()


def main() -> None:
    parser = argparse.ArgumentParser(description="Open Electronic Classroom 教师端后端")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址（默认本机）")
    parser.add_argument("--port", type=int, default=8800, help="监听端口（默认 8800）")
    parser.add_argument("--simulate", action="store_true", help="开启设备状态模拟器")
    parser.add_argument("--simulate-interval", type=float, default=6.0, help="模拟间隔秒数")
    args = parser.parse_args()

    server = build_server(args.host, args.port)
    if args.simulate:
        threading.Thread(target=run_simulator, args=(server, args.simulate_interval), daemon=True).start()

    print(f"教师端后端已启动: http://{args.host}:{args.port}/web-console/index.html")
    print("按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.stopping = True  # type: ignore[attr-defined]
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
