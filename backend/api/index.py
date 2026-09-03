import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import app  # Vercel @vercel/python auto-wrap ASGI `app`
