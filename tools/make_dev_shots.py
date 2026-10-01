"""Four blocky stand-in screenshots for the dev page's gallery (dev/gallery/shot-1..4.jpg): drawn here, so the showcase
pictures never carry anyone's real game.

    python tools/make_dev_shots.py"""
import random
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "dev" / "gallery"
W, H, B = 960, 600, 24  # the picture and the size of one block


def sky(d, top, bottom):
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(3)))


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def block(d, x, y, c, rnd):
    d.rectangle([x, y, x + B - 1, y + B - 1], fill=shade(c, 0.92 + rnd.random() * 0.16))
    d.line([(x, y + B - 1), (x + B - 1, y + B - 1)], fill=shade(c, 0.75))


def terrain(d, rnd, base, top_c, mid_c, low_c, rough=2):
    h, cols = base, []
    for x in range(0, W, B):
        h = max(8, min(16, h + rnd.choice([-1, 0, 0, 0, 1]) * (1 if rnd.random() < 0.6 else rough)))
        cols.append(h)
        for row in range(h, H // B + 1):
            c = top_c if row == h else mid_c if row < h + 3 else low_c
            block(d, x, row * B, c, rnd)
    return cols


def tree(d, rnd, x, ground):
    for k in range(1, 5):
        block(d, x, (ground - k) * B, (110, 80, 50), rnd)
    for dx in (-2, -1, 0, 1, 2):
        for dy in (5, 6, 7):
            if abs(dx) == 2 and dy == 7:
                continue
            block(d, x + dx * B, (ground - dy) * B, (52, 120, 52), rnd)


def save(img, name):
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / name, quality=84, optimize=True)


def nether():
    rnd = random.Random(1)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    sky(d, (60, 10, 12), (140, 40, 20))
    cols = terrain(d, rnd, 15, (120, 40, 40), (100, 32, 32), (80, 25, 28), 3)
    for x in range(0, W, B):  # a lava lake on the right
        if x > W * 0.62:
            d.rectangle([x, 17 * B, x + B - 1, H], fill=(235, 110 + rnd.randint(0, 40), 20))
    for _ in range(14):  # glowstone hanging from the roof
        x = rnd.randrange(0, W // B) * B
        for k in range(rnd.randint(1, 3)):
            block(d, x, k * B, (240, 205, 110), rnd)
    for k in range(6):  # the hub's obsidian portal
        block(d, 6 * B, (cols[6] - 1 - k) * B, (38, 20, 60), rnd)
        block(d, 10 * B, (cols[6] - 1 - k) * B, (38, 20, 60), rnd)
    d.rectangle([7 * B, (cols[6] - 6) * B, 10 * B - 1, cols[6] * B - 1], fill=(140, 60, 220))
    save(img, "shot-1.jpg")


def plains_cow():
    rnd = random.Random(2)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    sky(d, (110, 170, 255), (185, 220, 255))
    d.rectangle([W - 190, 60, W - 130, 120], fill=(255, 245, 190))
    for cx, cy in ((140, 90), (420, 60), (640, 110)):
        d.rectangle([cx, cy, cx + 150, cy + 26], fill=(250, 250, 255))
        d.rectangle([cx + 30, cy - 18, cx + 110, cy], fill=(250, 250, 255))
    cols = terrain(d, rnd, 16, (96, 170, 70), (130, 95, 60), (120, 120, 125))
    g = cols[18]
    for gx in range(14, 25):  # the statue: a cow, eleven blocks long
        for gy in range(3, 9):
            spot = (gx * 7 + gy * 3) % 5 == 0 or (gx in (16, 17) and gy in (5, 6))
            block(d, gx * B, (g - gy) * B, (30, 30, 34) if spot else (240, 240, 236), rnd)
    for gx in (14, 15, 22, 23):
        for gy in (1, 2):
            block(d, gx * B, (g - gy) * B, (240, 240, 236), rnd)
    for gx in (25, 26, 27):
        for gy in (6, 7, 8, 9):
            block(d, gx * B, (g - gy) * B, (240, 240, 236) if gy > 6 else (230, 160, 160), rnd)
    tree(d, rnd, 4 * B, cols[4])
    tree(d, rnd, 34 * B, cols[34])
    save(img, "shot-2.jpg")


def sunrise():
    rnd = random.Random(3)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    sky(d, (70, 90, 170), (255, 170, 110))
    d.rectangle([W // 2 - 50, 250, W // 2 + 50, 350], fill=(255, 220, 140))
    cols = terrain(d, rnd, 14, (80, 140, 70), (120, 88, 58), (110, 110, 118))
    g = cols[8]
    for gx in range(4, 13):  # the base: a log cabin with a roof
        for gy in range(1, 6):
            block(d, gx * B, (g - gy) * B, (150, 110, 70) if gx in (4, 12) or gy in (1, 5) else (190, 150, 100), rnd)
    for k, gx in enumerate(range(3, 14)):
        block(d, gx * B, (g - 6 - min(k, 10 - k) // 2) * B, (120, 60, 50), rnd)
    d.rectangle([7 * B, (g - 4) * B, 9 * B - 1, (g - 2) * B - 1], fill=(250, 210, 120))
    tree(d, rnd, 28 * B, cols[28])
    save(img, "shot-3.jpg")


def night():
    rnd = random.Random(4)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    sky(d, (8, 12, 34), (30, 40, 80))
    for _ in range(90):
        x, y = rnd.randrange(W), rnd.randrange(H // 2)
        d.rectangle([x, y, x + 2, y + 2], fill=(230, 235, 255))
    d.rectangle([120, 70, 180, 130], fill=(235, 238, 250))
    cols = terrain(d, rnd, 15, (60, 110, 60), (95, 70, 50), (90, 90, 98))
    for x in range(0, W, B):  # the sea in front
        if x < W * 0.45:
            for row in range(17, H // B + 1):
                d.rectangle([x, row * B, x + B - 1, row * B + B - 1], fill=(30, 60 + (row % 2) * 8, 140))
    for gx in (26, 31):
        tree(d, rnd, gx * B, cols[gx])
    save(img, "shot-4.jpg")


if __name__ == "__main__":
    nether()
    plains_cow()
    sunrise()
    night()
    print("written to", OUT)
