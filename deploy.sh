#!/bin/bash
set -Eeuo pipefail

export PATH="$HOME/.orbstack/bin:$PATH"

cd "$(dirname "$0")"

STATE_DIR=.deploy-state
NGINX_DIR="$STATE_DIR/nginx"
ACTIVE_FILE="$STATE_DIR/active-slot"
mkdir -p "$NGINX_DIR"

active_slot() {
  if [[ -f "$ACTIVE_FILE" ]]; then
    cat "$ACTIVE_FILE"
  else
    printf 'none'
  fi
}

other_slot() {
  case "$1" in
    blue) printf 'green' ;;
    green) printf 'blue' ;;
    none) printf 'blue' ;;
    *) echo "Invalid active slot: $1" >&2; exit 1 ;;
  esac
}

render_gateway_config() {
  local slot=$1
  local destination=$2

  cat > "$destination" <<EOF
map \$http_x_forwarded_proto \$naru_forwarded_proto {
    default \$http_x_forwarded_proto;
    ""      \$scheme;
}

map \$http_upgrade \$naru_connection_upgrade {
    default upgrade;
    ""      "";
}

# The site database API is the one control-plane surface a stranger can drive at
# will: it is public, CORS-open, and every request costs a PostgreSQL round trip
# on the pool the whole control plane shares. These buckets keep a burst against
# one site from becoming a sign-in outage for everyone else. Per-client, so a
# busy site with many real visitors is unaffected.
#
# Every request reaches this gateway through the Cloudflare Tunnel running on the
# host, so the peer address is the tunnel, identical for the whole internet. A
# limit keyed on it would be one bucket for every visitor at once — which is not
# a rate limit, it is an outage waiting for a busy afternoon.
#
# The real address is recovered per server block (see below), so these zones key
# on the visitor rather than on the tunnel every request shares.
#
# The application's own CF-Connecting-IP trust (SITE_DATA_TRUST_CLOUDFLARE_IP)
# stays a separate, still-unset decision. Getting the gateway's key wrong costs
# an attacker their own rate-limit bucket; getting the application's wrong costs
# the public write limits their meaning, so it is not a switch to flip here.
limit_req_zone \$binary_remote_addr zone=naru_data:16m rate=30r/s;
limit_req_zone \$binary_remote_addr zone=naru_data_auth:8m rate=2r/s;
limit_req_status 429;
limit_conn_zone \$binary_remote_addr zone=naru_conn:16m;
limit_conn_status 429;

upstream naru_control_plane {
    server control-plane-$slot:3000;
    keepalive 32;
}

upstream naru_site_proxy {
    server proxy-$slot:5000;
    keepalive 32;
}

server {
    listen 3000;
    client_max_body_size 0;

    # Recover the visitor's address before the limits below are keyed on it.
    # Trusted only when the peer is the private tunnel address: cloudflared
    # connects outbound and these ports are not routable from off the host's
    # network, so an internet caller cannot supply this header themselves.
    # Scoped to this server block, leaving the hosted-site proxy on :5000
    # exactly as it was. real_ip runs before limit_req, so \$binary_remote_addr
    # is already the visitor by the time a bucket is chosen.
    set_real_ip_from 10.0.0.0/8;
    set_real_ip_from 172.16.0.0/12;
    set_real_ip_from 192.168.0.0/16;
    set_real_ip_from 127.0.0.0/8;
    set_real_ip_from ::1/128;
    set_real_ip_from fd00::/8;
    # CF-Connecting-IP does not survive this tunnel; X-Forwarded-For does, and
    # recursion walks it right to left past trusted hops so a value a client
    # prepended itself cannot win.
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;

    # A document is capped at 64 KiB and the largest body the data API accepts
    # is one batch of them, so nothing on these routes needs megabytes.
    location /api/data/ {
        limit_req zone=naru_data burst=60 nodelay;
        limit_conn naru_conn 24;
        client_max_body_size 1m;
        proxy_pass http://naru_control_plane;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$naru_forwarded_proto;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_buffering off;
    }

    # Sign-in is a human action a few times a day, never a page-load cost, so
    # this can be far tighter than the data API. Token exchange and revocation
    # both live here, and both are worth bounding against guessing.
    location /api/data-auth/ {
        limit_req zone=naru_data_auth burst=10 nodelay;
        limit_conn naru_conn 24;
        client_max_body_size 64k;
        proxy_pass http://naru_control_plane;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$naru_forwarded_proto;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://naru_control_plane;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$naru_forwarded_proto;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$naru_connection_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }
}

server {
    listen 5000;
    client_max_body_size 0;

    location / {
        proxy_pass http://naru_site_proxy;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$naru_forwarded_proto;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }
}
EOF
}

wait_for_healthy() {
  local service=$1
  local container_id
  local status

  container_id=$(docker compose ps -q "$service")
  if [[ -z "$container_id" ]]; then
    echo "$service did not start." >&2
    return 1
  fi

  for _ in $(seq 1 60); do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
    case "$status" in
      healthy) return 0 ;;
      unhealthy|exited|dead)
        docker compose logs --tail=100 "$service" >&2
        return 1
        ;;
    esac
    sleep 1
  done

  echo "$service did not become healthy within 60 seconds." >&2
  docker compose logs --tail=100 "$service" >&2
  return 1
}

switch_gateway() {
  local slot=$1
  local config="$NGINX_DIR/default.conf"
  local next_config="$STATE_DIR/default.conf.next"
  local previous_config="$STATE_DIR/default.conf.previous"

  render_gateway_config "$slot" "$next_config"
  if [[ -f "$config" ]]; then
    cp "$config" "$previous_config"
  fi
  cp "$next_config" "$config"

  if docker compose ps --status running --services | grep -qx gateway; then
    if ! docker compose exec -T gateway nginx -t; then
      [[ -f "$previous_config" ]] && cp "$previous_config" "$config"
      return 1
    fi
    docker compose exec -T gateway nginx -s reload
  else
    # The first blue-green deployment replaces the two legacy containers that
    # own the public ports. Every later deployment keeps the gateway running.
    docker compose pull gateway
    docker compose create gateway
    docker rm -f naru-pub-control-plane naru-pub-proxy 2>/dev/null || true
    docker compose start gateway
    wait_for_healthy gateway
  fi

  printf '%s\n' "$slot" > "$ACTIVE_FILE"
  rm -f "$next_config" "$previous_config"
}

rollback() {
  local current target
  current=$(active_slot)
  if [[ "$current" == none ]]; then
    echo "No previous blue-green deployment is available." >&2
    exit 1
  fi
  target=$(other_slot "$current")
  wait_for_healthy "control-plane-$target"
  wait_for_healthy "proxy-$target"
  switch_gateway "$target"
  echo "Traffic rolled back from $current to $target."
}

if [[ "${BASH_SOURCE[0]:-$0}" != "$0" ]]; then
  return 0
fi

if [[ "${1:-deploy}" == rollback ]]; then
  rollback
  exit 0
fi
if [[ "${1:-deploy}" != deploy ]]; then
  echo "Usage: $0 [deploy|rollback]" >&2
  exit 2
fi

if [[ "${NARU_DEPLOY_AFTER_PULL:-0}" != 1 ]]; then
  echo "Pulling latest changes..."
  git pull --ff-only
  exec env NARU_DEPLOY_AFTER_PULL=1 "$0" "$@"
fi

current=$(active_slot)
target=$(other_slot "$current")
control_plane_service="control-plane-$target"
proxy_service="proxy-$target"

echo "Building the $target slot while $current continues serving traffic..."
docker compose build "$control_plane_service" "$proxy_service"

echo "Running backward-compatible migrations..."
docker compose run --rm --no-deps "$control_plane_service" pnpm migrate

echo "Starting and checking the $target slot..."
docker compose up -d --no-deps --force-recreate "$control_plane_service" "$proxy_service"
wait_for_healthy "$control_plane_service"
wait_for_healthy "$proxy_service"

echo "Switching traffic to the $target slot..."
switch_gateway "$target"

echo "Updating background processes..."
docker compose up -d --no-deps --force-recreate cron worker

echo "Deployment complete. Active slot: $target (previous slot: $current)."
if [[ "$current" != none ]]; then
  echo "Run ./deploy.sh rollback to switch HTTP traffic back before the next deployment."
else
  echo "The first rollback slot will become available after the next deployment."
fi
