import base64
import io
import os
import re
from flask import Flask, render_template, request, jsonify, send_file
from dotenv import load_dotenv
from PIL import Image
import db
from create_custom_qr import (
  clamp_logo_size,
  generate_custom_qr_bytes,
  generate_custom_qr_svg,
  normalize_logo_bg,
  normalize_logo_shape,
)

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "snapqr-super-secret-key-2026")
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024  # 8 MB max payload

_LOGO_DATA_URI_RE = re.compile(
  r"^data:image/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$",
  re.IGNORECASE,
)
_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{3,8}$")
_MAX_LOGO_BYTES = 3 * 1024 * 1024
_MAX_LOGO_DIM = 640


def sanitize_hex_color(value, default):
  """Validate a hex color string to prevent malformed or unsafe SVG/PIL inputs."""
  if isinstance(value, str):
    trimmed = value.strip()
    if _HEX_COLOR_RE.match(trimmed):
      return trimmed
  return default


def parse_bool(value, default=True):
  """Parse a boolean value from JSON or form/query parameters."""
  if isinstance(value, bool):
    return value
  if value is None:
    return default
  return str(value).strip().lower() in ("true", "1", "yes", "on")


def validate_and_normalize_custom_logo(logo_data):
  """Validate base64 custom logo image and normalize to a compact PNG data URI."""
  if not logo_data or not isinstance(logo_data, str) or not logo_data.strip():
    return None

  match = _LOGO_DATA_URI_RE.match(logo_data.strip())
  if not match:
    raise ValueError("Custom branding image must be a PNG, JPEG, WebP, or GIF data URI.")

  try:
    raw_bytes = base64.b64decode(match.group(2), validate=True)
  except Exception as err:
    raise ValueError("Invalid base64 encoding in custom branding image.") from err

  if not raw_bytes or len(raw_bytes) > _MAX_LOGO_BYTES:
    raise ValueError("Custom branding image exceeds the 3 MB limit.")

  try:
    with Image.open(io.BytesIO(raw_bytes)) as img:
      rgba = img.convert("RGBA")
      if max(rgba.size) > _MAX_LOGO_DIM:
        rgba.thumbnail((_MAX_LOGO_DIM, _MAX_LOGO_DIM), Image.Resampling.LANCZOS)
      buf = io.BytesIO()
      rgba.save(buf, format="PNG", optimize=True)
      normalized_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
      return f"data:image/png;base64,{normalized_b64}"
  except Exception as err:
    raise ValueError("Unable to decode custom branding image.") from err


@app.route("/")
def index():
  return render_template("Home.html")


@app.route("/api/create", methods=["POST"])
def api_create_qr():
  """Create a new dynamic QR record and store the URL in MongoDB."""
  data = request.get_json(silent=True) or request.form

  target_url = data.get("target_url") or data.get("url")
  if not target_url or not str(target_url).strip():
    return jsonify({"success": False, "error": "Target URL is required"}), 400

  loading_message = str(data.get("loading_message", "")).strip() or "✨ Hold tight! Redirecting you to something special..."
  loading_subtext = str(data.get("loading_subtext", "")).strip() or "Powered by SnapQR • Securing your connection"
  redirect_delay = data.get("redirect_delay", 3)
  spinner_style = data.get("spinner_style", "dual-ring")
  title = str(data.get("title", "")).strip()
  fg_color = sanitize_hex_color(data.get("fg_color"), "#9FA0FF")
  bg_color = sanitize_hex_color(data.get("bg_color"), "#ffffff")
  include_logo = parse_bool(data.get("include_logo", True), default=True)
  logo_size = clamp_logo_size(data.get("logo_size", 22))
  logo_shape = normalize_logo_shape(data.get("logo_shape", "rounded"))
  logo_bg = normalize_logo_bg(data.get("logo_bg", "white"))
  ecc_level = str(data.get("ecc_level", "H")).strip().upper()
  if ecc_level not in ("L", "M", "Q", "H"):
    ecc_level = "H"

  try:
    custom_logo = validate_and_normalize_custom_logo(data.get("custom_logo"))
  except ValueError as err:
    return jsonify({"success": False, "error": str(err)}), 400

  try:
    record = db.save_qr_code(
      target_url=target_url,
      loading_message=loading_message,
      loading_subtext=loading_subtext,
      redirect_delay=redirect_delay,
      spinner_style=spinner_style,
      title=title,
      fg_color=fg_color,
      bg_color=bg_color,
      include_logo=include_logo,
      custom_logo=custom_logo,
      logo_size=logo_size,
      logo_shape=logo_shape,
      logo_bg=logo_bg,
      ecc_level=ecc_level,
    )

    short_id = record["short_id"]
    short_url = f"{request.host_url}redirect/{short_id}"

    return jsonify({
      "success": True,
      "short_id": short_id,
      "short_url": short_url,
      "target_url": record["target_url"],
      "loading_message": record["loading_message"],
      "loading_subtext": record["loading_subtext"],
      "redirect_delay": record["redirect_delay"],
      "spinner_style": record["spinner_style"],
      "title": record["title"],
      "fg_color": record["fg_color"],
      "bg_color": record["bg_color"],
      "include_logo": record["include_logo"],
      "has_custom_logo": bool(record.get("custom_logo")),
      "logo_size": record["logo_size"],
      "logo_shape": record["logo_shape"],
      "logo_bg": record["logo_bg"],
      "ecc_level": record["ecc_level"],
      "created_at": record["created_at"].isoformat() if record.get("created_at") else None,
    }), 201

  except Exception as e:
    return jsonify({"success": False, "error": f"Database error: {str(e)}"}), 500


@app.route("/redirect/<id>")
def redirect_handler(id):
  """Lookup target URL in MongoDB, show loading splash screen, then redirect."""
  qr_data = db.get_qr_by_id(id)

  if not qr_data:
    return render_template(
      "Redirection.html",
      short_url=id,
      not_found=True,
      target_url=None,
      loading_message="QR Code Not Found",
      loading_subtext="This link does not exist or may have been deleted.",
      redirect_delay=0,
      spinner_style="dual-ring",
    ), 404

  # Increment scan counter in MongoDB
  db.record_scan(id)

  return render_template(
    "Redirection.html",
    short_url=id,
    not_found=False,
    target_url=qr_data.get("target_url"),
    loading_message=qr_data.get("loading_message", "Loading destination..."),
    loading_subtext=qr_data.get("loading_subtext", "Powered by SnapQR"),
    redirect_delay=qr_data.get("redirect_delay", 3),
    spinner_style=qr_data.get("spinner_style", "dual-ring"),
  )


@app.route("/api/qr/<id>")
def api_get_qr(id):
  """Get QR code details and scan statistics from MongoDB."""
  qr_data = db.get_qr_by_id(id)
  if not qr_data:
    return jsonify({"success": False, "error": "Not found"}), 404

  return jsonify({
    "success": True,
    "short_id": qr_data.get("short_id"),
    "target_url": qr_data.get("target_url"),
    "loading_message": qr_data.get("loading_message"),
    "loading_subtext": qr_data.get("loading_subtext"),
    "redirect_delay": qr_data.get("redirect_delay"),
    "spinner_style": qr_data.get("spinner_style"),
    "include_logo": qr_data.get("include_logo", True),
    "has_custom_logo": bool(qr_data.get("custom_logo")),
    "logo_size": qr_data.get("logo_size", 22),
    "logo_shape": qr_data.get("logo_shape", "rounded"),
    "logo_bg": qr_data.get("logo_bg", "white"),
    "ecc_level": qr_data.get("ecc_level", "H"),
    "scan_count": qr_data.get("scan_count", 0),
    "created_at": qr_data.get("created_at").isoformat() if qr_data.get("created_at") else None,
    "last_scanned_at": qr_data.get("last_scanned_at").isoformat() if qr_data.get("last_scanned_at") else None,
  })


@app.route("/qr-image/<id>")
def qr_image(id):
  """Generate branded PNG or SVG QR image directly from backend."""
  qr_data = db.get_qr_by_id(id)
  if not qr_data:
    return "QR code not found", 404

  redirect_target = f"{request.host_url}redirect/{id}"
  fmt = request.args.get("format", "png").strip().lower()
  common_kwargs = {
    "data_text": redirect_target,
    "logo_path": "static/img/Logo.png",
    "fg_color": sanitize_hex_color(qr_data.get("fg_color"), "#9FA0FF"),
    "bg_color": sanitize_hex_color(qr_data.get("bg_color"), "#ffffff"),
    "include_logo": qr_data.get("include_logo", True),
    "logo_data": qr_data.get("custom_logo"),
    "logo_size": qr_data.get("logo_size", 22),
    "logo_shape": qr_data.get("logo_shape", "rounded"),
    "logo_bg": qr_data.get("logo_bg", "white"),
    "ecc_level": qr_data.get("ecc_level", "H"),
  }

  if fmt == "svg":
    buf = generate_custom_qr_svg(**common_kwargs)
    return send_file(
      buf,
      mimetype="image/svg+xml",
      as_attachment=True,
      download_name=f"snapqr-{id}.svg",
    )

  buf = generate_custom_qr_bytes(**common_kwargs)
  return send_file(buf, mimetype="image/png", as_attachment=True, download_name=f"snapqr-{id}.png")


@app.route("/api/download-qr", methods=["GET", "POST"])
def api_download_qr():
  """Generate and download branded QR code in PNG or SVG directly from Flask backend."""
  if request.method == "POST":
    payload = request.get_json(silent=True) or request.form
  else:
    payload = request.args

  target_url = str(payload.get("url", "")).strip() or "https://snapqr.dev"
  fg_color = sanitize_hex_color(payload.get("fg_color"), "#9FA0FF")
  bg_color = sanitize_hex_color(payload.get("bg_color"), "#ffffff")
  include_logo = parse_bool(payload.get("include_logo", True), default=True)
  logo_size = clamp_logo_size(payload.get("logo_size", 22))
  logo_shape = normalize_logo_shape(payload.get("logo_shape", "rounded"))
  logo_bg = normalize_logo_bg(payload.get("logo_bg", "white"))
  ecc_level = str(payload.get("ecc_level", "H")).strip().upper()
  if ecc_level not in ("L", "M", "Q", "H"):
    ecc_level = "H"
  fmt = str(payload.get("format", "png")).strip().lower()

  try:
    resolution = int(payload.get("resolution", 1024))
  except (ValueError, TypeError):
    resolution = 1024

  try:
    custom_logo = validate_and_normalize_custom_logo(payload.get("custom_logo"))
  except ValueError as err:
    return jsonify({"success": False, "error": str(err)}), 400

  if fmt == "svg":
    buf = generate_custom_qr_svg(
      data_text=target_url,
      fg_color=fg_color,
      bg_color=bg_color,
      include_logo=include_logo,
      logo_path="static/img/Logo.png",
      logo_data=custom_logo,
      logo_size=logo_size,
      logo_shape=logo_shape,
      logo_bg=logo_bg,
      ecc_level=ecc_level,
    )
    return send_file(
      buf,
      mimetype="image/svg+xml",
      as_attachment=True,
      download_name="snapqr-vector.svg",
    )

  buf = generate_custom_qr_bytes(
    data_text=target_url,
    logo_path="static/img/Logo.png",
    fg_color=fg_color,
    bg_color=bg_color,
    include_logo=include_logo,
    resolution=resolution,
    logo_data=custom_logo,
    logo_size=logo_size,
    logo_shape=logo_shape,
    logo_bg=logo_bg,
    ecc_level=ecc_level,
  )
  return send_file(
    buf,
    mimetype="image/png",
    as_attachment=True,
    download_name="snapqr-code.png",
  )
