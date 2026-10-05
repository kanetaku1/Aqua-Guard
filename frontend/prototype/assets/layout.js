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
    ],
    ad: [
      { key: "users", label: "Users", icon: "users", href: "ad-users.html" },
      { key: "farms", label: "Farms & Ponds", icon: "warehouse", href: "ad-farms.html" },
      {
        key: "settings", label: "Settings", icon: "settings", href: "ad-settings.html",
        sub: [
          { key: "thresholds", label: "Thresholds", href: "ad-settings.html?tab=thresholds" },
          { key: "growth", label: "Growth Targets", href: "ad-settings.html?tab=growth" },
          { key: "rules", label: "Rules", href: "ad-settings.html?tab=rules" }
        ]
      }
    ]
  };

  var USER = {
    fm: { name: "Hendra Kusuma", initials: "HK", role: "Farms Manager", scope: ["Nusantara Shrimp Co.", "All Farms (4)"] },
    tm: { name: "Sari Wijaya", initials: "SW", role: "Technical Manager", scope: ["Nusantara Shrimp Co.", "Farm A · East Java"] },
    ad: { name: "Yusuf Rahman", initials: "YR", role: "System Administrator", scope: ["Nusantara Shrimp Co.", "System Administration"] }
  };

  /* DUMMY logo (shield + wave) until the AquaGuard logo is decided — replace this SVG only. Fills every [data-logo]. */
  var LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="AquaGuard">' +
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>' +
    '<path d="M7.5 12.5c1.5-1 3-1 4.5 0s3 1 4.5 0"/></svg>';

  var body = document.body;
  var role = body.dataset.role;
  var params = new URLSearchParams(location.search);
  // Sub-navigation that follows a tab (e.g. Settings › Thresholds)
  if (body.dataset.subFrom && params.get(body.dataset.subFrom)) body.dataset.sub = params.get(body.dataset.subFrom);

  if (role && NAV[role]) {
    var navKey = body.dataset.nav;
    var subKey = body.dataset.sub;
    var user = USER[role];

    var header = document.createElement("header");
    header.className = "gh";
    header.innerHTML =
      '<div class="gh-brand"><span class="gh-logo" data-logo></span>AquaGuard</div>' +
      '<div class="gh-scope"><i data-lucide="building-2"></i><span>' + user.scope[0] + '</span><span class="sep">/</span><span class="strong">' + user.scope[1] + "</span></div>" +
      '<div class="gh-spacer"></div>' +
      (role === "ad" ? "" : '<div class="gh-sync"><span class="gh-live">Live</span><span>Data synced 29 Sep 2026 09:35 WIB</span></div>') +
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
  document.querySelectorAll("[data-logo]").forEach(function (el) { el.innerHTML = LOGO; });

  /* Wrap every data table so wide tables scroll inside their card instead of breaking the layout */
  document.querySelectorAll("table.table").forEach(function (t) {
    if (t.parentNode.classList.contains("table-wrap")) return;
    var w = document.createElement("div"); w.className = "table-wrap";
    t.parentNode.insertBefore(w, t); w.appendChild(t);
  });

  document.querySelectorAll("details[data-open-param]").forEach(function (d) { if (params.has(d.dataset.openParam)) d.open = true; });

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
  /* Row edit: [data-row-edit] toggles a read-only row and its following .row-editor row (07 §11.5) */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-row-edit]");
    if (!b) return;
    e.preventDefault();
    var row = b.closest("tr"), view = row.classList.contains("row-editor") ? row.previousElementSibling : row, ed = view.nextElementSibling;
    view.classList.toggle("hidden"); ed.classList.toggle("hidden");
  });
  document.querySelectorAll(".toast[id]").forEach(function (t) {
    if (!params.has(t.id)) t.classList.add("hidden");
  });

  /* Date field with calendar popover (08 §09). Format "29 Sep 2026". Prototype "today" = 29 Sep 2026. */
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var TODAY = new Date(2026, 8, 29);
  function parseD(v) { var m = /^(\d{1,2}) (\w{3}) (\d{4})$/.exec(v || ""); return m ? new Date(+m[3], MON.indexOf(m[2]), +m[1]) : null; }
  function fmtD(d) { return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear(); }
  function buildCal(field, view) {
    var input = field.querySelector("input"), sel = parseD(input.value), allowFuture = field.hasAttribute("data-allow-future");
    var first = new Date(view.getFullYear(), view.getMonth(), 1), start = (first.getDay() + 6) % 7;
    var html = '<div class="datepicker-head"><button type="button" class="icon-btn" data-dp-nav="-1" aria-label="Previous month"><i data-lucide="chevron-left"></i></button><b>' + MONL[view.getMonth()] + " " + view.getFullYear() + '</b><button type="button" class="icon-btn" data-dp-nav="1" aria-label="Next month"><i data-lucide="chevron-right"></i></button></div><div class="datepicker-grid">';
    ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].forEach(function (d) { html += '<span class="dp-dow">' + d + "</span>"; });
    for (var i = 0; i < 42; i++) {
      var d = new Date(view.getFullYear(), view.getMonth(), 1 - start + i), cls = "dp-day";
      if (d.getMonth() !== view.getMonth()) cls += " is-out";
      if (+d === +TODAY) cls += " is-today";
      if (sel && +d === +sel) cls += " is-selected";
      var dis = !allowFuture && d > TODAY;
      html += '<button type="button" class="' + cls + '"' + (dis ? " disabled" : "") + ' data-dp-day="' + fmtD(d) + '">' + d.getDate() + "</button>";
    }
    html += '</div><div class="datepicker-foot"><button type="button" class="btn btn--link" data-dp-day="' + fmtD(TODAY) + '">Today</button></div>';
    var pop = field.querySelector(".datepicker");
    if (!pop) { pop = document.createElement("div"); pop.className = "datepicker"; field.appendChild(pop); }
    pop.innerHTML = html; pop.dataset.view = view.getFullYear() + "-" + view.getMonth();
    if (window.lucide) window.lucide.createIcons();
  }
  function closeCals(except) { document.querySelectorAll(".date-field .datepicker").forEach(function (p) { if (p.parentNode !== except) p.remove(); }); }
  document.addEventListener("click", function (e) {
    var field = e.target.closest(".date-field");
    var nav = e.target.closest("[data-dp-nav]"), day = e.target.closest("[data-dp-day]");
    if (field && nav) { var v = field.querySelector(".datepicker").dataset.view.split("-"); buildCal(field, new Date(+v[0], +v[1] + +nav.dataset.dpNav, 1)); return; }
    if (field && day) { field.querySelector("input").value = day.dataset.dpDay; closeCals(); return; }
    if (field && (e.target.closest("input") || e.target.closest(".date-btn"))) {
      if (field.querySelector(".datepicker")) { closeCals(); return; }
      closeCals(field); buildCal(field, parseD(field.querySelector("input").value) || TODAY); return;
    }
    if (!field) closeCals();
  });
  if (params.has("calendar")) {
    var demo = document.querySelector(".date-field[data-calendar-demo]") || document.querySelector(".date-field");
    if (demo) buildCal(demo, parseD(demo.querySelector("input").value) || TODAY);
  }

  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.75 } });
  if (window.Charts) window.Charts.renderAll();
})();
