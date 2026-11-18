FROM debian:bookworm-slim AS build-isolate

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl libcap-dev libseccomp-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src/isolate
RUN curl -fLsS https://codeload.github.com/ioi/isolate/tar.gz/refs/tags/v2.7 -o /tmp/isolate.tar.gz \
    && echo '2a2102aaf10efdb1d2eedcaaafe343a838407e2e21bca8594f8d74cf22915628  /tmp/isolate.tar.gz' | sha256sum -c - \
    && tar -xzf /tmp/isolate.tar.gz --strip-components=1 \
    && make isolate CONFIG=/etc/isolate-v2 \
       LDFLAGS_HARDEN='-static -Wl,-z,noexecstack,-z,relro,-z,now'

FROM judge0/judge0:1.13.1

USER root
COPY --from=build-isolate --chmod=4755 /src/isolate/isolate /usr/local/bin/isolate
COPY isolate.conf /etc/isolate-v2
COPY --chmod=755 start-worker.sh /usr/local/bin/start-cgroup-v2-worker
# Isolate v2 accounts for the whole cgroup automatically when --cg is set.
RUN sed -i '/--cg-timing/d' /api/app/jobs/isolate_job.rb \
    && sed -i 's|export \(.*tee /api/environment\)$|umask 077; export \1 >/dev/null|' /api/scripts/server /api/scripts/workers \
    && install -d -m 755 /var/local/lib/isolate-v2 /run/isolate/locks

USER judge0
