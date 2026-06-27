#!/usr/bin/env bash
# Start both the FastAPI backend and Next.js frontend for development.
# Usage: ./scripts/dev.sh  (or: npm run dev:full)

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# Kill anything already on these ports
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Start FastAPI backend (run from backend/ so it finds .env)
echo "Starting backend (FastAPI) on :8000..."
cd "$ROOT/backend"
.venv/bin/uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# Start Next.js frontend
echo "Starting frontend (Next.js) on :3000..."
cd "$ROOT"
npx next dev --port 3000 &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8000  (API docs: http://localhost:8000/docs)"
echo "  Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both."

wait
