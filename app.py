import os
from flask import Flask, render_template, request, jsonify, send_file
from dotenv import load_dotenv
import db
from create_custom_qr import generate_custom_qr_bytes, generate_custom_qr_svg

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "snapqr-super-secret-key-2026")


@app.route("/")
def index():
  return render_template("Home.html")


@app.route("/api/create", methods=["POST"])
def api_create_qr():
  """Create a new dynamic QR record and store the URL in MongoDB."""
  data = request.get_json() or request.form

  target_url = data.get("target_url") or data.get("url")
  if not target_url or not target_url.strip():
    return jsonify({"success": False, "error": "Target URL is required"}), 400

  loading_message = data.get("loading_message", "").strip() or "✨ Hold tight! Redirecting you to something special..."
  loading_subtext = data.get("loading_subtext", "").strip() or "Powered by SnapQR • Securing your connection"
  redirect_delay = data.get("redirect_delay", 3)
  spinner_style = data.get("spinner_style", "dual-ring")
  title = data.get("title", "").strip()
  fg_color = data.get("fg_color", "#9FA0FF")
  bg_color = data.get("bg_color", "#ffffff")
  include_logo = data.get("include_logo", True)

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
    "scan_count": qr_data.get("scan_count", 0),
    "created_at": qr_data.get("created_at").isoformat() if qr_data.get("created_at") else None,
    "last_scanned_at": qr_data.get("last_scanned_at").isoformat() if qr_data.get("last_scanned_at") else None,
  })



@app.route("/qr-image/<id>")
def qr_image(id):
  """Generate branded PNG QR image directly from backend."""
  qr_data = db.get_qr_by_id(id)
  if not qr_data:
    return "QR code not found", 404

  redirect_target = f"{request.host_url}redirect/{id}"
  buf = generate_custom_qr_bytes(
    data_text=redirect_target,
    logo_path="static/img/Logo.png",
    fg_color=qr_data.get("fg_color", "#9FA0FF"),
    bg_color=qr_data.get("bg_color", "#ffffff"),
    include_logo=qr_data.get("include_logo", True),
  )
  return send_file(buf, mimetype="image/png", as_attachment=True, download_name=f"snapqr-{id}.png")


@app.route("/api/download-qr")
def api_download_qr():
  """Generate and download branded QR code in PNG or SVG directly from Flask backend."""
  target_url = request.args.get("url", "").strip() or "https://snapqr.dev"
  fg_color = request.args.get("fg_color", "#9FA0FF")
  bg_color = request.args.get("bg_color", "#ffffff")
  include_logo = request.args.get("include_logo", "true").lower() in ("true", "1", "yes")
  fmt = request.args.get("format", "png").lower()
  try:
    resolution = int(request.args.get("resolution", 1024))
  except (ValueError, TypeError):
    resolution = 1024

  if fmt == "svg":
    buf = generate_custom_qr_svg(
      data_text=target_url,
      fg_color=fg_color,
      bg_color=bg_color,
    )
    return send_file(
      buf,
      mimetype="image/svg+xml",
      as_attachment=True,
      download_name="snapqr-vector.svg",
    )
  else:
    buf = generate_custom_qr_bytes(
      data_text=target_url,
      logo_path="static/img/Logo.png",
      fg_color=fg_color,
      bg_color=bg_color,
      include_logo=include_logo,
      resolution=resolution,
    )
    return send_file(
      buf,
      mimetype="image/png",
      as_attachment=True,
      download_name="snapqr-code.png",
    )


