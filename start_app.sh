#!/bin/bash
cd "$(dirname "$0")"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
gunicorn --workers 4 --bind 0.0.0.0:5000 src.main:app
