import os
import secrets
import string
from datetime import datetime, timezone
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, PyMongoError
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("DB_NAME", "snapqr_db")

_client = None


def get_db():
  """Lazy database connection manager."""
  global _client
  if _client is None:
    try:
      _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
      # Trigger connection check
      _client.admin.command('ping')
    except ConnectionFailure as err:
      print(f"Warning: MongoDB connection failed: {err}")
      raise err
  return _client[DB_NAME]


def generate_short_id(length=6):
  """Generate a URL-safe unique short alphanumeric slug."""
  alphabet = string.ascii_letters + string.digits
  return "".join(secrets.choice(alphabet) for _ in range(length))


def save_qr_code(
  target_url,
  loading_message="✨ Hold tight! Redirecting you to something special...",
  loading_subtext="Powered by SnapQR • Securing your connection",
  redirect_delay=3,
  spinner_style="dual-ring",
  title="Scan to Explore",
  fg_color="#9FA0FF",
  bg_color="#ffffff",
  include_logo=True,
):
  """Save a new QR record into MongoDB and return its unique short_id."""
  db = get_db()
  qr_collection = db["qr_codes"]

  # Generate a unique slug
  for _ in range(5):
    short_id = generate_short_id(6)
    if not qr_collection.find_one({"short_id": short_id}):
      break
  else:
    short_id = generate_short_id(8)

  # Normalize URL
  if not (target_url.startswith("http://") or target_url.startswith("https://")):
    target_url = "https://" + target_url

  record = {
    "short_id": short_id,
    "target_url": target_url.strip(),
    "loading_message": loading_message.strip()
    or "Loading your experience...",
    "loading_subtext": loading_subtext.strip()
    or "Securing connection & redirecting...",
    "redirect_delay": int(redirect_delay) if redirect_delay else 3,
    "spinner_style": spinner_style or "dual-ring",
    "title": title.strip() if title else "",
    "fg_color": fg_color or "#9FA0FF",
    "bg_color": bg_color or "#ffffff",
    "include_logo": bool(include_logo),
    "scan_count": 0,
    "created_at": datetime.now(timezone.utc),
    "last_scanned_at": None,
  }

  qr_collection.insert_one(record)
  return record


def get_qr_by_id(short_id):
  """Retrieve a QR record from MongoDB by short_id."""
  db = get_db()
  return db["qr_codes"].find_one({"short_id": short_id})


def record_scan(short_id):
  """Increment the scan count and set last_scanned_at."""
  try:
    db = get_db()
    db["qr_codes"].update_one(
        {"short_id": short_id},
        {
          "$inc": {"scan_count": 1},
          "$set": {"last_scanned_at": datetime.now(timezone.utc)},
        },
    )
  except PyMongoError as err:
    print(f"Failed to record scan for {short_id}: {err}")


