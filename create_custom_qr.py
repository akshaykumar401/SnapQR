import base64
import io
import os
import re
import qrcode
import qrcode.image.svg
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer
from PIL import Image, ImageColor, ImageDraw


_ECC_MAP = {
  "L": qrcode.constants.ERROR_CORRECT_L,
  "M": qrcode.constants.ERROR_CORRECT_M,
  "Q": qrcode.constants.ERROR_CORRECT_Q,
  "H": qrcode.constants.ERROR_CORRECT_H,
}

_DATA_URI_RE = re.compile(
  r"^data:image/(?:png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$",
  re.IGNORECASE,
)


def hex_to_rgb(color_str, default=(159, 160, 255)):
  """Convert hex color string to RGB tuple."""
  try:
    if isinstance(color_str, str) and color_str.startswith("#"):
      return ImageColor.getrgb(color_str)
    return default
  except Exception:
    return default


def parse_ecc_level(ecc_level):
  """Map string ECC level ('L', 'M', 'Q', 'H') to qrcode constant."""
  if isinstance(ecc_level, str):
    return _ECC_MAP.get(ecc_level.strip().upper(), qrcode.constants.ERROR_CORRECT_H)
  return qrcode.constants.ERROR_CORRECT_H


def clamp_logo_size(logo_size, default=22):
  """Clamp center branding image size percentage to a safe scannable range."""
  try:
    val = int(float(logo_size))
  except (TypeError, ValueError):
    val = default
  return max(10, min(32, val))


def normalize_logo_shape(logo_shape):
  """Normalize logo frame shape to a supported option."""
  allowed = {"rounded", "circle", "square", "none"}
  if isinstance(logo_shape, str) and logo_shape.strip().lower() in allowed:
    return logo_shape.strip().lower()
  return "rounded"


def normalize_logo_bg(logo_bg):
  """Normalize logo badge background mode."""
  if isinstance(logo_bg, str) and logo_bg.strip().lower() == "qr_bg":
    return "qr_bg"
  return "white"


def decode_logo_image(logo_data=None, logo_path="static/img/Logo.png"):
  """Load center branding image from base64 data URI/bytes or fallback file path."""
  if logo_data:
    try:
      raw_bytes = None
      if isinstance(logo_data, (bytes, bytearray)):
        raw_bytes = bytes(logo_data)
      elif isinstance(logo_data, str):
        stripped = logo_data.strip()
        match = _DATA_URI_RE.match(stripped)
        b64_payload = match.group(1) if match else stripped
        raw_bytes = base64.b64decode(b64_payload, validate=True)

      if raw_bytes:
        with Image.open(io.BytesIO(raw_bytes)) as img:
          return img.convert("RGBA")
    except Exception as e:
      print(f"Warning: Could not decode custom logo data: {e}")

  if logo_path and os.path.exists(logo_path):
    try:
      with Image.open(logo_path) as img:
        return img.convert("RGBA")
    except Exception as e:
      print(f"Warning: Could not open logo path '{logo_path}': {e}")

  return None


def _create_supersampled_mask(size, draw_fn, scale=4):
  """Render an anti-aliased alpha mask using supersampling."""
  w, h = size
  big_mask = Image.new("L", (w * scale, h * scale), 0)
  draw = ImageDraw.Draw(big_mask)
  draw_fn(draw, w * scale, h * scale)
  return big_mask.resize((w, h), Image.Resampling.LANCZOS)


def _apply_center_logo_pil(
  qr_img,
  logo_img,
  logo_size=22,
  logo_shape="rounded",
  logo_bg="white",
  bg_rgb=(255, 255, 255),
):
  """Composite the center branding image onto qr_img with badge framing."""
  qr_width, qr_height = qr_img.size
  pct = clamp_logo_size(logo_size) / 100.0
  shape = normalize_logo_shape(logo_shape)
  bg_mode = normalize_logo_bg(logo_bg)

  max_logo_size = max(16, int(round(qr_width * pct)))
  src_w, src_h = logo_img.size
  scale = max_logo_size / max(src_w, src_h) if max(src_w, src_h) > 0 else 1.0
  logo_w = max(1, int(round(src_w * scale)))
  logo_h = max(1, int(round(src_h * scale)))
  logo = logo_img.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

  if shape == "none":
    logo_x = (qr_width - logo_w) // 2
    logo_y = (qr_height - logo_h) // 2
    qr_img.paste(logo, (logo_x, logo_y), logo)
    return qr_img

  pad = max(6, int(round(max_logo_size * 0.16)))
  badge_rgb = bg_rgb[:3] if bg_mode == "qr_bg" else (255, 255, 255)
  badge_rgba = (badge_rgb[0], badge_rgb[1], badge_rgb[2], 255)

  if shape == "circle":
    badge_d = max_logo_size + pad * 2
    badge_mask = _create_supersampled_mask(
      (badge_d, badge_d),
      lambda d, sw, sh: d.ellipse((0, 0, sw - 1, sh - 1), fill=255),
    )
    badge = Image.new("RGBA", (badge_d, badge_d), badge_rgba)
    badge.putalpha(badge_mask)
    badge_x = (qr_width - badge_d) // 2
    badge_y = (qr_height - badge_d) // 2
    qr_img.alpha_composite(badge, (badge_x, badge_y))

    # Clip logo cleanly within the inner circle so square images get rounded edges
    inner_mask = _create_supersampled_mask(
      (max_logo_size, max_logo_size),
      lambda d, sw, sh: d.ellipse((0, 0, sw - 1, sh - 1), fill=255),
    )
    logo_layer = Image.new("RGBA", (max_logo_size, max_logo_size), (0, 0, 0, 0))
    offset_x = (max_logo_size - logo_w) // 2
    offset_y = (max_logo_size - logo_h) // 2
    logo_layer.paste(logo, (offset_x, offset_y), logo)

    # Intersect logo alpha with circular inner mask
    existing_alpha = logo_layer.getchannel("A")
    combined_alpha = Image.composite(
      existing_alpha, Image.new("L", (max_logo_size, max_logo_size), 0), inner_mask
    )
    logo_layer.putalpha(combined_alpha)

    qr_img.alpha_composite(
      logo_layer,
      ((qr_width - max_logo_size) // 2, (qr_height - max_logo_size) // 2),
    )
    return qr_img

  badge_w = logo_w + pad * 2
  badge_h = logo_h + pad * 2
  badge_x = (qr_width - badge_w) // 2
  badge_y = (qr_height - badge_h) // 2
  logo_x = (qr_width - logo_w) // 2
  logo_y = (qr_height - logo_h) // 2

  if shape == "rounded":
    radius = max(4, int(round(min(badge_w, badge_h) * 0.22)))
    badge_mask = _create_supersampled_mask(
      (badge_w, badge_h),
      lambda d, sw, sh: d.rounded_rectangle(
        (0, 0, sw - 1, sh - 1), radius=radius * 4, fill=255
      ),
    )
    badge = Image.new("RGBA", (badge_w, badge_h), badge_rgba)
    badge.putalpha(badge_mask)
    qr_img.alpha_composite(badge, (badge_x, badge_y))

    inner_radius = max(2, int(round(radius - pad * 0.45)))
    logo_mask = _create_supersampled_mask(
      (logo_w, logo_h),
      lambda d, sw, sh: d.rounded_rectangle(
        (0, 0, sw - 1, sh - 1), radius=inner_radius * 4, fill=255
      ),
    )
    existing_alpha = logo.getchannel("A")
    combined_alpha = Image.composite(
      existing_alpha, Image.new("L", (logo_w, logo_h), 0), logo_mask
    )
    logo.putalpha(combined_alpha)
    qr_img.alpha_composite(logo, (logo_x, logo_y))
    return qr_img

  # Square badge
  badge = Image.new("RGBA", (badge_w, badge_h), badge_rgba)
  qr_img.alpha_composite(badge, (badge_x, badge_y))
  qr_img.alpha_composite(logo, (logo_x, logo_y))
  return qr_img


def generate_custom_qr_bytes(
  data_text,
  logo_path="static/img/Logo.png",
  fg_color="#9FA0FF",
  bg_color="#ffffff",
  include_logo=True,
  resolution=1024,
  logo_data=None,
  logo_size=22,
  logo_shape="rounded",
  logo_bg="white",
  ecc_level="H",
):
  """Generate custom QR code in memory and return as io.BytesIO buffer."""
  if isinstance(fg_color, str):
    fg_rgb = hex_to_rgb(fg_color, (159, 160, 255))
  else:
    fg_rgb = fg_color

  if isinstance(bg_color, str):
    bg_rgb = hex_to_rgb(bg_color, (255, 255, 255))
  else:
    bg_rgb = bg_color

  qr = qrcode.QRCode(
    version=None,
    error_correction=parse_ecc_level(ecc_level),
    box_size=12,
    border=3,
  )
  qr.add_data(data_text)
  qr.make(fit=True)

  qr_img = qr.make_image(
    image_factory=StyledPilImage,
    module_drawer=RoundedModuleDrawer(),
    fill_color=fg_rgb,
    back_color=bg_rgb,
  ).convert("RGBA")

  # Scale QR matrix to requested resolution first so center logo stays razor sharp
  target_res = int(resolution) if resolution else 1024
  target_res = max(128, min(4096, target_res))
  if target_res != qr_img.size[0]:
    qr_img = qr_img.resize((target_res, target_res), Image.Resampling.LANCZOS)

  if include_logo:
    logo_img = decode_logo_image(logo_data=logo_data, logo_path=logo_path)
    if logo_img is not None:
      try:
        qr_img = _apply_center_logo_pil(
          qr_img,
          logo_img,
          logo_size=logo_size,
          logo_shape=logo_shape,
          logo_bg=logo_bg,
          bg_rgb=bg_rgb,
        )
      except Exception as e:
        print(f"Warning: Could not overlay logo: {e}")

  buf = io.BytesIO()
  qr_img.save(buf, format="PNG")
  buf.seek(0)
  return buf


def _logo_to_png_data_uri(logo_img, max_dim=512):
  """Convert a PIL image to a compact base64 PNG data URI for SVG embedding."""
  copy_img = logo_img.copy()
  if max(copy_img.size) > max_dim:
    copy_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
  tmp = io.BytesIO()
  copy_img.save(tmp, format="PNG")
  b64 = base64.b64encode(tmp.getvalue()).decode("ascii")
  return f"data:image/png;base64,{b64}", copy_img.size


def _build_svg_logo_overlay(
  viewbox_size,
  logo_img,
  bg_color="#ffffff",
  logo_size=22,
  logo_shape="rounded",
  logo_bg="white",
):
  """Generate SVG defs + center branding badge/image markup in viewBox units."""
  data_uri, (img_w, img_h) = _logo_to_png_data_uri(logo_img)
  pct = clamp_logo_size(logo_size) / 100.0
  shape = normalize_logo_shape(logo_shape)
  bg_mode = normalize_logo_bg(logo_bg)

  max_logo = viewbox_size * pct
  ratio = (img_w / img_h) if (img_w > 0 and img_h > 0) else 1.0
  if ratio >= 1.0:
    draw_w = max_logo
    draw_h = max_logo / ratio
  else:
    draw_h = max_logo
    draw_w = max_logo * ratio

  center = viewbox_size / 2.0
  logo_x = center - draw_w / 2.0
  logo_y = center - draw_h / 2.0

  if shape == "none":
    return (
      f'<image href="{data_uri}" x="{logo_x:.3f}" y="{logo_y:.3f}" '
      f'width="{draw_w:.3f}" height="{draw_h:.3f}" '
      f'preserveAspectRatio="xMidYMid meet" image-rendering="auto"/>'
    )

  pad = max_logo * 0.16
  badge_fill = bg_color if (bg_mode == "qr_bg" and bg_color) else "#ffffff"

  if shape == "circle":
    badge_r = (max_logo + pad * 2) / 2.0
    inner_r = max_logo / 2.0
    return (
      f'<defs><clipPath id="snapqrCenterClip">'
      f'<circle cx="{center:.3f}" cy="{center:.3f}" r="{inner_r:.3f}"/>'
      f"</clipPath></defs>"
      f'<circle cx="{center:.3f}" cy="{center:.3f}" r="{badge_r:.3f}" fill="{badge_fill}"/>'
      f'<image href="{data_uri}" x="{logo_x:.3f}" y="{logo_y:.3f}" '
      f'width="{draw_w:.3f}" height="{draw_h:.3f}" '
      f'preserveAspectRatio="xMidYMid meet" clip-path="url(#snapqrCenterClip)" '
      f'image-rendering="auto"/>'
    )

  badge_w = draw_w + pad * 2
  badge_h = draw_h + pad * 2
  badge_x = center - badge_w / 2.0
  badge_y = center - badge_h / 2.0

  if shape == "rounded":
    radius = min(badge_w, badge_h) * 0.22
    inner_radius = max(0.0, radius - pad * 0.45)
    return (
      f'<defs><clipPath id="snapqrCenterClip">'
      f'<rect x="{logo_x:.3f}" y="{logo_y:.3f}" width="{draw_w:.3f}" height="{draw_h:.3f}" '
      f'rx="{inner_radius:.3f}" ry="{inner_radius:.3f}"/>'
      f"</clipPath></defs>"
      f'<rect x="{badge_x:.3f}" y="{badge_y:.3f}" width="{badge_w:.3f}" height="{badge_h:.3f}" '
      f'rx="{radius:.3f}" ry="{radius:.3f}" fill="{badge_fill}"/>'
      f'<image href="{data_uri}" x="{logo_x:.3f}" y="{logo_y:.3f}" '
      f'width="{draw_w:.3f}" height="{draw_h:.3f}" '
      f'preserveAspectRatio="xMidYMid meet" clip-path="url(#snapqrCenterClip)" '
      f'image-rendering="auto"/>'
    )

  # Square badge
  return (
    f'<rect x="{badge_x:.3f}" y="{badge_y:.3f}" width="{badge_w:.3f}" height="{badge_h:.3f}" '
    f'fill="{badge_fill}"/>'
    f'<image href="{data_uri}" x="{logo_x:.3f}" y="{logo_y:.3f}" '
    f'width="{draw_w:.3f}" height="{draw_h:.3f}" '
    f'preserveAspectRatio="xMidYMid meet" image-rendering="auto"/>'
  )


def generate_custom_qr_svg(
  data_text,
  fg_color="#9FA0FF",
  bg_color="#ffffff",
  include_logo=True,
  logo_path="static/img/Logo.png",
  logo_data=None,
  logo_size=22,
  logo_shape="rounded",
  logo_bg="white",
  ecc_level="H",
):
  """Generate custom QR code in SVG format with optional center branding image."""
  qr = qrcode.QRCode(
    version=None,
    error_correction=parse_ecc_level(ecc_level),
    box_size=10,
    border=2,
  )
  qr.add_data(data_text)
  qr.make(fit=True)
  img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
  buf = io.BytesIO()
  img.save(buf)
  svg_content = buf.getvalue().decode("utf-8")

  # Colorize QR modules
  svg_content = svg_content.replace('fill="#000000"', f'fill="{fg_color}"')
  svg_content = svg_content.replace('fill="black"', f'fill="{fg_color}"')

  # Ensure background rect is inserted inside <svg ...>, not before it after <?xml ...?>
  if bg_color and bg_color.lower() not in ("transparent", "none"):
    svg_start = svg_content.find("<svg")
    if svg_start != -1:
      idx = svg_content.find(">", svg_start)
      if idx != -1:
        bg_rect = f'<rect width="100%" height="100%" fill="{bg_color}"/>'
        svg_content = svg_content[: idx + 1] + bg_rect + svg_content[idx + 1 :]

  if include_logo:
    logo_img = decode_logo_image(logo_data=logo_data, logo_path=logo_path)
    if logo_img is not None:
      vb_match = re.search(r'viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"', svg_content)
      viewbox_size = float(vb_match.group(1)) if vb_match else 33.0
      overlay_markup = _build_svg_logo_overlay(
        viewbox_size=viewbox_size,
        logo_img=logo_img,
        bg_color=bg_color,
        logo_size=logo_size,
        logo_shape=logo_shape,
        logo_bg=logo_bg,
      )
      svg_content = svg_content.replace("</svg>", f"{overlay_markup}</svg>", 1)

  out = io.BytesIO(svg_content.encode("utf-8"))
  out.seek(0)
  return out
