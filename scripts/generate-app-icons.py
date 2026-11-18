#!/usr/bin/env python3
"""Genererar appikonen och startbilderna för iOS och Android från public/axle-logo-white.svg.

Kör: python3 scripts/generate-app-icons.py   (kräver rsvg-convert: brew install librsvg)
Märket är vitt på varumärkets teal (#006874). Ändra loggan eller färgen här och kör om.
"""
import os
import re
import subprocess
import tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
BG = "#006874"
FG = "#ffffff"
LOGO_ASPECT = 750 / 550

svg = open(os.path.join(ROOT, "public/axle-logo-white.svg")).read()
inner = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1).replace('fill="black"', f'fill="{FG}"')


def render(path, w, h, logo_frac, bg=BG, circle=False, opaque=False):
    """Märket centrerat, `logo_frac` av bredden. bg=None ger genomskinlig bakgrund."""
    lw = w * logo_frac
    lh = lw / LOGO_ASPECT
    rect = ""
    if bg:
        rect = (
            f'<circle cx="{w/2}" cy="{h/2}" r="{min(w, h)/2}" fill="{bg}"/>'
            if circle
            else f'<rect width="{w}" height="{h}" fill="{bg}"/>'
        )
    doc = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f'{rect}<svg x="{(w-lw)/2}" y="{(h-lh)/2}" width="{lw}" height="{lh}" '
        f'viewBox="-375 -275 750 550">{inner}</svg></svg>'
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(doc)
    subprocess.run(["rsvg-convert", "-w", str(w), "-h", str(h), "-o", path, f.name], check=True)
    os.unlink(f.name)
    if opaque:
        # App Store kräver en ikon utan alfakanal: en omväg via BMP tar bort den.
        bmp = path + ".bmp"
        subprocess.run(["sips", "-s", "format", "bmp", path, "--out", bmp], check=True, capture_output=True)
        subprocess.run(["sips", "-s", "format", "png", bmp, "--out", path], check=True, capture_output=True)
        os.unlink(bmp)


ios = os.path.join(ROOT, "ios/App/App/Assets.xcassets")
render(f"{ios}/AppIcon.appiconset/AppIcon-512@2x.png", 1024, 1024, 0.6, opaque=True)
for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
    render(f"{ios}/Splash.imageset/{name}", 2732, 2732, 0.26, opaque=True)

res = os.path.join(ROOT, "android/app/src/main/res")
for d, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    render(f"{res}/mipmap-{d}/ic_launcher.png", size, size, 0.6)
    render(f"{res}/mipmap-{d}/ic_launcher_round.png", size, size, 0.52, circle=True, bg=BG)
for d, size in {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}.items():
    # Adaptiv ikon: bara de mittersta två tredjedelarna är säkra, bakgrunden är färgen nedan.
    render(f"{res}/mipmap-{d}/ic_launcher_foreground.png", size, size, 0.42, bg=None)
open(f"{res}/values/ic_launcher_background.xml", "w").write(
    f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{BG}</color>\n</resources>\n'
)
splashes = {
    "drawable": (480, 320),
    "drawable-land-mdpi": (480, 320), "drawable-land-hdpi": (800, 480), "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960), "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-mdpi": (320, 480), "drawable-port-hdpi": (480, 800), "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600), "drawable-port-xxxhdpi": (1280, 1920),
}
for d, (w, h) in splashes.items():
    # Märket är 45 % av den kortaste sidan, oavsett stående eller liggande.
    render(f"{res}/{d}/splash.png", w, h, 0.45 * min(w, h) / w)
print("Klart.")
