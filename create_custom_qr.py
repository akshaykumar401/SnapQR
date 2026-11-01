import io
import os
import qrcode
import qrcode.image.svg
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer
from PIL import Image, ImageColor


def hex_to_rgb(color_str, default=(159, 160, 255)):
  """Convert hex color string to RGB tuple."""
  try:
    if isinstance(color_str, str) and color_str.startswith("#"):
      return ImageColor.getrgb(color_str)
    return default
  except Exception:
    return default


def generate_custom_qr_bytes(
  data_text,
  logo_path="static/img/Logo.png",
  fg_color="#9FA0FF",
  bg_color="#ffffff",
  include_logo=True,
  resolution=1024,
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
    error_correction=qrcode.constants.ERROR_CORRECT_H,
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

  if include_logo and os.path.exists(logo_path):
    try:
      logo = Image.open(logo_path).convert("RGBA")
      qr_width, qr_height = qr_img.size

      max_logo_size = int(qr_width * 0.22)
      logo.thumbnail((max_logo_size, max_logo_size), Image.Resampling.LANCZOS)

      logo_w, logo_h = logo.size
      logo_x = (qr_width - logo_w) // 2
      logo_y = (qr_height - logo_h) // 2

      padding = 10
      bg_margin = Image.new(
        "RGBA", (logo_w + padding, logo_h + padding), (255, 255, 255, 255)
      )
      margin_x = (qr_width - bg_margin.width) // 2
      margin_y = (qr_height - bg_margin.height) // 2

      qr_img.paste(bg_margin, (margin_x, margin_y), bg_margin)
      qr_img.paste(logo, (logo_x, logo_y), logo)
    except Exception as e:
      print(f"Warning: Could not overlay logo: {e}")

  # Scale to requested resolution if different
  target_res = int(resolution) if resolution else 1024
  if target_res and target_res != qr_img.size[0]:
    qr_img = qr_img.resize((target_res, target_res), Image.Resampling.LANCZOS)

  buf = io.BytesIO()
  qr_img.save(buf, format="PNG")
  buf.seek(0)
  return buf


def generate_custom_qr_svg(
    data_text,
    fg_color="#9FA0FF",
    bg_color="#ffffff",
):
  """Generate custom QR code in SVG format."""
  qr = qrcode.QRCode(
    version=None,
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=10,
    border=2,
  )
  qr.add_data(data_text)
  qr.make(fit=True)
  img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
  buf = io.BytesIO()
  img.save(buf)
  svg_content = buf.getvalue().decode("utf-8")

  # Colorize SVG
  svg_content = svg_content.replace('fill="#000000"', f'fill="{fg_color}"')
  svg_content = svg_content.replace('fill="black"', f'fill="{fg_color}"')

  if bg_color and bg_color.lower() not in ("transparent", "none"):
    idx = svg_content.find(">")
    if idx != -1:
      bg_rect = f'<rect width="100%" height="100%" fill="{bg_color}"/>'
      svg_content = svg_content[: idx + 1] + bg_rect + svg_content[idx + 1 :]

  out = io.BytesIO(svg_content.encode("utf-8"))
  out.seek(0)
  return out



