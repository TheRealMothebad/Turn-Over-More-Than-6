#!/usr/bin/env bash
# Build the server image, upload it to the VPS through Portainer, and swap the running container over to it.
#
# Needs two untracked files next to this script:
#   vps_ipaddr        address of the VPS
#   portainer_secret  a Portainer API key
#
# Note: games live in the server's memory, so any game in progress is lost when the container is swapped.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="turn-over-more-than-6:latest"
CONTAINER="turn-over-more-than-6"
TAR="tomt6.tar"
# Portainer's numeric id for the Docker environment ("local"). List them with GET /api/endpoints.
ENDPOINT_ID=3
HEALTH_URL="https://tomt6-api.umbriac.com/games"

PORTAINER="https://$(tr -d '[:space:]' < vps_ipaddr):9443"
API_KEY="$(tr -d '[:space:]' < portainer_secret)"
DOCKER_API="$PORTAINER/api/endpoints/$ENDPOINT_ID/docker"

# -k because Portainer on the VPS uses a self-signed certificate
api() {
  curl -ksS --fail-with-body -H "X-API-Key: $API_KEY" "$@"
}

# pull the container id / the id of the image it runs out of a container inspect response
container_id_of() {
  grep -o '"Id":"[a-f0-9]\{64\}"' | head -n 1 | cut -d'"' -f4
}
image_id_of() {
  grep -o '"Image":"sha256:[a-f0-9]*"' | head -n 1 | cut -d'"' -f4
}

echo "==> Deploying $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- server shared Dockerfile || echo ' (with uncommitted server changes)')"

echo "==> Checking Portainer is reachable"
old_json="$(api "$DOCKER_API/containers/$CONTAINER/json")"
container_id="$(echo "$old_json" | container_id_of)"
old_image="$(echo "$old_json" | image_id_of)"
echo "    current container ${container_id:0:12} runs image ${old_image:7:12}"

echo "==> Building $IMAGE"
sudo docker build -t "$IMAGE" .
new_image="$(sudo docker image inspect --format '{{.Id}}' "$IMAGE")"
echo "    built image ${new_image:7:12}"

if [ "$new_image" = "$old_image" ]; then
  echo "==> The VPS is already running this exact image, nothing to do."
  exit 0
fi

echo "==> Saving image to $TAR"
sudo docker save -o "$TAR" "$IMAGE"
sudo chmod a+r "$TAR"

echo "==> Uploading $(du -h "$TAR" | cut -f1) to the VPS"
api -X POST -H "Content-Type: application/x-tar" -T "$TAR" "$DOCKER_API/images/load"
echo

# Portainer recreates the container with the same settings (ports, volumes, networks, restart policy).
# Because the tag now points at the image that was just loaded, the new container runs the new code.
echo "==> Swapping the container"
api -X POST -H "Content-Type: application/json" -d '{"PullImage": false}' \
  "$PORTAINER/api/docker/$ENDPOINT_ID/containers/$container_id/recreate" > /dev/null

echo "==> Verifying"
sleep 3
new_json="$(api "$DOCKER_API/containers/$CONTAINER/json")"
running_image="$(echo "$new_json" | image_id_of)"
if [ "$running_image" = "$old_image" ]; then
  echo "ERROR: the container is still running the old image ${old_image:7:12}" >&2
  exit 1
fi
if ! echo "$new_json" | grep -q '"Running":true'; then
  echo "ERROR: the new container is not running, check its logs in Portainer" >&2
  exit 1
fi
echo "    container is running image ${running_image:7:12}"

if curl -sS --fail -m 15 -o /dev/null "$HEALTH_URL"; then
  echo "    $HEALTH_URL responds"
else
  echo "WARNING: $HEALTH_URL did not respond, the server may still be starting" >&2
fi

# the previous image has lost its tag and would otherwise pile up on the VPS
echo "==> Removing the previous image"
api -X DELETE "$DOCKER_API/images/$old_image" > /dev/null || echo "    (could not remove ${old_image:7:12}, leaving it)"

echo "==> Done"
