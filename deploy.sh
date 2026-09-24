#!/bin/bash
# Deploy what is on origin/main: build its images on this machine, load them on
# the server, and have the server switch to them.
#
#   ./deploy.sh            build, ship, and switch the inactive slot live
#   ./deploy.sh rollback   switch HTTP traffic back to the stopped slot
#
#   fetch origin/main into a clean build checkout -> build
#   naru-pub-control-plane:<commit> and naru-pub-proxy:<commit> -> ship them
#   over ssh -> run deploy-server.sh <commit> on the server
#
# The builds used to run on the server, where a Next.js build and a release
# Cargo build ran the Docker VM out of memory under every other service on that
# host. Both machines are arm64, so an image built here runs there as is.
#
# The server is reached by the ssh alias in DEPLOY_HOST, so its address lives
# in ~/.ssh/config and not in this public repository:
#
#   Host naru-pub-deploy
#       HostName <the server's address>
#
# Docker here has to be running. OrbStack is started if it is not.
set -Eeuo pipefail

DEPLOY_HOST=${DEPLOY_HOST:-naru-pub-deploy}
# Expanded by the server's shell, not this one.
REMOTE_DIR=${REMOTE_DIR:-'~/Git/naru-pub'}
# A checkout of its own rather than the one this script was run from: that one
# holds node_modules, .next, target and the rest of a working tree, and it may
# not be what was pushed. This one is cleaned to exactly the commit deployed.
BUILD_DIR=${DEPLOY_BUILD_DIR:-$HOME/.cache/naru-pub-deploy}
LOCK_DIR=$BUILD_DIR.lock

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

# A login shell, so the server's PATH has docker and zstd on it.
remote() {
  ssh "$DEPLOY_HOST" "zsh -l -c '$1'"
}

case "${1:-deploy}" in
  deploy) ;;
  rollback)
    remote "$REMOTE_DIR/deploy-server.sh rollback"
    exit 0
    ;;
  *)
    echo "Usage: $0 [deploy|rollback]" >&2
    exit 2
    ;;
esac

mkdir -p "$(dirname "$BUILD_DIR")"
# One deploy at a time: two would share the build checkout.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another deploy is in progress (remove $LOCK_DIR if it is not)." >&2
  exit 1
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

if ! docker info >/dev/null 2>&1; then
  if command -v orb >/dev/null; then
    echo "Starting OrbStack..."
    orb start
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running on this machine." >&2
    exit 1
  fi
fi

echo "Fetching origin/main..."
if [[ ! -d $BUILD_DIR/.git ]]; then
  git clone --quiet "$(git -C "$SOURCE_DIR" remote get-url origin)" "$BUILD_DIR"
fi
git -C "$BUILD_DIR" fetch --quiet origin main
COMMIT="$(git -C "$BUILD_DIR" rev-parse FETCH_HEAD)"
git -C "$BUILD_DIR" checkout --quiet --detach "$COMMIT"
git -C "$BUILD_DIR" clean -qffdx
CONTROL_PLANE_IMAGE="naru-pub-control-plane:$COMMIT"
PROXY_IMAGE="naru-pub-proxy:$COMMIT"
echo "Deploying $(git -C "$BUILD_DIR" log -1 --format='%h %s')"

# Only what has been pushed goes out, because the server checks out the same
# commit for its compose file and deploy-server.sh.
if [[ "$(git -C "$SOURCE_DIR" rev-parse HEAD)" != "$COMMIT" ]]; then
  echo "  (not this checkout's HEAD, $(git -C "$SOURCE_DIR" rev-parse --short HEAD); push first to deploy that)"
fi

# A deploy that failed after shipping can be retried without rebuilding or
# sending the images again.
if remote "docker image inspect $CONTROL_PLANE_IMAGE $PROXY_IMAGE" >/dev/null 2>&1; then
  echo "The server already has both images for $COMMIT."
else
  # NEXT_PUBLIC_* are compiled into the client bundle, so the build needs them.
  # The server's .env stays their one source of truth; only these public
  # values are read from it. The Dockerfile's defaults apply to any it lacks.
  echo "Reading build-time settings from the server..."
  BUILD_ARGS=()
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    value=${line#*=}
    # Compose strips the quotes .env values may carry; do the same.
    if [[ $value == \"*\" || $value == \'*\' ]]; then
      value=${value:1:${#value}-2}
    fi
    BUILD_ARGS+=(--build-arg "${line%%=*}=$value")
  done < <(remote "grep ^NEXT_PUBLIC_ $REMOTE_DIR/.env || true")

  echo "Building $CONTROL_PLANE_IMAGE..."
  DOCKER_BUILDKIT=1 docker build \
    --platform linux/arm64 \
    ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"} \
    --tag "$CONTROL_PLANE_IMAGE" \
    "$BUILD_DIR/control-plane"

  echo "Building $PROXY_IMAGE..."
  DOCKER_BUILDKIT=1 docker build \
    --platform linux/arm64 \
    --tag "$PROXY_IMAGE" \
    "$BUILD_DIR/proxy"

  # One stream for both, so the layers they share are sent once.
  echo "Shipping both images to $DEPLOY_HOST..."
  docker save "$CONTROL_PLANE_IMAGE" "$PROXY_IMAGE" \
    | zstd -T0 -3 -q \
    | remote "zstd -dcq | docker load --quiet"
fi

# One-time: a server checkout from before this script existed has no
# deploy-server.sh to run, so bring it up to the commit being deployed first.
# Every later deploy leaves moving the checkout to deploy-server.sh, which does
# it under its lock.
if ! remote "test -x $REMOTE_DIR/deploy-server.sh"; then
  echo "Bringing the server checkout up to $COMMIT for its first deploy-server.sh..."
  remote "cd $REMOTE_DIR && git fetch --quiet origin && git merge --ff-only --quiet $COMMIT"
fi

echo "Switching the server to $COMMIT..."
remote "$REMOTE_DIR/deploy-server.sh $COMMIT"

# The server has the images now, and these copies only existed to be sent
# there. Keeping the ones just deployed makes a retry cheap; the build cache
# that makes the next build fast is separate and stays.
for repository in naru-pub-control-plane naru-pub-proxy; do
  for tag in $(docker image ls "$repository" --format '{{.Tag}}'); do
    if [[ "$tag" != "$COMMIT" ]]; then
      docker rmi "$repository:$tag" >/dev/null 2>&1 || true
    fi
  done
done
