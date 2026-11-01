from app import app
import os
from dotenv import load_dotenv

load_dotenv()


if __name__ == "__main__":
  port = int(os.getenv("PORT", 5000))
  debug = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")
  app.run(host="0.0.0.0", port=port, debug=debug)