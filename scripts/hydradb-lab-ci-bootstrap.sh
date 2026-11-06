#!/usr/bin/env bash
# One-time operator action on MiniMac. No sudo, no docker changes, no deploy.
# Generates a NEW dedicated SSH key with a forced, restricted command.
set -euo pipefail
umask 077
REPO=SladeSouzaSantos/phasscode-platform
HOST=100.116.88.73
LAB="$HOME/hydradb-lab/phasscode-platform"
[[ "$(id -un)" == phass ]] || { echo "LAB_CI_BOOTSTRAP_WRONG_USER" >&2; exit 1; }
[[ "$(hostname -s)" == macmini-server ]] || { echo "LAB_CI_BOOTSTRAP_WRONG_HOST" >&2; exit 1; }
[[ -d "$LAB/.git" && ! -L "$LAB" && ! -L "$HOME/hydradb-lab" ]] ||
  { echo "LAB_CI_BOOTSTRAP_PATH_INVALID" >&2; exit 1; }
cd "$LAB"
[[ "$(git branch --show-current)" == experiment/hydradb ]] ||
  { echo "LAB_CI_BOOTSTRAP_WRONG_BRANCH" >&2; exit 1; }
command -v gh >/dev/null
command -v ssh-keygen >/dev/null
gh auth status >/dev/null 2>&1 ||
  { echo "LAB_CI_BOOTSTRAP_GITHUB_LOGIN_REQUIRED" >&2; exit 1; }

key="$HOME/.ssh/hydradb_lab_ci_ed25519"
fixed="$HOME/.local/libexec/hydradb-lab-ci-forced-command"
mkdir -p "$HOME/.ssh" "$HOME/.local/libexec"
chmod 700 "$HOME/.ssh" "$HOME/.local/libexec"
[[ ! -L "$HOME/.ssh/authorized_keys" && ! -L "$key" && ! -L "$key.pub" ]] ||
  { echo "LAB_CI_BOOTSTRAP_SYMLINK_DENIED" >&2; exit 1; }
if [[ ! -e "$key" && ! -e "$key.pub" ]]; then
  ssh-keygen -q -t ed25519 -f "$key" -N '' -C hydradb-lab-ci
elif [[ ! -s "$key" || ! -s "$key.pub" ]]; then
  echo "LAB_CI_BOOTSTRAP_INCOMPLETE_KEY" >&2
  exit 1
fi
chmod 600 "$key"
chmod 644 "$key.pub"
install -m 0500 scripts/hydradb-lab-ci-forced-command.sh "$fixed"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"

pub="$(cat "$key.pub")"
# Do not silently accept a key already authorized with unrestricted access.
if grep -Fq "$pub" "$HOME/.ssh/authorized_keys"; then
  grep -F 'restrict,command="' "$HOME/.ssh/authorized_keys" | grep -Fq "$pub" || {
    echo "LAB_CI_BOOTSTRAP_PUBLIC_KEY_ALREADY_UNRESTRICTED" >&2
    exit 1
  }
else
  printf 'restrict,command="%s" %s\n' "$fixed" "$pub" >> "$HOME/.ssh/authorized_keys"
fi

# Only the two LAB-specific secrets are uploaded. No SSH password, no
# production deploy private key, no Tailscale auth key, and no LLM token.
test -s /etc/ssh/ssh_host_ed25519_key.pub
gh secret set HYDRADB_LAB_SSH_PRIVATE_KEY --repo "$REPO" < "$key"
{ printf '%s ' "$HOST"; cat /etc/ssh/ssh_host_ed25519_key.pub; } |
  gh secret set HYDRADB_LAB_SSH_KNOWN_HOSTS --repo "$REPO"

echo HYDRADB_LAB_CI_KEY_RESTRICTED_AND_SECRETS_REGISTERED
echo "REMOTE_JOB_REMAINS_DISABLED_UNTIL_HYDRADB_LAB_REMOTE_APPROVED_IS_TRUE"
echo "Enable only after reviewing the workflow and the approved command."
