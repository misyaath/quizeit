#!/bin/sh
set -eu

root=/sys/fs/cgroup
if [ "$(cat /proc/self/cgroup)" != '0::/' ] || [ "$(stat -fc %T "$root")" != cgroup2fs ]; then
  echo 'The Judge0 worker requires a private cgroup v2 namespace.' >&2
  exit 1
fi

# Keep the worker processes in a leaf so the parent can delegate controllers.
mkdir -p "$root/judge0-worker" "$root/judge0-sandboxes"
while IFS= read -r pid; do
  printf '%s\n' "$pid" > "$root/judge0-worker/cgroup.procs"
done < "$root/cgroup.procs"
printf '+cpu +cpuset +memory +pids\n' > "$root/cgroup.subtree_control"
printf '+cpu +cpuset +memory +pids\n' > "$root/judge0-sandboxes/cgroup.subtree_control"

exec runuser -u judge0 -- /api/docker-entrypoint.sh ./scripts/workers
