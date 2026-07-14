#!/bin/bash
# FreeArcade Multiplayer Server + Cloudflare Tunnel
# Usage: ./start-tunnel.sh
#
# Starts the WebSocket server on port 10000 and exposes it
# via Cloudflare Tunnel (no credit card needed).
#
# The public wss:// URL is displayed in the terminal.
# Update index.html with this URL when it changes.

PORT=${PORT:-10000}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "═══════════════════════════════════════════"
echo "  FreeArcade Multiplayer Server"
echo "═══════════════════════════════════════════"
echo ""
echo "Starting server on port $PORT..."
echo ""

# Start the Node.js WebSocket server in background
node "$SCRIPT_DIR/server.js" &
SERVER_PID=$!

# Give the server a moment to start
sleep 2

echo ""
echo "Starting Cloudflare Tunnel to localhost:$PORT"
echo ""
echo "Public URL will appear below (wss://*.trycloudflare.com):"
echo ""

# Start cloudflared tunnel (try both paths)
CLOUDFLARED_BIN=""
for p in ~/.local/bin/cloudflared /usr/local/bin/cloudflared /opt/homebrew/bin/cloudflared; do
  if [ -x "$p" ]; then CLOUDFLARED_BIN="$p"; break; fi
done

if [ -z "$CLOUDFLARED_BIN" ]; then
  echo "ERROR: cloudflared not found. Install it first."
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

"$CLOUDFLARED_BIN" tunnel --url "http://localhost:$PORT" &
TUNNEL_PID=$!

# Cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $TUNNEL_PID 2>/dev/null
  kill $SERVER_PID 2>/dev/null
  wait $SERVER_PID 2>/dev/null
  wait $TUNNEL_PID 2>/dev/null
  echo "Done."
}
trap cleanup INT TERM

# Wait for either process to exit
wait $SERVER_PID $TUNNEL_PID
