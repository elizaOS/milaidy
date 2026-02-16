#!/usr/bin/env bash
# ==========================================================================
# Fresh Install E2E — Docker-based fresh machine simulation (Issue #6)
#
# Validates the full fresh-machine flow:
#   1. Build from source (bun install && bun run build)
#   2. CLI boots without errors (milady --help, --version)
#   3. API server starts and serves endpoints
#   4. Onboarding flow completes
#   5. Agent lifecycle transitions work
#   6. Plugin discovery returns real plugins
#   7. No crashes or hangs
#
# Usage:
#   bash test/scripts/e2e/run-e2e-fresh-install.sh
# ==========================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="milady-fresh-install-e2e"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Milady Fresh Install E2E (Issue #6)           ║"
echo "╚══════════════════════════════════════════════════╝"

echo "==> Building Docker image from source..."
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR"

echo "==> Running fresh install validation..."
docker run --rm -t "$IMAGE_NAME" bash -lc '
  set -euo pipefail

  echo "── Step 1: Verify build artifacts ──"
  test -f dist/index.js || { echo "ERROR: dist/index.js missing"; exit 1; }
  test -f dist/entry.js || { echo "ERROR: dist/entry.js missing"; exit 1; }
  test -f milady.mjs || { echo "ERROR: milady.mjs missing"; exit 1; }
  echo "OK: build artifacts present"

  echo "── Step 2: CLI --help ──"
  node milady.mjs --help > /tmp/help.txt 2>&1 || {
    echo "ERROR: milady --help failed"
    cat /tmp/help.txt
    exit 1
  }
  grep -q "milady" /tmp/help.txt || {
    echo "ERROR: help output missing milady reference"
    cat /tmp/help.txt
    exit 1
  }
  echo "OK: --help works"

  echo "── Step 3: CLI --version ──"
  VERSION="$(node milady.mjs --version 2>/dev/null | head -n 1 | tr -d "\r")"
  if ! echo "$VERSION" | grep -qE "^[0-9]+\.[0-9]+\.[0-9]+"; then
    echo "ERROR: --version did not print semver: $VERSION"
    exit 1
  fi
  echo "OK: version=$VERSION"

  echo "── Step 4: API server starts ──"
  node --input-type=module -e "
    import { startApiServer } from './dist/api/server.js';
    const srv = await startApiServer({ port: 0 });
    const http = await import('node:http');

    const get = (p) => new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + srv.port + p, (r) => {
        let d = '';
        r.on('data', (c) => d += c);
        r.on('end', () => res({ status: r.statusCode, data: JSON.parse(d) }));
      }).on('error', rej);
    });

    // Status endpoint
    const status = await get('/api/status');
    if (status.status !== 200) throw new Error('status endpoint returned ' + status.status);
    if (typeof status.data.agentName !== 'string') throw new Error('missing agentName');

    // Plugins endpoint
    const plugins = await get('/api/plugins');
    if (plugins.status !== 200) throw new Error('plugins endpoint returned ' + plugins.status);
    if (!Array.isArray(plugins.data.plugins)) throw new Error('plugins not array');

    // Onboarding endpoint
    const onboard = await get('/api/onboarding/status');
    if (onboard.status !== 200) throw new Error('onboarding status returned ' + onboard.status);

    // Config endpoint
    const config = await get('/api/config');
    if (config.status !== 200) throw new Error('config endpoint returned ' + config.status);

    // Logs endpoint
    const logs = await get('/api/logs');
    if (logs.status !== 200) throw new Error('logs endpoint returned ' + logs.status);

    // Skills endpoint
    const skills = await get('/api/skills');
    if (skills.status !== 200) throw new Error('skills endpoint returned ' + skills.status);

    // CORS
    const cors = await new Promise((res, rej) => {
      const r = http.request({
        hostname: '127.0.0.1', port: srv.port, path: '/api/status', method: 'OPTIONS',
        headers: { 'Content-Type': 'application/json' }
      }, (response) => {
        response.resume();
        res({ status: response.statusCode, headers: response.headers });
      });
      r.on('error', rej);
      r.end();
    });
    if (cors.status !== 204) throw new Error('CORS returned ' + cors.status);

    // Lifecycle: start -> pause -> resume -> stop
    const post = (p) => new Promise((res, rej) => {
      const r = http.request({
        hostname: '127.0.0.1', port: srv.port, path: p, method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (response) => {
        let d = '';
        response.on('data', (c) => d += c);
        response.on('end', () => res({ status: response.statusCode, data: JSON.parse(d) }));
      });
      r.on('error', rej);
      r.end();
    });

    await post('/api/agent/start');
    const s1 = await get('/api/status');
    if (s1.data.state !== 'running') throw new Error('expected running, got ' + s1.data.state);

    await post('/api/agent/pause');
    const s2 = await get('/api/status');
    if (s2.data.state !== 'paused') throw new Error('expected paused, got ' + s2.data.state);

    await post('/api/agent/resume');
    const s3 = await get('/api/status');
    if (s3.data.state !== 'running') throw new Error('expected running, got ' + s3.data.state);

    await post('/api/agent/stop');
    const s4 = await get('/api/status');
    if (s4.data.state !== 'stopped') throw new Error('expected stopped, got ' + s4.data.state);

    // 404 for unknown route
    const notFound = await get('/api/does-not-exist');
    if (notFound.status !== 404) throw new Error('expected 404, got ' + notFound.status);

    await srv.close();
    console.log('OK: all API endpoints verified');
  "

  echo "── Step 5: Onboarding flow ──"
  home_dir="$(mktemp -d /tmp/milady-fresh-e2e.XXXXXX)"
  export HOME="$home_dir"
  mkdir -p "$HOME/.milady"

  node --input-type=module -e "
    import { startApiServer } from './dist/api/server.js';
    import http from 'node:http';

    const srv = await startApiServer({ port: 0 });

    const post = (p, body) => new Promise((res, rej) => {
      const b = JSON.stringify(body);
      const r = http.request({
        hostname: '127.0.0.1', port: srv.port, path: p, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }
      }, (response) => {
        let d = '';
        response.on('data', (c) => d += c);
        response.on('end', () => res({ status: response.statusCode, data: JSON.parse(d) }));
      });
      r.on('error', rej);
      r.write(b);
      r.end();
    });

    const get = (p) => new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + srv.port + p, (r) => {
        let d = '';
        r.on('data', (c) => d += c);
        r.on('end', () => res({ status: r.statusCode, data: JSON.parse(d) }));
      }).on('error', rej);
    });

    // Run onboarding
    const result = await post('/api/onboarding', {
      name: 'FreshInstallBot',
      bio: ['A fresh install test bot'],
      systemPrompt: 'You are a test agent.',
    });
    if (result.status !== 200 || !result.data.ok) {
      throw new Error('Onboarding failed: ' + JSON.stringify(result.data));
    }

    // Verify name persisted
    const status = await get('/api/status');
    if (status.data.agentName !== 'FreshInstallBot') {
      throw new Error('Name mismatch: ' + status.data.agentName);
    }

    await srv.close();
    console.log('OK: onboarding completed');
  "

  echo "── Step 6: Plugin count validation ──"
  node --input-type=module -e "
    import { startApiServer } from './dist/api/server.js';
    import http from 'node:http';

    const srv = await startApiServer({ port: 0 });
    const get = (p) => new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + srv.port + p, (r) => {
        let d = '';
        r.on('data', (c) => d += c);
        r.on('end', () => res({ status: r.statusCode, data: JSON.parse(d) }));
      }).on('error', rej);
    });

    const { data } = await get('/api/plugins');
    const plugins = data.plugins;
    if (!Array.isArray(plugins) || plugins.length === 0) {
      throw new Error('No plugins discovered');
    }
    console.log('Discovered ' + plugins.length + ' plugins');

    // Verify categories are valid
    const validCats = ['ai-provider', 'connector', 'database', 'feature'];
    for (const p of plugins) {
      if (!validCats.includes(p.category)) {
        throw new Error('Invalid category: ' + p.category + ' for plugin ' + p.id);
      }
    }

    // Should have at least 5 plugins (providers + features)
    if (plugins.length < 5) {
      throw new Error('Expected at least 5 plugins, got ' + plugins.length);
    }

    await srv.close();
    console.log('OK: ' + plugins.length + ' plugins validated');
  "

  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  ✓ Fresh Install E2E — ALL CHECKS PASSED        ║"
  echo "╚══════════════════════════════════════════════════╝"
'

echo "Fresh Install E2E complete."
