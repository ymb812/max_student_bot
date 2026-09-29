#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
test -f .env || { echo 'Create .env from .env.example first'; exit 1; }
docker compose up -d --build
docker compose ps
