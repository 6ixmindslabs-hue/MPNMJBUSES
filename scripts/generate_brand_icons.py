from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SIZE = 1024


def hex_rgb(value: str):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def load_font(size: int, bold: bool = False):
    font_candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/bahnschrift.ttf",
    ]
    for candidate in font_candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


FONT_SMALL = load_font(54, bold=True)
FONT_WIDE = load_font(80, bold=True)
FONT_MONO = load_font(300, bold=True)


def vertical_gradient(size: int, top: str, bottom: str):
    top_rgb = hex_rgb(top)
    bottom_rgb = hex_rgb(bottom)
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        t = y / (size - 1)
        color = mix(top_rgb, bottom_rgb, t)
        for x in range(size):
            pixels[x, y] = (*color, 255)
    return image


def radial_glow(size: int, center, radius: float, color: str, alpha_scale: float):
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    rgb = hex_rgb(color)
    steps = 18
    for step in range(steps, 0, -1):
        t = step / steps
        r = int(radius * t)
        alpha = int(255 * (t ** 2) * alpha_scale)
        draw.ellipse(
            (center[0] - r, center[1] - r, center[0] + r, center[1] + r),
            fill=(*rgb, alpha),
        )
    return glow.filter(ImageFilter.GaussianBlur(18))


def rounded_mask(size: int, radius: int):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size, size), radius=radius, fill=255)
    return mask


def draw_background():
    base = vertical_gradient(SIZE, "#FFE898", "#F3A10A")
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    overlay.alpha_composite(radial_glow(SIZE, (310, 250), 340, "#FFF7D0", 0.50))
    overlay.alpha_composite(radial_glow(SIZE, (780, 820), 420, "#C46A00", 0.25))
    overlay.alpha_composite(radial_glow(SIZE, (760, 200), 250, "#FFF1B0", 0.18))
    canvas = Image.alpha_composite(base, overlay)

    stripe_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    stripe_draw = ImageDraw.Draw(stripe_layer)
    for offset in range(-400, 1200, 140):
        stripe_draw.rounded_rectangle(
            (offset, 760, offset + 260, 840),
            radius=40,
            fill=(255, 245, 210, 32),
        )
    stripe_layer = stripe_layer.rotate(-18, resample=Image.Resampling.BICUBIC)
    canvas = Image.alpha_composite(canvas, stripe_layer)

    mask = rounded_mask(SIZE, 240)
    rounded = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rounded.paste(canvas, (0, 0), mask)

    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(border)
    draw.rounded_rectangle(
        (26, 26, SIZE - 26, SIZE - 26),
        radius=214,
        outline=(255, 249, 230, 160),
        width=12,
    )
    rounded = Image.alpha_composite(rounded, border)
    return rounded


def draw_top_pill(draw: ImageDraw.ImageDraw):
    pill = (184, 118, 840, 208)
    draw.rounded_rectangle(pill, radius=45, fill=(255, 248, 223, 210))
    text = "MPNMEC"
    bbox = draw.textbbox((0, 0), text, font=FONT_WIDE)
    x = (SIZE - (bbox[2] - bbox[0])) / 2
    y = 134
    draw.text((x, y), text, font=FONT_WIDE, fill="#3C2B11")


def draw_center_badge(image: Image.Image):
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse((222, 246, 826, 850), fill=(74, 42, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(35))
    image.alpha_composite(shadow)

    draw = ImageDraw.Draw(image)
    draw.ellipse((232, 226, 792, 786), fill="#1A2430")
    draw.ellipse((250, 244, 774, 768), outline=(255, 228, 134, 180), width=10)
    draw.ellipse((280, 274, 744, 738), fill="#111922")
    draw.ellipse((300, 294, 724, 718), outline=(255, 202, 82, 90), width=6)


def draw_corner_accent(draw: ImageDraw.ImageDraw):
    draw.rounded_rectangle((120, 858, 316, 910), radius=26, fill=(255, 244, 199, 140))
    draw.rounded_rectangle((708, 858, 904, 910), radius=26, fill=(255, 244, 199, 90))


def line(draw, points, width=18, fill="#FFC84A"):
    draw.line(points, fill=fill, width=width, joint="curve")


def draw_admin_symbol(draw: ImageDraw.ImageDraw):
    amber = "#FFCE58"
    pale = "#FFF3C2"
    draw.rounded_rectangle((328, 356, 696, 620), radius=58, outline=pale, width=16)
    draw.rounded_rectangle((360, 390, 664, 566), radius=36, fill=(255, 224, 120, 22), outline=amber, width=12)
    draw.rounded_rectangle((390, 424, 472, 526), radius=18, fill=(255, 206, 88, 215))
    draw.rounded_rectangle((500, 424, 632, 452), radius=14, fill=amber)
    draw.rounded_rectangle((500, 468, 632, 496), radius=14, fill=(255, 243, 194, 215))
    draw.rounded_rectangle((500, 512, 590, 540), radius=14, fill=(255, 206, 88, 160))
    line(draw, [(420, 660), (604, 660)], width=22, fill=amber)
    line(draw, [(512, 620), (512, 686)], width=18, fill=amber)
    draw.rounded_rectangle((446, 688, 578, 714), radius=13, fill=(255, 243, 194, 180))


def draw_driver_symbol(draw: ImageDraw.ImageDraw):
    amber = "#FFCE58"
    pale = "#FFF3C2"
    draw.ellipse((332, 330, 690, 688), outline=pale, width=18)
    draw.ellipse((396, 394, 626, 624), outline=amber, width=22)
    line(draw, [(512, 446), (512, 614)], width=22, fill=amber)
    line(draw, [(430, 514), (594, 514)], width=22, fill=amber)
    line(draw, [(446, 442), (512, 514), (578, 442)], width=20, fill=amber)
    draw.rounded_rectangle((390, 608, 634, 666), radius=22, outline=amber, width=16)
    draw.rounded_rectangle((436, 626, 482, 648), radius=10, fill=amber)
    draw.rounded_rectangle((542, 626, 588, 648), radius=10, fill=amber)
    draw.rounded_rectangle((470, 664, 554, 688), radius=10, fill=(255, 206, 88, 180))


def draw_tracker_symbol(draw: ImageDraw.ImageDraw):
    amber = "#FFCE58"
    pale = "#FFF3C2"
    path = [
        (512, 310),
        (380, 310),
        (332, 404),
        (332, 492),
        (512, 698),
        (692, 492),
        (692, 404),
        (644, 310),
        (512, 310),
    ]
    line(draw, path, width=20, fill=pale)
    draw.rounded_rectangle((390, 432, 634, 524), radius=26, outline=amber, width=16)
    draw.rounded_rectangle((426, 398, 598, 444), radius=20, fill=(255, 227, 138, 38), outline=amber, width=12)
    draw.rounded_rectangle((434, 532, 474, 552), radius=8, fill=amber)
    draw.rounded_rectangle((550, 532, 590, 552), radius=8, fill=amber)
    draw.rounded_rectangle((492, 552, 532, 572), radius=8, fill=(255, 206, 88, 180))
    draw.arc((424, 352, 600, 528), start=204, end=336, fill=(255, 243, 194, 150), width=12)


def build_icon(kind: str):
    image = draw_background()
    draw = ImageDraw.Draw(image)
    draw_top_pill(draw)
    draw_center_badge(image)
    draw = ImageDraw.Draw(image)
    draw_corner_accent(draw)

    if kind == "admin":
        draw_admin_symbol(draw)
    elif kind == "driver":
        draw_driver_symbol(draw)
    elif kind == "tracker":
        draw_tracker_symbol(draw)
    else:
        raise ValueError(kind)

    return image


def save_icon(kind: str, relative_path: str):
    output = ROOT / relative_path
    output.parent.mkdir(parents=True, exist_ok=True)
    build_icon(kind).save(output, format="PNG")
    print(f"wrote {output}")


def main():
    save_icon("driver", "driver_app/assets/images/app_icon.png")
    save_icon("tracker", "student_app/assets/images/app_icon.png")
    save_icon("admin", "admin/public/favicon.png")


if __name__ == "__main__":
    main()
