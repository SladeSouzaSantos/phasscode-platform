#!/usr/bin/env bash
# Linux: bash scripts/retire-worker.sh <development|production> [--inspect|--apply]
# No authentication, calendar, meeting or notification actions are performed.
# --inspect is read-only. --apply is an explicit one-time supervised shutdown,
# and refuses any pending obligations, incomplete deployments or unclear exit.
set -euo pipefail
fail() { echo "ERROR: $*" >&2; exit 1; }
[[ $# -ge 1 && $# -le 2 ]] || fail 'Usage: retire-worker.sh <development|production> [--inspect|--apply].'
target=$1
mode=${2:---inspect}
[[ "$mode" == --inspect || "$mode" == --apply ]] || fail 'Use --inspect or --apply.'
case "$target" in
  development) project=phasscode-platform-dev; branch=dev ;;
  production) project=phasscode-platform; branch=main ;;
  *) fail 'Choose development or production.' ;;
esac
projects_root=${PHASSCODE_PROJECTS_ROOT:-/opt/projects}
[[ "$projects_root" == /* ]] || fail 'Projects root must be absolute.'
project_dir="$projects_root/$project"
[[ -d "$project_dir/.git" && -f "$project_dir/.env" ]] || fail 'Prepare the exact checkout and private .env.'
actual_root=$(cd -- "$projects_root" && pwd -P)
actual_project=$(cd -- "$project_dir" && pwd -P)
[[ "$actual_project" == "$actual_root/$project" ]] || fail 'Project checkout resolves outside its expected root.'
cd -- "$project_dir"
[[ "$(git branch --show-current)" == "$branch" ]] || fail 'Incorrect checkout branch.'
[[ ! -L .deployment && ! -L .deployment/worker-retired &&
   ! -L .deployment/worker-stop-attempted ]] || fail 'Unsafe deployment metadata symlink.'
[[ ! -e .deployment/attempted-phase && ! -e .deployment/attempted-image-ref ]] ||
  fail 'R4_UNRECONCILED_ATTEMPT: inspect database and deployment state first.'
[[ ! -e .deployment/worker-stop-attempted ]] ||
  fail 'LEGACY_WORKER_STOP_INCOMPLETE: supervised investigation required.'
[[ ! -d .deploy-lock ]] || fail 'Deployment currently locked; investigate before retirement.'
compose=(bash "$project_dir/scripts/compose.sh" "$project" "$project_dir/.env")
if [[ ${PHASSCODE_USE_PROXY:-} == true ]]; then compose+=(--proxy); fi
"${compose[@]}" config --quiet
filter=("label=com.docker.compose.project=$project" "label=com.docker.compose.service=worker")
all=$(docker ps --all --filter "${filter[0]}" --filter "${filter[1]}" --format '{{.ID}}')
running=$(docker ps --filter "${filter[0]}" --filter "${filter[1]}" --format '{{.ID}}')
[[ "$all" != *$'\\n'* && "$running" != *$'\\n'* ]] ||
  fail 'Multiple legacy workers found. Inspect manually.'
if [[ -z "$all" ]]; then
  [[ -z "$running" ]] || fail 'Inconsistent Docker worker state.'
  echo 'No legacy worker container in this Compose project. No retirement action required.'
  exit 0
fi
# Aggregate-only read from the existing Postgres container; no visitor details or secrets
# are printed. A missing schema, unavailable database or malformed response fails closed.
# Do not copy passwords into the host shell or log full Compose configuration.
counts=$("${compose[@]}" exec -T postgres sh -c '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -c "
    SELECT
      (SELECT COUNT(*) FROM meeting_outbox WHERE processed_at IS NULL),
      (SELECT COUNT(*) FROM notification_deliveries WHERE status IN (\x27PENDING\x27,\x27SENDING\x27)),
      (SELECT COUNT(*) FROM meetings WHERE status IN (\x27PENDING\x27,\x27APPROVED\x27,\x27CONFIRMED\x27)),
      (SELECT COUNT(*) FROM meetings WHERE calendar_lease_until > now());
  "
') || fail 'LEGACY_AUDIT_UNAVAILABLE: inspect PostgreSQL without changing data.'
[[ "$counts" =~ ^[0-9]+\\|[0-9]+\\|[0-9]+\\|[0-9]+$ ]] ||
  fail 'LEGACY_AUDIT_INVALID: unexpected aggregate-only response.'
IFS='|' read -r outbox deliveries meetings leases <<< "$counts"
printf 'Legacy audit: pending_outbox=%s pending_notifications=%s active_meetings=%s active_calendar_leases=%s worker_running=%s\n' \
  "$outbox" "$deliveries" "$meetings" "$leases" "$([[ -n "$running" ]] && echo yes || echo no)"
if [[ "$mode" == --inspect ]]; then
  echo 'Read-only inspection complete. No worker or database changes made.'
  exit 0
fi
[[ "$outbox" == 0 && "$deliveries" == 0 && "$meetings" == 0 && "$leases" == 0 ]] ||
  fail 'LEGACY_OBLIGATIONS_PRESENT: resolve external commitments and review backlog before retirement.'
mkdir -- .deploy-lock 2>/dev/null || fail 'A deployment/retirement already holds .deploy-lock.'
trap 'rmdir -- .deploy-lock' EXIT
mkdir -p -- .deployment
[[ ! -e .deployment/worker-retired-next && ! -L .deployment/worker-retired-next ]] ||
  fail 'Unexpected retirement state; inspect before retry.'
# Marker remains after an interrupted stop and prevents all future deploys.
printf '%s\\n' "$project" > .deployment/worker-stop-attempted
if [[ -n "$running" ]]; then
  "${compose[@]}" --profile worker stop --timeout 45 worker ||
    fail 'LEGACY_WORKER_STOP_FAILED: inspect shutdown logs and outbox before retrying.'
fi
[[ -z "$(docker ps --filter "${filter[0]}" --filter "${filter[1]}" --format '{{.ID}}')" ]] ||
  fail 'LEGACY_WORKER_STILL_RUNNING: supervised investigation required.'
# A failed graceful shutdown (e.g. deadline or SIGKILL) is not a valid retirement.
[[ "$(docker inspect --format '{{.State.Running}}|{{.State.ExitCode}}' "$all")" == 'false|0' ]] ||
  fail 'LEGACY_WORKER_EXIT_UNSAFE: inspect termination and reconcile before retrying.'
printf '%s\\n' "$project" > .deployment/worker-retired-next
mv -- .deployment/worker-retired-next .deployment/worker-retired
rm -- .deployment/worker-stop-attempted
echo 'LEGACY_WORKER_RETIRED: graceful shutdown verified. No migrations or data deletion performed.'
