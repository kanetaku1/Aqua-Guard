"""Build all-screens.html: the main screens stacked vertically in one page, for html.to.design import.

Each screen is rendered in headless Chrome at 1440px (shell, icons and charts are drawn by JS),
then its final DOM is copied into the page without scripts, so one import brings in every screen.

Usage:  python tools/build_all_screens.py        (run from frontend/prototype)
"""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHROME = r"C:/Program Files/Google/Chrome/Application/chrome.exe"
WIDTH = 1440

# (label, page) — edit this list to add or remove screens
SCREENS = [
    ("AU-01 Login", "screens/auth-login.html"),
    ("FM-01 Dashboard", "screens/fm-dashboard.html"),
    ("FM-02 Farm List", "screens/fm-farms.html"),
    ("FM-03 Farm Detail", "screens/fm-farm-detail.html"),
    ("FM-04 Report List", "screens/fm-reports.html"),
    ("FM-05 Daily Report Detail", "screens/fm-daily-report.html"),
    ("FM-06 Weekly Report Detail", "screens/fm-weekly-report.html"),
    ("TM-01 Dashboard", "screens/tm-dashboard.html"),
    ("TM-02 Pond List", "screens/tm-ponds.html"),
    ("TM-03 Pond Detail", "screens/tm-pond-detail.html"),
    ("TM-04 Daily Report", "screens/tm-daily-report.html"),
    ("TM-05 Weekly Report", "screens/tm-weekly-report.html"),
    ("AD-01 Users", "screens/ad-users.html"),
    ("AD-02 Farms & Ponds", "screens/ad-farms.html"),
    ("AD-03 Farm Detail", "screens/ad-farm-detail.html"),
    ("AD-04 Settings", "screens/ad-settings.html"),
]


def render(page):
    url = (ROOT / page.split("?")[0]).as_uri() + ("?" + page.split("?")[1] if "?" in page else "")
    out = subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={WIDTH},900",
         "--virtual-time-budget=8000", "--dump-dom", url],
        capture_output=True, text=True, encoding="utf-8")
    html = out.stdout
    m = re.search(r"<body([^>]*)>(.*)</body>", html, re.S)
    if not m:
        sys.exit(f"Could not render {page}")
    attrs, body = m.group(1), m.group(2)
    body = re.sub(r"<script\b.*?</script>", "", body, flags=re.S)
    body = strip_overlays(body)
    return attrs, body


def strip_overlays(body):
    """Remove closed dialogs / drawers (fixed-position overlays) so they do not stack on top of the next screen."""
    out, i = "", 0
    for m in re.finditer(r'<div class="overlay(?![^"]*is-open)[^"]*"[^>]*>', body):
        if m.start() < i:
            continue
        depth, j = 0, m.start()
        for t in re.finditer(r"<div\b|</div>", body[m.start():]):
            depth += 1 if t.group(0) == "<div" else -1
            if depth == 0:
                j = m.start() + t.end()
                break
        out += body[i:m.start()]
        i = j
    return out + body[i:]


STYLE = f"""
  html, body {{ background: #C9D6D8; min-width: {WIDTH}px; }}
  .screen-label {{ width: {WIDTH}px; margin: 64px auto 12px; font: 700 24px/1.4 Inter, sans-serif; color: #18323B; }}
  .screen-label small {{ font-weight: 400; font-size: 14px; color: #5B7078; margin-left: 12px; }}
  .screen {{
    width: {WIDTH}px; margin: 0 auto; position: relative; overflow: hidden;
    font-family: var(--font-sans); font-size: var(--fs-small); line-height: var(--lh-small);
    color: var(--color-text); background: var(--color-bg); -webkit-font-smoothing: antialiased;
  }}
  /* Nothing sticks or fills the viewport when screens are stacked */
  .screen .gh, .screen .action-bar {{ position: relative; top: auto; bottom: auto; }}
  .screen .shell {{ min-height: 0; }}
  .screen .auth-page {{ min-height: 900px; }}
"""


def main():
    sections = []
    for label, page in SCREENS:
        attrs, body = render(page)
        attrs = re.sub(r'\s(style|class)="[^"]*"', "", attrs)
        sections.append(f'<div class="screen-label">{label}<small>{page}</small></div>\n'
                        f'<section class="screen"{attrs}>\n{body}\n</section>')
        print("rendered", label)
    html = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            f"<meta name=\"viewport\" content=\"width={WIDTH}\">\n<title>All Screens · AquaGuard</title>\n"
            "<link rel=\"stylesheet\" href=\"assets/tokens.css\">\n<link rel=\"stylesheet\" href=\"assets/app.css\">\n"
            f"<style>{STYLE}</style>\n</head>\n<body>\n" + "\n\n".join(sections) + "\n</body>\n</html>\n")
    (ROOT / "all-screens.html").write_text(html, encoding="utf-8")
    print("wrote", ROOT / "all-screens.html")


if __name__ == "__main__":
    main()
