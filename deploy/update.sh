#!/usr/bin/env bash
# Update the live app from GitHub without touching data, secrets or the virtualenv.
# Usage (as root): bash update.sh [branch-or-commit]
set -euo pipefail

REF="${1:-master}"
APP=/var/www/myhealthpredicta
REPO=toppylawz/humandiseaserecognition
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
chmod 755 "$TMP"

curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$TMP" --strip-components=1

rsync -a \
  --exclude 'db.sqlite3' \
  --exclude 'media/' \
  --exclude 'staticfiles/' \
  --exclude '.venv/' \
  --exclude 'myowndissertation/secrets.py' \
  --exclude '.git*' \
  "$TMP"/ "$APP"/

cd "$APP"
.venv/bin/pip install -q -r requirements.txt
set -a; source /etc/myhealthpredicta.env; set +a
DJANGO_SETTINGS_MODULE=myowndissertation.settings_production .venv/bin/python manage.py collectstatic --noinput
chown -R myhealthpredicta:www-data "$APP"
chmod 755 "$APP"
systemctl restart myhealthpredicta
systemctl --no-pager --lines=5 status myhealthpredicta
