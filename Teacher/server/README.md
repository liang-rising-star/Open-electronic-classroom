# Open Electronic Classroom · 教师端后端

机房状态服务，Python 标准库实现，**零第三方依赖**。同时托管前端页面、提供 JSON API，并用 SSE 把状态变化推给页面。

## 运行

```bash
cd Teacher/server
python app.py                    # http://127.0.0.1:8800/web-console/index.html
python app.py --port 9000
python app.py --simulate         # 开启设备状态模拟器（演示用）
python app.py --host 0.0.0.0     # 允许局域网访问（学生端将来接这里）
```

打开上面的地址就是完整控制台；页面检测到自己在 http(s) 下会自动连后端，双击本地文件则退化为纯前端演示。

## API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/state` | 完整快照：机器、投屏、策略、设置、日志 |
| GET | `/api/events` | SSE 事件流，状态变化时推送 `{"type":"state","data":<快照>}`，15 秒心跳 |
| POST | `/api/command` | 下发命令，返回执行后的完整快照 |
| GET | `/api/health` | 健康检查 |
| GET | `/web-console/*`、`/icon/*` | 静态资源（`/` 会 302 到控制台页面） |

### POST /api/command

```json
{
  "action": "power",
  "machines": ["PC-01", "PC-03"],
  "payload": { "mode": "off" }
}
```

- `machines` 为空数组表示全部在线机器
- 常见错误：`400 invalid JSON`、`400 unknown action`、`403 forbidden`（路径穿越）

### action 一览

| action | payload | 效果 |
| --- | --- | --- |
| `cast` | `{on, source, scope}` | 开/关投屏，记录来源与范围 |
| `power` | `{mode: on\|off\|restart}` | 目标机器 → 空闲 / 离线 / 使用中 |
| `lock` / `unlock` | — | 目标机器置为 `locked` / `active` |
| `blank` | `{on}` | 黑屏肃静的开关标记 |
| `remote` / `demo` | — | 只记录日志（真实实现时这里下发接管/转播） |
| `task` | `{title, detail}` | 文件 / 网址 / 程序下发，记录日志 |
| `policy` | `{block, log, whitelist[]}` | 覆盖访问策略 |
| `settings` | `{defaultSource, columns}` | 覆盖控制台设置 |

## 状态模型

```python
machine = {
    "id": "PC-01", "user": "陈一诺", "ip": "192.168.10.11",
    "row": "A", "state": "active",     # active | idle | locked | alert | offline
    "blank": False                      # 黑屏肃静是否生效
}
```

日志保留最近 80 条，API 返回最近 40 条，格式 `{time, action, detail}`。

## 模拟器

`--simulate`（默认每 6 秒，可用 `--simulate-interval` 调整）会随机让学生打开非教学程序、离线机器上线，
用来观察 SSE 推送和控制台联动。生产环境不要开。

## 与桌面外壳的关系

`Teacher/desktop` 默认加载随包的静态页面；加上 `--server=http://127.0.0.1:8800` 就改为连这个后端：

```bash
Open-electronic-classroom.exe --server=http://127.0.0.1:8800
```
