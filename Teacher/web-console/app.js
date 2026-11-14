(() => {
  /* ---------------- 数据 ---------------- */
  let MACHINES = [
    { id: "PC-01", user: "陈一诺", ip: "192.168.10.11", row: "A", state: "active" },
    { id: "PC-02", user: "林小满", ip: "192.168.10.12", row: "A", state: "active" },
    { id: "PC-03", user: "周予安", ip: "192.168.10.13", row: "A", state: "locked" },
    { id: "PC-04", user: "许星河", ip: "192.168.10.14", row: "A", state: "alert" },
    { id: "PC-05", user: "沈知夏", ip: "192.168.10.15", row: "A", state: "idle" },
    { id: "PC-06", user: "", ip: "192.168.10.16", row: "A", state: "offline" },
    { id: "PC-07", user: "唐可欣", ip: "192.168.10.17", row: "B", state: "active" },
    { id: "PC-08", user: "贺嘉树", ip: "192.168.10.18", row: "B", state: "active" },
    { id: "PC-09", user: "江语澄", ip: "192.168.10.19", row: "B", state: "idle" },
    { id: "PC-10", user: "陆景行", ip: "192.168.10.20", row: "B", state: "alert" },
    { id: "PC-11", user: "苏念安", ip: "192.168.10.21", row: "B", state: "active" },
    { id: "PC-12", user: "", ip: "192.168.10.22", row: "B", state: "offline" }
  ];

  const STATE_LABEL = {
    active: "使用中",
    idle: "空闲",
    locked: "已锁定",
    alert: "异常",
    offline: "离线"
  };

  const STATE_TONE = {
    active: "ok",
    idle: "idle",
    locked: "lock",
    alert: "warn",
    offline: "off"
  };

  const VIEW_TITLE = { seat: "座位图", wall: "监看墙", list: "机器列表" };

  const state = {
    view: "wall",
    row: "",
    machineState: "",
    query: "",
    columns: 0,
    casting: false,
    blank: false,
    source: "teacher",
    scope: "all",
    whitelist: ["edu.cn", "python.org", "code.org", "khanacademy.org"],
    policy: { block: true, log: false },
    settings: { defaultSource: "整个屏幕", columns: "自动" },
    selected: new Set(["PC-01"]),
    log: []
  };

  /* ---------------- DOM ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const stageBody = $("#stageBody");
  const stageTitle = $("#stageTitle");
  const visibleCount = $("#visibleCount");
  const selChips = $("#selChips");
  const selCount = $("#selCount");
  const logList = $("#logList");
  const toasts = $("#toasts");
  const taskDialog = $("#taskDialog");
  const policyDialog = $("#policyDialog");
  const settingsDialog = $("#settingsDialog");

  /* ---------------- 后端接口 ----------------
     以 http(s) 打开时走后端（Python server），直接双击本地文件时自动退化为纯前端演示。 */
  const API = {
    online: location.protocol === "http:" || location.protocol === "https:",
    base: "/api",
    async init() {
      if (!this.online) return false;
      try {
        const res = await fetch(`${this.base}/state`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        applyServerState(data.state);
        this.listen();
        return true;
      } catch (err) {
        this.online = false;
        return false;
      }
    },
    listen() {
      try {
        const source = new EventSource(`${this.base}/events`);
        source.addEventListener("message", (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "state") applyServerState(message.data);
          } catch (err) {
            /* 忽略无法解析的消息 */
          }
        });
      } catch (err) {
        /* EventSource 不可用则保持本地模式 */
      }
    },
    async send(action, machines, payload) {
      if (!this.online) return false;
      try {
        const res = await fetch(`${this.base}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, machines, payload })
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.state) applyServerState(data.state);
        return true;
      } catch (err) {
        this.online = false;
        return false;
      }
    }
  };

  // 后端快照 → 界面。服务端是机器、投屏、策略、设置的唯一真相。
  function applyServerState(snapshot) {
    if (!snapshot) return;

    if (Array.isArray(snapshot.machines)) {
      MACHINES = snapshot.machines.map((m) => ({ ...m }));
      const ids = new Set(MACHINES.map((m) => m.id));
      state.selected = new Set([...state.selected].filter((id) => ids.has(id)));
    }

    if (snapshot.casting) {
      state.casting = Boolean(snapshot.casting.on);
      if (snapshot.casting.source) state.source = snapshot.casting.source;
      if (snapshot.casting.scope) state.scope = snapshot.casting.scope;
      castDraft = { source: state.source, scope: state.scope };
    }

    if (snapshot.policy) {
      state.whitelist = [...(snapshot.policy.whitelist || [])];
      state.policy = {
        block: Boolean(snapshot.policy.block),
        log: Boolean(snapshot.policy.log)
      };
    }

    if (snapshot.settings) {
      state.settings = { ...state.settings, ...snapshot.settings };
      state.columns =
        state.settings.columns === "每行 4 台" ? 4 : state.settings.columns === "每行 6 台" ? 6 : 0;
    }

    if (Array.isArray(snapshot.log)) {
      const localOnly = state.log.filter((entry) => entry.local);
      state.log = [...snapshot.log, ...localOnly].slice(0, 80);
    }

    renderLog();
    render();
  }

  // 传给后端的机器集合：范围=选中且确实有选中时给 id 列表，否则空数组表示全部
  function targetIds() {
    return state.scope === "selected" && state.selected.size ? [...state.selected] : [];
  }

  /* ---------------- 工具 ---------------- */
  const now = () =>
    new Date().toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  function toast(message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    toasts.appendChild(el);
    while (toasts.children.length > 3) toasts.firstElementChild.remove();
    window.setTimeout(() => el.remove(), 2400);
  }

  function log(action, detail = "", localOnly = false) {
    state.log.unshift({ time: now(), action, detail, local: localOnly });
    if (state.log.length > 80) state.log.pop();
    renderLog();
  }

  function renderLog() {
    logList.innerHTML = "";
    state.log.slice(0, 40).forEach((entry) => {
      const li = document.createElement("li");
      const time = document.createElement("time");
      time.textContent = entry.time;
      const action = document.createElement("b");
      action.textContent = entry.action;
      li.append(time, action);
      if (entry.detail) li.append(document.createTextNode(entry.detail));
      logList.appendChild(li);
    });
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  const byId = (id) => MACHINES.find((m) => m.id === id);
  const stateMatches = (m) => {
    if (!state.machineState) return true;
    if (state.machineState === "active") return m.state !== "offline";
    return m.state === state.machineState;
  };
  const visibleMachines = () =>
    MACHINES.filter((m) => {
      if (state.row && m.row !== state.row) return false;
      if (!stateMatches(m)) return false;
      if (!state.query) return true;
      return `${m.id} ${m.user} ${m.ip} ${STATE_LABEL[m.state]}`.toLowerCase().includes(state.query);
    });

  const selectedMachines = () => MACHINES.filter((m) => state.selected.has(m.id));

  function targetScope() {
    if (state.scope === "selected" && state.selected.size) {
      return { machines: selectedMachines(), label: `选中 ${state.selected.size} 台` };
    }
    const online = MACHINES.filter((m) => m.state !== "offline");
    return { machines: online, label: `全部 ${online.length} 台` };
  }

  /* ---------------- 渲染 ---------------- */
  function seatEl(m) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "seat";
    el.dataset.id = m.id;
    el.dataset.state = m.state;
    el.setAttribute("aria-pressed", String(state.selected.has(m.id)));
    el.title = `${m.id} · ${m.user || "未登录"} · ${m.ip} · ${STATE_LABEL[m.state]}`;
    if (state.selected.has(m.id)) el.classList.add("is-selected");

    el.innerHTML = `
      <span class="seat-top">
        <i class="led" data-tone="${STATE_TONE[m.state]}"></i>
        <span class="seat-id">${m.id}</span>
        <span class="seat-state">${STATE_LABEL[m.state]}</span>
      </span>
      <span class="seat-user">${m.user || "未登录"}</span>
      <span class="seat-meta">${m.ip}</span>
    `;
    return el;
  }

  function monEl(m) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "mon";
    el.dataset.id = m.id;
    el.dataset.state = m.state;
    el.setAttribute("aria-pressed", String(state.selected.has(m.id)));
    el.title = `${m.id} · ${m.user || "未登录"} · ${STATE_LABEL[m.state]}`;
    if (state.selected.has(m.id)) el.classList.add("is-selected");

    el.innerHTML = `
      <span class="mon-screen">
        <i class="sk sk-1"></i><i class="sk sk-2"></i><i class="sk sk-3"></i>
        <i class="sk sk-4"></i><i class="sk sk-5"></i>
      </span>
      <span class="mon-label">
        <i class="led" data-tone="${STATE_TONE[m.state]}"></i>${m.id}
        <span class="mon-name">${m.user || "未登录"}</span>
      </span>
    `;
    return el;
  }

  function renderSeats(list) {
    const grid = document.createElement("div");
    grid.className = "seat-grid";
    if (state.columns) grid.style.gridTemplateColumns = `repeat(${state.columns}, minmax(0, 1fr))`;
    list.forEach((m) => grid.appendChild(seatEl(m)));
    stageBody.appendChild(grid);
  }

  function renderWall(list) {
    const wall = document.createElement("div");
    wall.className = "wall";
    list.forEach((m) => wall.appendChild(monEl(m)));
    stageBody.appendChild(wall);
  }

  function renderList(list) {
    const table = document.createElement("table");
    table.className = "tbl";
    table.innerHTML = `
      <thead>
        <tr><th>机号</th><th>使用者</th><th>IPv4</th><th>状态</th><th>排</th></tr>
      </thead>
      <tbody></tbody>
    `;
    const body = table.querySelector("tbody");
    list.forEach((m) => {
      const tr = document.createElement("tr");
      tr.dataset.id = m.id;
      tr.dataset.state = m.state;
      if (state.selected.has(m.id)) tr.classList.add("is-selected");
      tr.innerHTML = `
        <td class="cell-mono">${m.id}</td>
        <td>${m.user || "<span class=\"cell-mono\">未登录</span>"}</td>
        <td class="cell-mono">${m.ip}</td>
        <td><span class="state-pill" data-state="${m.state}"><i class="led" data-tone="${STATE_TONE[m.state]}"></i>${STATE_LABEL[m.state]}</span></td>
        <td class="cell-mono">${m.row}</td>
      `;
      body.appendChild(tr);
    });
    stageBody.appendChild(table);
  }

  function render() {
    const list = visibleMachines();
    stageBody.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "没有匹配的机器";
      stageBody.appendChild(empty);
    } else if (state.view === "seat") renderSeats(list);
    else if (state.view === "wall") renderWall(list);
    else renderList(list);

    stageTitle.textContent = VIEW_TITLE[state.view];
    visibleCount.textContent = `${list.length} / ${MACHINES.length} 台`;
    renderChrome();
  }

  function renderChrome() {
    const online = MACHINES.filter((m) => m.state !== "offline").length;
    const alert = MACHINES.filter((m) => m.state === "alert").length;
    const offline = MACHINES.length - online;
    const selected = selectedMachines();

    $("#sbOnline").textContent = online;
    $("#sbAlert").textContent = alert;
    $("#sbOffline").textContent = offline;
    $("#sbSelected").textContent = selected.length;
    $("#sbCast").textContent = state.casting ? "进行中" : "关闭";

    selCount.textContent = `${selected.length} 台`;
    selChips.innerHTML = "";
    if (!selected.length) {
      const empty = document.createElement("span");
      empty.className = "chips-empty";
      empty.textContent = "未选择机器";
      selChips.appendChild(empty);
    } else {
      selected.forEach((m) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = m.id;
        selChips.appendChild(chip);
      });
    }

    paintCastSegs();
    $("#castHint").classList.toggle("is-live", state.casting);

    const castToggle = $("#castToggle");
    $("#castToggleLabel").textContent = state.casting ? "停止投屏" : "投屏";
    castToggle.classList.toggle("is-on", state.casting);
    castToggle.classList.toggle("abtn-primary", !state.casting);

    $("#castState").textContent = state.casting ? "投屏中" : "投屏关闭";
    $("#castLed").hidden = !state.casting;
    $("#blankBtn").classList.toggle("is-on", state.blank);
    $("#policyHint").textContent = `同步至在线 ${online} 台`;
    $("#targetLabel").textContent = targetScope().label;
  }

  /* ---------------- 选择 ---------------- */
  let anchorId = null;

  function selectAllVisible() {
    visibleMachines().forEach((m) => state.selected.add(m.id));
  }

  function invertVisible() {
    visibleMachines().forEach((m) => {
      if (state.selected.has(m.id)) state.selected.delete(m.id);
      else state.selected.add(m.id);
    });
  }

  function clearSelection() {
    state.selected.clear();
    anchorId = null;
  }

  function applyClickSelect(id, event) {
    const order = visibleMachines().map((m) => m.id);
    const from = anchorId ? order.indexOf(anchorId) : -1;
    const to = order.indexOf(id);

    if (event.shiftKey && from >= 0 && to >= 0) {
      if (!(event.ctrlKey || event.metaKey)) state.selected.clear();
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      order.slice(lo, hi + 1).forEach((x) => state.selected.add(x));
    } else if (event.ctrlKey || event.metaKey) {
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      anchorId = id;
    } else {
      state.selected.clear();
      state.selected.add(id);
      anchorId = id;
    }
    render();
  }

  /* ---------------- 框选（实时） ---------------- */
  let dragState = null;
  let marqueeEl = null;

  // 把拖拽矩形裁剪在监看区可见范围内，避免指针跑出边界后选框乱跑
  function dragRect(x0, y0, x1, y1) {
    const b = stageBody.getBoundingClientRect();
    return {
      left: Math.max(b.left, Math.min(x0, x1)),
      right: Math.min(b.right, Math.max(x0, x1)),
      top: Math.max(b.top, Math.min(y0, y1)),
      bottom: Math.min(b.bottom, Math.max(y0, y1))
    };
  }

  function updateMarquee(x0, y0, x1, y1) {
    const r = dragRect(x0, y0, x1, y1);
    if (!marqueeEl) {
      marqueeEl = document.createElement("div");
      marqueeEl.className = "marquee";
      document.body.appendChild(marqueeEl);
    }
    marqueeEl.style.left = `${r.left}px`;
    marqueeEl.style.top = `${r.top}px`;
    marqueeEl.style.width = `${Math.max(0, r.right - r.left)}px`;
    marqueeEl.style.height = `${Math.max(0, r.bottom - r.top)}px`;
  }

  function dropMarquee() {
    if (marqueeEl) {
      marqueeEl.remove();
      marqueeEl = null;
    }
  }

  function idsInRect(x0, y0, x1, y1) {
    const r = dragRect(x0, y0, x1, y1);
    return [...stageBody.querySelectorAll("[data-id]")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
      })
      .map((el) => el.dataset.id);
  }

  // 只改类名和计数，不重建列表，保证拖动时不掉帧
  function paintSelection() {
    [...stageBody.querySelectorAll("[data-id]")].forEach((el) => {
      const on = state.selected.has(el.dataset.id);
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-pressed", String(on));
    });
    renderChrome();
  }

  function applyDragSelection(hits, additive, base) {
    state.selected = new Set(additive ? [...base, ...hits] : hits);
    paintSelection();
  }

  stageBody.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("[data-id]")) return;
    dragState = {
      x0: event.clientX,
      y0: event.clientY,
      additive: event.ctrlKey || event.metaKey || event.shiftKey,
      moved: false,
      base: new Set(state.selected)
    };
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragState) return;
    const dx = event.clientX - dragState.x0;
    const dy = event.clientY - dragState.y0;
    if (!dragState.moved && Math.hypot(dx, dy) < 4) return;
    dragState.moved = true;
    updateMarquee(dragState.x0, dragState.y0, event.clientX, event.clientY);
    applyDragSelection(
      idsInRect(dragState.x0, dragState.y0, event.clientX, event.clientY),
      dragState.additive,
      dragState.base
    );
  });

  window.addEventListener("mouseup", (event) => {
    if (!dragState) return;
    const drag = dragState;
    dragState = null;
    dropMarquee();

    if (!drag.moved) {
      if (!drag.additive) {
        clearSelection();
        render();
      }
      return;
    }

    const hits = idsInRect(drag.x0, drag.y0, event.clientX, event.clientY);
    applyDragSelection(hits, drag.additive, drag.base);
    if (hits.length) anchorId = hits[hits.length - 1];
    log("框选", `${state.selected.size} 台`, true);
    render();
  });

  /* ---------------- 右键菜单 ---------------- */
  const ctxMenu = $("#ctxMenu");

  function closeCtx() {
    ctxMenu.hidden = true;
  }

  function openCtx(x, y, items, header) {
    ctxMenu.innerHTML = "";
    if (header) {
      const head = document.createElement("div");
      head.className = "ctx-head";
      head.textContent = header;
      ctxMenu.appendChild(head);
    }
    items.forEach((item) => {
      if (item === "-") {
        const sep = document.createElement("div");
        sep.className = "ctx-sep";
        ctxMenu.appendChild(sep);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.act = item.act;
      if (item.icon) btn.innerHTML = `<svg><use href="#${item.icon}"></use></svg>`;
      btn.append(document.createTextNode(item.label));
      ctxMenu.appendChild(btn);
    });

    ctxMenu.hidden = false;
    const box = ctxMenu.getBoundingClientRect();
    ctxMenu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - box.width - 6))}px`;
    ctxMenu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - box.height - 6))}px`;
  }

  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest("input, textarea, select")) return;
    event.preventDefault();
    const hit = event.target.closest("[data-id]");

    if (!hit || !stageBody.contains(hit)) {
      if (!stageBody.contains(event.target)) {
        closeCtx();
        return;
      }
      openCtx(
        event.clientX,
        event.clientY,
        [
          { label: "全选", act: "all" },
          { label: "反选", act: "invert" },
          { label: "清除选择", act: "clear" }
        ],
        "机房操作"
      );
      return;
    }

    const machine = byId(hit.dataset.id);
    if (!state.selected.has(machine.id)) {
      state.selected.clear();
      state.selected.add(machine.id);
      anchorId = machine.id;
      render();
    }

    const picked = selectedMachines().length;
    openCtx(
      event.clientX,
      event.clientY,
      [
        { label: "投屏此机", icon: "i-screen", act: "cast" },
        { label: "远程控制", icon: "i-control", act: "remote" },
        { label: "锁定屏幕", icon: "i-lock", act: "lock" },
        "-",
        { label: "重启", act: "restart" },
        { label: "关机", act: "off" },
        { label: "开机", act: "on" },
        "-",
        { label: "仅选此机", act: "only" }
      ],
      `${machine.id} · ${machine.user || "未登录"}${picked > 1 ? ` · 已选 ${picked} 台` : ""}`
    );
  });

  ctxMenu.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    closeCtx();

    const picked = selectedMachines();
    const label = picked.length ? `选中 ${picked.length} 台` : "全部";
    const texts = {
      cast: ["投屏", "投屏已开始"],
      remote: ["远程控制", "远程控制已进入"],
      lock: ["锁定屏幕", "锁定指令已下发"],
      restart: ["重启", "重启指令已下发"],
      off: ["关机", "关机指令已下发"],
      on: ["开机", "开机指令已下发"]
    };

    if (act === "all") {
      selectAllVisible();
      log("全选", `${visibleMachines().length} 台`, true);
      render();
      return;
    }
    if (act === "invert") {
      invertVisible();
      log("反选", "", true);
      render();
      return;
    }
    if (act === "clear") {
      clearSelection();
      log("清除选择", "", true);
      render();
      return;
    }
    if (act === "only") {
      render();
      return;
    }

    if (act === "cast" && !state.casting) toggleCast(true);

    const pickedIds = [...state.selected];
    if (act === "lock") void API.send("lock", pickedIds, {});
    else if (act === "remote") void API.send("remote", pickedIds, {});
    else if (act === "restart" || act === "off" || act === "on") {
      void API.send("power", pickedIds, { mode: act });
    }

    const [name, said] = texts[act] || [act, act];
    log(name, `→ ${label}`);
    toast(`${said} · ${label}`);
  });

  document.addEventListener("mousedown", (event) => {
    if (!ctxMenu.hidden && !ctxMenu.contains(event.target)) closeCtx();
  });

  window.addEventListener("blur", closeCtx);
  window.addEventListener("resize", closeCtx);
  stageBody.addEventListener("scroll", closeCtx);

  /* ---------------- 广播 / 电源 ---------------- */
  function toggleCast(force) {
    state.casting = typeof force === "boolean" ? force : !state.casting;
    if (state.casting) {
      const target = targetScope();
      log("投屏开始", `→ ${target.label}`);
      toast(`投屏已开始 · ${target.label}`);
    } else {
      log("投屏停止", "");
      toast("投屏已停止");
    }
    renderChrome();
    void API.send("cast", targetIds(), {
      on: state.casting,
      source: state.source,
      scope: state.scope
    });
  }

  const POWER_LABEL = { on: "开机", off: "关机", restart: "重启" };

  function power(action) {
    const target = targetScope();
    log(POWER_LABEL[action], `→ ${target.label}`);
    toast(`${POWER_LABEL[action]}指令已下发 · ${target.label}`);
    const tag = action === "on" ? "开机" : action === "off" ? "关机" : "重启";
    stageTitle.textContent = `${VIEW_TITLE[state.view]} · ${tag}`;
    window.setTimeout(() => { stageTitle.textContent = VIEW_TITLE[state.view]; }, 1400);
    void API.send("power", targetIds(), { mode: action });
  }

  /* ---------------- 任务下发 ---------------- */
  const TASK = {
    file: {
      title: "下发文件",
      confirm: "开始下发",
      body: `
        <p class="note">选择的文件将下发到目标学生的桌面目录。</p>
        <label class="drop">
          <span id="dropLabel">点击选择文件，或拖到此处</span>
          <input type="file" hidden>
        </label>
      `,
      detail: (t) => `→ ${t.label}`
    },
    url: {
      title: "打开网址",
      confirm: "打开网址",
      body: `
        <p class="note">目标机器将用默认浏览器打开该地址，白名单外的站点会被拦截。</p>
        <input class="input" id="urlField" type="url" value="https://www.python.org/" aria-label="网址">
      `,
      detail: (t) => `${$("#urlField")?.value || "网址"} → ${t.label}`
    },
    app: {
      title: "启动程序",
      confirm: "启动",
      body: `
        <p class="note">在目标机器上启动指定程序，已运行的同名进程会先被关闭。</p>
        <select class="input" id="appField" aria-label="程序">
          <option>Python 3.12</option>
          <option>Visual Studio Code</option>
          <option>画图</option>
          <option>计算器</option>
        </select>
      `,
      detail: (t) => `${$("#appField")?.value || "程序"} → ${t.label}`
    }
  };

  let activeTask = null;

  function openTask(type) {
    const cfg = TASK[type];
    if (!cfg) return;
    activeTask = type;
    $("#taskTitle").textContent = cfg.title;
    $("#taskHint").textContent = `目标：${targetScope().label}`;
    $("#taskBody").innerHTML = cfg.body;
    $("#taskConfirm").textContent = cfg.confirm;

    const fileInput = $("#taskBody input[type=file]");
    if (fileInput) {
      const drop = fileInput.closest(".drop");
      const label = $("#dropLabel");
      fileInput.addEventListener("change", () => {
        if (fileInput.files.length) label.textContent = fileInput.files[0].name;
      });
      ["dragenter", "dragover"].forEach((t) =>
        drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-over"); })
      );
      ["dragleave", "drop"].forEach((t) =>
        drop.addEventListener(t, () => drop.classList.remove("is-over"))
      );
      drop.addEventListener("drop", (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) label.textContent = file.name;
      });
    }
    openDialog(taskDialog);
  }

  /* ---------------- 事件 ---------------- */
  stageBody.addEventListener("click", (event) => {
    const target = event.target.closest("[data-id]");
    if (!target) return;
    applyClickSelect(target.dataset.id, event);
  });

  stageBody.addEventListener("dblclick", (event) => {
    const target = event.target.closest("[data-id]");
    if (!target) return;
    const m = byId(target.dataset.id);
    if (m.state === "offline") toast(`${m.id} 当前离线，无法接管画面`);
    else if (m.state === "locked") toast(`${m.id} 处于锁定状态，请先解锁`);
    else {
      log("接管画面", m.id);
      toast(`正在接管 ${m.id} · ${m.user}`);
    }
  });

  document.querySelectorAll(".rail-btn[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      document.querySelectorAll(".rail-btn[data-view]").forEach((b) =>
        b.classList.toggle("is-active", b === button)
      );
      render();
    });
  });

  function bindSeg(container, key, cast = (v) => v) {
    $(container).addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const value = cast(button.dataset[key] ?? "");
      state[key === "row" ? "row" : key === "state" ? "machineState" : key] = value;
      [...$(container).children].forEach((b) => b.classList.toggle("is-active", b === button));
      render();
    });
  }

  bindSeg("#rowSeg", "row");
  bindSeg("#stateSeg", "state");

  /* 投屏设置：同样草稿式，改动后出现保存条 */
  let castDraft = { source: state.source, scope: state.scope };

  function paintCastSegs() {
    [...$("#sourceSeg").children].forEach((b) =>
      b.classList.toggle("is-active", b.dataset.source === castDraft.source)
    );
    [...$("#scopeSeg").children].forEach((b) =>
      b.classList.toggle("is-active", b.dataset.scope === castDraft.scope)
    );
    const dirty = castDraft.source !== state.source || castDraft.scope !== state.scope;
    $("#castActions").hidden = !dirty;
    $("#castHint").textContent = state.casting ? "进行中" : "未开始";
  }

  $("#sourceSeg").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    castDraft.source = button.dataset.source;
    paintCastSegs();
  });

  $("#scopeSeg").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    castDraft.scope = button.dataset.scope;
    paintCastSegs();
  });

  $("#castSave").addEventListener("click", () => {
    state.source = castDraft.source;
    state.scope = castDraft.scope;
    const sourceText = state.source === "teacher" ? "教师机" : "学生机";
    const scopeText = state.scope === "all" ? "全部" : "选中";
    log("投屏设置保存", `${sourceText} / ${scopeText}`);
    toast(`投屏设置已保存 · ${sourceText} / ${scopeText}`);
    paintCastSegs();
    renderChrome();
  });

  $("#castCancel").addEventListener("click", () => {
    castDraft = { source: state.source, scope: state.scope };
    paintCastSegs();
    log("投屏设置未保存", "已放弃本次修改");
  });

  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  $("#selectAllBtn").addEventListener("click", () => {
    selectAllVisible();
    log("全选", `${visibleMachines().length} 台`, true);
    render();
  });

  $("#invertBtn").addEventListener("click", () => {
    invertVisible();
    log("反选", "", true);
    render();
  });

  $("#clearBtn").addEventListener("click", () => {
    clearSelection();
    log("清除选择", "", true);
    render();
  });

  $("#castToggle").addEventListener("click", () => toggleCast());

  $("#blankBtn").addEventListener("click", () => {
    state.blank = !state.blank;
    const target = targetScope();
    log(state.blank ? "黑屏肃静 开启" : "黑屏肃静 关闭", `→ ${target.label}`);
    toast(state.blank ? "黑屏肃静已开启" : "黑屏肃静已关闭");
    renderChrome();
    void API.send("blank", targetIds(), { on: state.blank });
  });

  $("#lockBtn").addEventListener("click", () => {
    const target = targetScope();
    log("锁定屏幕", `→ ${target.label}`);
    toast(`锁定指令已下发 · ${target.label}`);
    void API.send("lock", targetIds(), {});
  });

  $("#remoteBtn").addEventListener("click", () => {
    const target = targetScope();
    log("远程控制", `→ ${target.label}`);
    toast(`远程控制已进入 · ${target.label}`);
    void API.send("remote", targetIds(), {});
  });

  $("#demoBtn").addEventListener("click", () => {
    const target = targetScope();
    log("学生演示", `→ ${target.label}`);
    toast(`学生演示已开启 · ${target.label}`);
    void API.send("demo", targetIds(), {});
  });

  /* 控制台设置：草稿式 */
  let settingsSaved = false;
  let settingsChanged = false;

  function setSettingsDirty(dirty) {
    settingsChanged = dirty;
    $("#settingsDirty").hidden = !dirty;
  }

  function openSettings() {
    settingsSaved = false;
    $("#setSource").value = state.settings.defaultSource;
    $("#setColumns").value = state.settings.columns;
    setSettingsDirty(false);
    openDialog(settingsDialog);
  }

  $("#railSettings").addEventListener("click", openSettings);

  $("#setSource").addEventListener("change", () => setSettingsDirty(true));
  $("#setColumns").addEventListener("change", () => setSettingsDirty(true));

  settingsDialog.addEventListener("close", () => {
    if (!settingsSaved && settingsChanged) log("控制台设置未保存", "已放弃本次修改");
    setSettingsDirty(false);
  });

  document.querySelectorAll("[data-power]").forEach((button) => {
    button.addEventListener("click", () => power(button.dataset.power));
  });

  document.querySelectorAll("[data-task]").forEach((button) => {
    button.addEventListener("click", () => openTask(button.dataset.task));
  });

  const switches = [
    ["#swUsb", "锁定外设"],
    ["#swInstall", "禁止安装"],
    ["#swInternet", "上网限制"]
  ];

  switches.forEach(([sel, name]) => {
    const input = $(sel);
    input.addEventListener("change", () => {
      const target = targetScope();
      log(input.checked ? `${name} 开启` : `${name} 关闭`, `→ ${target.label}`);
      toast(`${name}已${input.checked ? "开启" : "关闭"}`);
    });
  });

  $("#clearSelBtn").addEventListener("click", () => {
    state.selected.clear();
    log("清除选择", "", true);
    render();
  });

  $("#logClearBtn").addEventListener("click", () => {
    state.log = [];
    renderLog();
  });

  $("#policyBtn").addEventListener("click", openPolicy);

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });

  $("#taskConfirm").addEventListener("click", () => {
    const cfg = TASK[activeTask];
    if (!cfg) return;
    const target = targetScope();
    const detail = cfg.detail(target);
    log(cfg.title, detail);
    toast(`${cfg.title}指令已下发 · ${target.label}`);
    closeDialog(taskDialog);
    void API.send("task", targetIds(), { title: cfg.title, detail });
  });

  /* 白名单：弹窗内只改草稿，点保存才写入状态，取消即丢弃 */
  const tagInput = $("#tagInput");
  const tagField = $("#tagInputField");
  let policyDirty = false;
  let policySaved = false;

  function renderPolicyTags(list) {
    tagInput.querySelectorAll(".tag").forEach((tag) => tag.remove());
    list.forEach((site) => {
      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = "tag";
      tag.dataset.site = site;
      tag.title = "点击移除";
      tag.textContent = site;
      tagInput.insertBefore(tag, tagField);
    });
  }

  function draftSites() {
    return [...tagInput.querySelectorAll(".tag")].map((tag) => tag.dataset.site);
  }

  function setPolicyDirty(dirty) {
    policyDirty = dirty;
    $("#policyDirty").hidden = !dirty;
  }

  function openPolicy() {
    policySaved = false;
    renderPolicyTags(state.whitelist);
    $("#policyBlock").checked = state.policy.block;
    $("#policyLog").checked = state.policy.log;
    tagField.value = "";
    setPolicyDirty(false);
    openDialog(policyDialog);
  }

  policyDialog.addEventListener("close", () => {
    if (!policySaved && policyDirty) log("白名单未保存", "已放弃本次修改");
    setPolicyDirty(false);
  });

  tagField.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = tagField.value.trim();
    if (!value || draftSites().includes(value)) return;

    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = "tag";
    tag.dataset.site = value;
    tag.title = "点击移除";
    tag.textContent = value;
    tagInput.insertBefore(tag, tagField);
    tagField.value = "";
    setPolicyDirty(true);
  });

  tagInput.addEventListener("click", (event) => {
    const tag = event.target.closest(".tag");
    if (!tag) return;
    tag.remove();
    setPolicyDirty(true);
  });

  $("#policyBlock").addEventListener("change", () => setPolicyDirty(true));
  $("#policyLog").addEventListener("change", () => setPolicyDirty(true));

  $("#policySave").addEventListener("click", () => {
    state.whitelist = draftSites();
    state.policy = {
      block: $("#policyBlock").checked,
      log: $("#policyLog").checked
    };
    policySaved = true;
    log("白名单保存", `${state.whitelist.length} 个域名`);
    toast(`白名单已保存 · ${state.whitelist.length} 个域名`);
    closeDialog(policyDialog);
    void API.send("policy", [], {
      block: state.policy.block,
      log: state.policy.log,
      whitelist: state.whitelist
    });
  });

  $("#settingsSave").addEventListener("click", () => {
    state.settings.defaultSource = $("#setSource").value;
    state.settings.columns = $("#setColumns").value;
    state.columns =
      state.settings.columns === "每行 4 台" ? 4 : state.settings.columns === "每行 6 台" ? 6 : 0;
    settingsSaved = true;
    log("控制台设置保存", `${state.settings.defaultSource} · ${state.settings.columns}`);
    toast("控制台设置已保存");
    closeDialog(settingsDialog);
    render();
    void API.send("settings", [], {
      defaultSource: state.settings.defaultSource,
      columns: state.settings.columns
    });
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#searchInput").focus();
      return;
    }
    if (event.key === "Escape" && dragState) {
      state.selected = new Set(dragState.base);
      dragState = null;
      dropMarquee();
      paintSelection();
      return;
    }

    if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
      const input = $("#searchInput");
      if (!input.value) return;
      input.value = "";
      state.query = "";
      render();
    }
  });

  /* ---------------- 时钟 ---------------- */
  function tick() {
    $("#clock").textContent = now();
  }

  /* ---------------- 启动 ---------------- */
  log("控制台就绪", `${MACHINES.length} 个座位`);
  renderLog();
  render();
  tick();
  window.setInterval(tick, 1000);

  // 有后端就以后端为准（本地双击打开时自动跳过）
  void API.init();
})();
