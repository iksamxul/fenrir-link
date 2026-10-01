"""Fenrir Link's icons and splash screens, drawn from the Link mark with headless Edge (no image tools needed).

    python tools/make_assets.py

Writes the Android launcher icons (square, round, adaptive foreground and background), every Android splash size, and
resources/ios (the 1024 px App Store icon, opaque, and the 2732 px splash) that the iOS build copies in."""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE.parent / "fenrir" / "build"))
from shots import WS, close_browser, edge  # noqa: E402

RES = HERE / "android" / "app" / "src" / "main" / "res"
IOS = HERE / "resources" / "ios"
GROUND, ADAPTIVE_BG = "#0b0f17", "#0f2347"
DEFS = """<defs>
<linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14315f"/><stop offset="1" stop-color="#04060e"/></linearGradient>
<radialGradient id="h" cx=".5" cy=".46" r=".6"><stop offset="0" stop-color="#4f8dff" stop-opacity=".42"/><stop offset="1" stop-color="#4f8dff" stop-opacity="0"/></radialGradient>
<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".42"/><stop offset=".55" stop-color="#ffffff" stop-opacity=".05"/><stop offset="1" stop-color="#2dd4bf" stop-opacity=".35"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f9ff" stop-opacity=".98"/><stop offset="1" stop-color="#8fe3ee" stop-opacity=".9"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".16"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<clipPath id="c"><circle cx="32" cy="32" r="30"/></clipPath>
</defs>"""
GLYPH = """<g transform="translate(32 32) scale(.76) translate(-32 -32.5)">
<path d="M14 6L25 23Q32 19.5 39 23L50 6L52 24L59 40L44 49L37 57L32 60.5L27 57L20 49L5 40L12 24Z" fill="none" stroke="url(#g)" stroke-width="4.6" stroke-linejoin="round"/>
<path d="M14 32.5L27.6 36.2L28.6 38.2L15 35ZM50 32.5L36.4 36.2L35.4 38.2L49 35Z" fill="url(#g)"/>
<path d="M27 45.5H37L32 51.5Z" fill="url(#g)"/></g>"""


def tile(rx=16, full=False):
    x, w = (0, 64) if full else (2, 60)
    rects = "".join(f'<rect x="{x}" y="{x}" width="{w}" height="{w}" rx="{rx}" fill="url(#{f})"/>' for f in ("t", "h", "s"))
    rim = "" if full else '<rect x="2.6" y="2.6" width="58.8" height="58.8" rx="15.4" fill="none" stroke="url(#r)" stroke-width="1.2"/>'
    return rects + rim


SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="100%" height="100%">{body}</svg>'
VARIANTS = {
    "square": SVG.format(vb="2 2 60 60", body=DEFS + tile() + GLYPH),
    "round": SVG.format(vb="2 2 60 60", body=DEFS + '<g clip-path="url(#c)">' + tile(rx=0, full=True) + "</g>" + GLYPH),
    "foreground": SVG.format(vb="-12 -12 88 88", body=DEFS + '<circle cx="32" cy="31" r="26" fill="url(#h)"/>' + GLYPH),
    "ios": SVG.format(vb="0 0 64 64", body=DEFS + tile(rx=0, full=True) + '<g transform="translate(32 32) scale(1.08) translate(-32 -32)">' + GLYPH + "</g>"),
}


def page(svg_markup, w, h, bg="transparent", mark_frac=None):
    if mark_frac:  # a splash: the ground, a soft glow and the mark in the middle
        side = int(min(w, h) * mark_frac)
        glow = side * 3
        body = (f'<div style="position:fixed;inset:0;background:{GROUND}"></div>'
                f'<div style="position:fixed;left:50%;top:50%;width:{glow}px;height:{glow}px;margin:-{glow // 2}px 0 0 -{glow // 2}px;'
                f'background:radial-gradient(closest-side,rgb(79 141 255 / .28),transparent)"></div>'
                f'<div style="position:fixed;left:50%;top:50%;width:{side}px;height:{side}px;margin:-{side // 2}px 0 0 -{side // 2}px">{svg_markup}</div>')
    else:
        body = f'<div style="width:{w}px;height:{h}px">{svg_markup}</div>'
    return f'<!doctype html><html><body style="margin:0;background:{bg};overflow:hidden">{body}</body></html>'


def main():
    port = 9391
    proc = subprocess.Popen([edge(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--disable-extensions",
                             f"--user-data-dir={Path(os.environ.get('TEMP', '.')) / 'fenrir-linkassets-cdp'}", f"--remote-debugging-port={port}", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2).read()
                break
            except OSError:
                time.sleep(0.5)
        req = urllib.request.Request(f"http://127.0.0.1:{port}/json/new?about:blank", method="PUT")
        target = json.loads(urllib.request.urlopen(req, timeout=10).read())
        ws = WS(target["webSocketDebuggerUrl"])
        ws.call("Page.enable")
        ws.call("Emulation.setDefaultBackgroundColorOverride", color={"r": 0, "g": 0, "b": 0, "a": 0})

        def render(html, w, h, out):
            ws.call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=False)
            ws.call("Page.navigate", url="data:text/html;charset=utf-8," + urllib.parse.quote(html))
            time.sleep(0.6)
            shot = ws.call("Page.captureScreenshot", format="png", clip={"x": 0, "y": 0, "width": w, "height": h, "scale": 1})
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(base64.b64decode(shot["data"]))

        for d, legacy, fg in (("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216), ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432)):
            render(page(VARIANTS["square"], legacy, legacy), legacy, legacy, RES / f"mipmap-{d}" / "ic_launcher.png")
            render(page(VARIANTS["round"], legacy, legacy), legacy, legacy, RES / f"mipmap-{d}" / "ic_launcher_round.png")
            render(page(VARIANTS["foreground"], fg, fg), fg, fg, RES / f"mipmap-{d}" / "ic_launcher_foreground.png")
        (RES / "values" / "ic_launcher_background.xml").write_text(
            f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{ADAPTIVE_BG}</color>\n</resources>\n', "utf-8")
        for p in sorted(RES.glob("drawable*/splash.png")):
            w, h = Image.open(p).size
            render(page(VARIANTS["square"], w, h, mark_frac=0.22), w, h, p)
        render(page(VARIANTS["ios"], 1024, 1024, bg="#04060e"), 1024, 1024, IOS / "AppIcon-512@2x.png")
        render(page(VARIANTS["square"], 2732, 2732, mark_frac=0.16), 2732, 2732, IOS / "splash-2732x2732.png")
        Image.open(IOS / "AppIcon-512@2x.png").convert("RGB").save(IOS / "AppIcon-512@2x.png")  # the App Store icon has no transparency
        print("assets written")
    finally:
        close_browser(port)
        proc.kill()


if __name__ == "__main__":
    main()
