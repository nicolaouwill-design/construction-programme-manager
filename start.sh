#!/bin/bash
# Construction Programme Manager - Startup Script

echo "🏗️  Starting Construction Programme Manager..."

# Start backend
echo "→ Starting backend (port 8000)..."
cd "$(dirname "$0")/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend
sleep 2

# Start frontend
echo "→ Starting frontend (port 5173)..."
cd "$(dirname "$0")/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Running!"
echo "   App:     http://localhost:5173"
echo "   API:     http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
