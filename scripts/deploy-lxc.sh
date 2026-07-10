#!/usr/bin/env bash
# Deploy the BTS Soundboard server to the LXC container via SSH (ADR-0007).
#
# Behavior: SSH into the LXC, `docker compose pull` (fetch the pushed image),
# then `docker compose up -d --remove-orphans`. Rollback = re-run this script
# after pinning the compose image to a previous tag.
#
# Prerequisites (provisioning is OUT OF SCOPE per ADR-0007; manual ops runbook):
#   - A Docker-capable LXC container on the Proxmox host with SSH access.
#   - docker-compose.yml + a .env (BTS_SERVER_PORT, BTS_SOUNDS_DIR) present in
#     the LXC working directory (LXC_WORKDIR).
#
# Env vars:
#   LXC_HOST    — LXC SSH host                (default: bts-lxc)
#   LXC_USER    — LXC SSH user                (default: root)
#   LXC_PORT    — LXC SSH port                (default: 22)
#   LXC_WORKDIR — dir on the LXC holding compose + .env (default: /opt/bts-soundboard)
#   LXC_SSH_KEY — deploy SSH private key. Optional: if set, it is written to a
#                 temp file and used via `ssh -i`. If unset, the script relies on
#                 an ssh-agent (e.g. webfactory/ssh-agent in CI) for the key.
#
# NOTE (ADR-0007 follow-up): the compose image is currently :latest; pin it to
# the release tag for reproducible deploys.
set -euo pipefail

LXC_HOST="${LXC_HOST:-bts-lxc}"
LXC_USER="${LXC_USER:-root}"
LXC_PORT="${LXC_PORT:-22}"
LXC_WORKDIR="${LXC_WORKDIR:-/opt/bts-soundboard}"

SSH_ARGS=(
  -p "$LXC_PORT"
  -o StrictHostKeyChecking=accept-new
)

KEY_FILE=""
if [[ -n "${LXC_SSH_KEY:-}" ]]; then
  KEY_FILE="$(mktemp)"
  trap 'rm -f "$KEY_FILE"' EXIT
  printf '%s\n' "$LXC_SSH_KEY" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  SSH_ARGS+=(-i "$KEY_FILE")
fi

echo "Deploying to ${LXC_USER}@${LXC_HOST}:${LXC_PORT} (workdir: ${LXC_WORKDIR})..."

ssh "${SSH_ARGS[@]}" "${LXC_USER}@${LXC_HOST}" \
  "cd '${LXC_WORKDIR}' && docker compose pull && docker compose up -d --remove-orphans"

echo "Deploy complete."
