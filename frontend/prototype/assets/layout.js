/*
 * Shared layout shell (Global Header + role Sidebar) and small UI behaviors.
 * Usage: <body data-role="fm|tm" data-nav="dashboard|farms|ponds|reports" data-sub="daily|weekly">
 * Load order: lucide → charts.js → page script → layout.js
 */
(function () {
  var NAV = {
    fm: [
      { key: "dashboard", label: "Dashboard", icon: "layout-dashboard", href: "fm-dashboard.html" },
      { key: "farms", label: "Farms", icon: "warehouse", href: "fm-farms.html" },
      {
        key: "reports", label: "Reports", icon: "file-text", href: "fm-reports.html",
        sub: [
          { key: "daily", label: "Daily Reports", href: "fm-reports.html" },
          { key: "weekly", label: "Weekly Reports", href: "fm-reports.html?type=weekly" }
        ]
      }
    ],
    tm: [
      { key: "dashboard", label: "Dashboard", icon: "layout-dashboard", href: "tm-dashboard.html" },
      { key: "ponds", label: "Ponds", icon: "waves", href: "tm-ponds.html" },
      {
        key: "reports", label: "Reports", icon: "file-text", href: "tm-daily-report.html",
        sub: [
          { key: "daily", label: "Daily Report", href: "tm-daily-report.html" },
          { key: "weekly", label: "Weekly Report", href: "tm-weekly-report.html" }
        ]
      }
    ]
  };

  var USER = {
    fm: { name: "Hendra Kusuma", initials: "HK", role: "Farms Manager", scope: ["Nusantara Shrimp Co.", "All Farms (4)"] },
    tm: { name: "Sari Wijaya", initials: "SW", role: "Technical Manager", scope: ["Nusantara Shrimp Co.", "Farm A · East Java"] }
  };

  var body = document.body;
  var role = body.dataset.role;
  var params = new URLSearchParams(location.search);

  if (role && NAV[role]) {
    var navKey = body.dataset.nav;
    var subKey = body.dataset.sub;
    var user = USER[role];

    var header = document.createElement("header");
    header.className = "gh";
    header.innerHTML =
      '<div class="gh-brand"><span class="gh-logo"><i data-lucide="waves"></i></span>Smart Shrimp Pond</div>' +
      '<div class="gh-scope"><i data-lucide="building-2"></i><span>' + user.scope[0] + '</span><span class="sep">/</span><span class="strong">' + user.scope[1] + "</span></div>" +
      '<div class="gh-spacer"></div>' +
      '<div class="gh-sync"><span class="gh-live">Live</span><span>Data synced 29 Sep 2026 09:35 WIB</span></div>' +
      '<span class="gh-lang"><i data-lucide="globe"></i>EN<i data-lucide="chevron-down"></i></span>' +
      '<div class="gh-user"><span class="gh-avatar">' + user.initials + '</span><div><div class="gh-user-name">' + user.name +
      '</div><div class="gh-user-role">' + user.role + '</div></div><i data-lucide="chevron-down" class="text-muted"></i></div>';

    var sidebar = document.createElement("aside");
    sidebar.className = "sb";
    var html = '<div class="sb-label">' + user.role + "</div>";
    NAV[role].forEach(function (item) {
      var active = item.key === navKey;
      html += '<a class="sb-item' + (active ? " is-active" : "") + '" href="' + item.href + '"><i data-lucide="' + item.icon + '"></i>' + item.label + "</a>";
      if (item.sub && active) {
        html += '<div class="sb-sub">';
        item.sub.forEach(function (s) {
          html += '<a class="' + (s.key === subKey ? "is-active" : "") + '" href="' + s.href + '">' + s.label + "</a>";
        });
        html += "</div>";
      }
    });
    sidebar.innerHTML = html;

    var main = document.querySelector("main.main");
    var shell = document.createElement("div");
    shell.className = "shell";
    main.parentNode.insertBefore(shell, main);
    shell.appendChild(sidebar);
    shell.appendChild(main);
    body.insertBefore(header, shell);
  }

  /* Tabs: <nav data-tabs="tab"> <a class="tab" data-tab="x"> … and panels [data-panel="x"] */
  function activate(group, key) {
    var name = group.dataset.tabs;
    var tabs = group.querySelectorAll("[data-tab]");
    var found = false;
    tabs.forEach(function (t) { if (t.dataset.tab === key) found = true; });
    if (!found) key = tabs[0].dataset.tab;
    tabs.forEach(function (t) { t.classList.toggle("is-active", t.dataset.tab === key); });
    document.querySelectorAll('[data-panel-group="' + name + '"]').forEach(function (p) {
      p.classList.toggle("hidden", p.dataset.panel !== key);
    });
    document.querySelectorAll('[data-show-on-' + name + ']').forEach(function (el) {
      el.classList.toggle("hidden", el.getAttribute("data-show-on-" + name).split(" ").indexOf(key) < 0);
    });
    if (window.Charts) window.Charts.renderAll();
  }
  document.querySelectorAll("[data-tabs]").forEach(function (group) {
    var name = group.dataset.tabs;
    activate(group, params.get(name));
    group.addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (!t) return;
      e.preventDefault();
      activate(group, t.dataset.tab);
      var p = new URLSearchParams(location.search);
      p.set(name, t.dataset.tab);
      history.replaceState(null, "", "?" + p.toString());
    });
  });

  /* Overlays: .overlay#id opens when ?id=1 or via [data-open="id"]; [data-close] closes */
  document.querySelectorAll(".overlay[id]").forEach(function (o) {
    if (params.has(o.id)) o.classList.add("is-open");
  });
  document.addEventListener("click", function (e) {
    var opener = e.target.closest("[data-open]");
    if (opener) {
      e.preventDefault();
      document.getElementById(opener.dataset.open).classList.add("is-open");
      return;
    }
    var closer = e.target.closest("[data-close]");
    if (closer || e.target.classList.contains("overlay")) {
      var o = (closer || e.target).closest(".overlay");
      if (o) o.classList.remove("is-open");
    }
  });
  document.querySelectorAll(".toast[id]").forEach(function (t) {
    if (!params.has(t.id)) t.classList.add("hidden");
  });

  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.75 } });
  if (window.Charts) window.Charts.renderAll();
})();
