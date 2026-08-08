(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const loginScreen = $("#login-screen");
  const appScreen = $("#app-screen");
  const connDot = $("#conn-dot");
  const tierBadge = $("#tier-badge");

  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.status === 401) {
      showLogin();
      throw new Error("Not authenticated");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
    return body;
  }

  function showLogin() {
    loginScreen.hidden = false;
    appScreen.hidden = true;
  }

  function showApp() {
    loginScreen.hidden = true;
    appScreen.hidden = false;
    initApp();
  }

  // --- Login ---
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = $("#login-password").value;
    const errorEl = $("#login-error");
    errorEl.hidden = true;
    try {
      await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }).then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Login failed");
      });
      showApp();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  // --- Tabs ---
  let appInitialized = false;
  function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    $$(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".tab").forEach((b) => b.classList.remove("active"));
        $$(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        $(`#tab-${btn.dataset.tab}`).classList.add("active");
        loadTab(btn.dataset.tab);
      });
    });

    loadTab("dashboard");
    connectWebSocket();
    setInterval(() => loadTab(currentTab(), true), 15000);

    $("#btn-stop").addEventListener("click", () => api("/control/stop", { method: "POST" }));
    $("#btn-start").addEventListener("click", () => api("/control/start", { method: "POST" }));
    $("#btn-refresh-logs").addEventListener("click", loadLogs);

    $("#chat-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#chat-input");
      const message = input.value.trim();
      if (!message) return;
      appendChat("user", message);
      input.value = "";
      try {
        const { reply } = await api("/chat", { method: "POST", body: JSON.stringify({ message }) });
        appendChat("agent", reply);
      } catch (err) {
        appendChat("agent", `Error: ${err.message}`);
      }
    });
  }

  function currentTab() {
    return $(".tab.active")?.dataset.tab || "dashboard";
  }

  function loadTab(tab, silent) {
    const loaders = {
      dashboard: loadDashboard,
      approvals: loadApprovals,
      soul: loadSoul,
      lineage: loadLineage,
      skills: loadSkills,
      logs: loadLogs,
    };
    loaders[tab]?.(silent);
  }

  // --- Dashboard ---
  async function loadDashboard() {
    try {
      const { config, survival, walletBalanceEth } = await api("/status");
      applySurvival(survival);
      $("#stat-balance").textContent = walletBalanceEth === null ? "unavailable" : `${walletBalanceEth} ETH`;
      $("#agent-name").textContent = config.name;
      const identity = $("#identity-list");
      identity.innerHTML = "";
      const rows = [
        ["Wallet", config.walletAddress],
        ["Creator", config.creatorAddress],
        ["Generation", `${config.generation}${config.parentId ? ` (child of ${config.parentId})` : " (genesis)"}`],
        ["Created", new Date(config.createdAt).toLocaleString()],
      ];
      for (const [k, v] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        identity.append(dt, dd);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function applySurvival(survival) {
    $("#stat-credits").textContent = survival.credits.toFixed(4);
    $("#stat-tier").textContent = survival.tier;
    $("#stat-model").textContent = survival.model;
    tierBadge.textContent = survival.tier;
    tierBadge.className = `tier-badge ${survival.tier}`;
  }

  // --- Chat ---
  function appendChat(role, text) {
    const log = $("#chat-log");
    const bubble = document.createElement("div");
    bubble.className = `chat-msg ${role}`;
    bubble.textContent = text;
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  }

  // --- Approvals ---
  async function loadApprovals() {
    try {
      const { actions } = await api("/pending-actions");
      const list = $("#approvals-list");
      list.innerHTML = "";
      const pendingCount = actions.filter((a) => a.status === "pending").length;
      const countBadge = $("#approvals-count");
      countBadge.textContent = String(pendingCount);
      countBadge.hidden = pendingCount === 0;

      if (actions.length === 0) {
        list.innerHTML = '<p class="muted">No pending actions.</p>';
        return;
      }

      for (const action of actions) {
        const item = document.createElement("div");
        item.className = "list-item";
        item.innerHTML = `
          <div class="meta">#${action.id} · ${action.toolName} · <span class="status-pill ${action.status}">${action.status}</span></div>
          <pre class="mono">${escapeHtml(JSON.stringify(action.input, null, 2))}</pre>
        `;
        if (action.status === "pending") {
          const actionsDiv = document.createElement("div");
          actionsDiv.className = "actions";
          const approveBtn = document.createElement("button");
          approveBtn.className = "small";
          approveBtn.textContent = "Approve";
          approveBtn.onclick = () => resolveAction(action.id, "approve");
          const rejectBtn = document.createElement("button");
          rejectBtn.className = "small danger";
          rejectBtn.textContent = "Reject";
          rejectBtn.onclick = () => resolveAction(action.id, "reject");
          actionsDiv.append(approveBtn, rejectBtn);
          item.appendChild(actionsDiv);
        }
        list.appendChild(item);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function resolveAction(id, verb) {
    try {
      await api(`/pending-actions/${id}/${verb}`, { method: "POST" });
      loadApprovals();
    } catch (err) {
      alert(err.message);
    }
  }

  // --- SOUL.md ---
  async function loadSoul() {
    try {
      const { content } = await api("/soul");
      $("#soul-content").textContent = content || "(empty)";
    } catch (err) {
      console.error(err);
    }
  }

  // --- Lineage ---
  async function loadLineage() {
    try {
      const { children } = await api("/lineage");
      const list = $("#lineage-list");
      list.innerHTML = "";
      if (children.length === 0) {
        list.innerHTML = '<p class="muted">No children spawned yet.</p>';
        return;
      }
      for (const child of children) {
        const item = document.createElement("div");
        item.className = "list-item";
        item.innerHTML = `
          <div class="meta">generation ${child.generation} · ${new Date(child.createdAt).toLocaleString()}</div>
          <div>${escapeHtml(child.childWalletAddress)}</div>
          <div class="muted">${escapeHtml(child.genesisPrompt)}</div>
        `;
        list.appendChild(item);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // --- Skills ---
  async function loadSkills() {
    try {
      const { skills } = await api("/skills");
      const list = $("#skills-list");
      list.innerHTML = "";
      if (skills.length === 0) {
        list.innerHTML = '<p class="muted">No skills loaded.</p>';
        return;
      }
      for (const skill of skills) {
        const item = document.createElement("div");
        item.className = "list-item";
        item.innerHTML = `<div class="meta">${escapeHtml(skill.name)}@${escapeHtml(skill.version)}</div><div>${escapeHtml(skill.description)}</div>`;
        list.appendChild(item);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // --- Logs ---
  async function loadLogs() {
    try {
      const { lines } = await api("/logs?tail=100");
      $("#logs-content").textContent = lines.join("\n") || "(no logs yet)";
    } catch (err) {
      console.error(err);
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // --- WebSocket ---
  let ws;
  function connectWebSocket() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.addEventListener("open", () => connDot.classList.add("connected"));
    ws.addEventListener("close", () => {
      connDot.classList.remove("connected");
      setTimeout(connectWebSocket, 4000);
    });
    ws.addEventListener("error", () => ws.close());
    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "status") applySurvival(msg.survival);
        if (msg.type === "pending-action-updated" && currentTab() === "approvals") loadApprovals();
      } catch {
        /* ignore malformed message */
      }
    });
  }

  // --- Boot ---
  (async () => {
    try {
      await api("/status");
      showApp();
    } catch {
      showLogin();
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  })();
})();
