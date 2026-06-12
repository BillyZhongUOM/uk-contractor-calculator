#!/usr/bin/env python3
"""Generate the social-share (Open Graph) card with Pillow. Run once;
the PNG is committed. Re-run if branding/copy changes."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
img = Image.new("RGB", (W, H))
px = img.load()

# Diagonal emerald gradient
top = (16, 124, 90)      # #107C5A
bot = (8, 52, 40)        # #083428
for y in range(H):
    for x in range(0, W, 1):
        t = (x / W * 0.45 + y / H * 0.55)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        px[x, y] = (r, g, b)

draw = ImageDraw.Draw(img, "RGBA")

# Faint ascending bars, lower right
bar_heights = [70, 120, 175, 240, 320]
bx = 770
for i, bh in enumerate(bar_heights):
    x0 = bx + i * 86
    draw.rounded_rectangle([x0, H - bh - 70, x0 + 56, H - 70], radius=10,
                           fill=(255, 255, 255, 26))

# Thin diagonal light lines
for i in range(-2, 8):
    draw.line([(i * 200, 0), (i * 200 + 260, H)], fill=(255, 255, 255, 10), width=2)


def font(paths, size):
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


bold = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf"]
reg = ["/System/Library/Fonts/Supplemental/Arial.ttf",
       "/System/Library/Fonts/Helvetica.ttc",
       "/Library/Fonts/Arial.ttf"]

f_brand = font(bold, 38)
f_h1 = font(bold, 74)
f_sub = font(reg, 34)
f_pill = font(bold, 26)

M = 72  # left margin

# Brand mark + name
draw.rounded_rectangle([M, 64, M + 44, 108], radius=12, fill=(255, 255, 255, 235))
draw.rounded_rectangle([M + 10, 76, M + 34, 84], radius=4, fill=(12, 90, 70, 255))
draw.rounded_rectangle([M + 10, 90, M + 30, 96], radius=3, fill=(12, 90, 70, 160))
draw.text((M + 60, 66), "NetRate", font=f_brand, fill=(255, 255, 255, 255))

# Headline (two lines)
draw.text((M, 196), "UK Contractor", font=f_h1, fill=(255, 255, 255))
draw.text((M, 280), "Take-Home Calculator", font=f_h1, fill=(255, 255, 255))

# Subline
draw.text((M, 392), "Outside IR35 vs Inside IR35, every deduction shown.",
          font=f_sub, fill=(210, 235, 226))

# Pills
def pill(x, y, text):
    tw = draw.textlength(text, font=f_pill)
    draw.rounded_rectangle([x, y, x + tw + 44, y + 52], radius=26,
                           fill=(255, 255, 255, 38))
    draw.text((x + 22, y + 11), text, font=f_pill, fill=(255, 255, 255))
    return x + tw + 44 + 16

nx = pill(M, 470, "2025/26 tax year")
nx = pill(nx, 470, "Free, no sign-up")

img.save(os.path.join(os.path.dirname(__file__), "og.png"), "PNG")
print("Wrote og.png", img.size)
