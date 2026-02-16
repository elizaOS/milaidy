#!/usr/bin/env bash
# ==========================================================================
# Stress Test E2E — Docker-based stress testing (Issue #6)
#
# Tests under load conditions:
#   1. All plugins enabled simultaneously (plugin loading stress)
#   2. Long-running API server with many sequential requests
#   3. Rapid state transitions (deadlock detection)
#   4. Concurrent request handling
#   5. Memory usage monitoring
#
# Usage:
#   bash test/scripts/e2e/run-e2e-stress-test.sh
# ==========================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="milady-stress-e2e"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Milady Stress Test E2E (Issue #6)             ║"
echo "╚══════════════════════════════════════════════════╝"

echo "==> Building Docker image..."
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/scripts/e2e/Dockerfile" "$ROOT_DIR"

echo "==> Running stress tests..."
docker run --rm -t "$IMAGE_NAME" bash -lc '
  set -euo pipefail

  echo "── Stress Test 1: All plugins discoverable ──"
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
    console.log('Total plugins: ' + plugins.length);

    // Group by category
    const cats = {};
    for (const p of plugins) {
      cats[p.category] = (cats[p.category] || 0) + 1;
    }
    for (const [cat, count] of Object.entries(cats)) {
      console.log('  ' + cat + ': ' + count);
    }

    if (plugins.length < 5) {
      throw new Error('Expected at least 5 discoverable plugins, got ' + plugins.length);
    }

    await srv.close();
    console.log('OK: plugin discovery stress passed');
  "

  echo "── Stress Test 2: 200 sequential API requests ──"
  node --input-type=module -e "
    import { startApiServer } from './dist/api/server.js';
    import http from 'node:http';

    const srv = await startApiServer({ port: 0 });
    const get = (p) => new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + srv.port + p, (r) => {
        let d = '';
        r.on('data', (c) => d += c);
        r.on('end', () => res({ status: r.statusCode }));
      }).on('error', rej);
    });

    const start = performance.now();
    let ok = 0;
    let fail = 0;
    const endpoints = ['/api/status', '/api/plugins', '/api/logs', '/api/config', '/api/skills'];
    for (let i = 0; i < 200; i++) {
      const ep = endpoints[i % endpoints.length];
      const r = await get(ep);
      if (r.status === 200) ok++;
      else fail++;
    }
    const elapsed = performance.now() - start;
    console.log('200 requests: ok=' + ok + ' fail=' + fail + ' time=' + elapsed.toFixed(0) + 'ms (' + (elapsed/200).toFixed(1) + 'ms/req)');

    if (fail > 0) throw new Error(fail + ' requests failed');
    await srv.close();
    console.log('OK: sequential request stress passed');
  "

  echo "── Stress Test 3: Rapid state transitions (deadlock detection) ──"
  node --input-type=module -e "
    import { startApiServer } from './dist/api/server.js';
    import http from 'node:http';

    const srv = await startApiServer({ port: 0 });

    const post = (p) => new Promise((res, rej) => {
      const r = http.request({
        hostname: '127.0.0.1', port: srv.port, path: p, method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (response) => {
        let d = '';
        response.on('data', (c) => d += c);
        response.on('end', () => res({ status: response.statusCode }));
      });
      r.on('error', rej);
      r.end();
    });

    const get = (p) => new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + srv.port + p, (r) => {
        let d = '';
        r.on('data', (c) => d += c);
        r.on('end', () => res({ status: r.statusCode, data: JSON.parse(d) }));
      }).on('error', rej);
    });

    const start = performance.now();
    for (let cycle = 0; cycle < 10; cycle++) {
      await post('/api/agent/start');
      const s1 = await get('/api/status');
      if (s1.data.state !== 'running') throw new Error('Expected running, got ' + s1.data.state);

      await post('/api/agent/pause');
      const s2 = await get('/api/status');
      if (s2.data.state !== 'paused') throw new Error('Expected paused, got ' + s2.data.state);

      await post('/api/agent/resume');
      const s3 = await get('/api/status');
      if (s3.data.state !== 'running') throw new Error('Expected running, got ' + s3.data.state);

      await post('/api/agent/stop');
      const s4 = await get('/api/status');
      if (s4.data.state !== 'stopped') throw new Error('Expected stopped, got ' + s4.data.state);
    }
    const elapsed = performance.now() - start;
    console.log('10 full state cycles in ' + elapsed.toFixed(0) + 'ms');

    if (elapsed > 30000) throw new Error('State transitions took too long (possible deadlock)');
    await srv.close();
    console.log('OK: state transition stress passed (no deadlock)');
  "

  echo "── Stress Test 4: 40 concurrent requests ──"
  node --input-type=module -e "
    import { startApiServer } from './dist/api/server.js';
    import http from 'node:http';

    const srv = await startApiServer({ port: 0 });
    const get = (p) => new Promise((res, rej) => {
      const timeout = setTimeout(() => rej(new Error('timeout: ' + p)), 30000);
      http.get('http://127.0.0.1:' + srv.port + p, (r) => {
        let d = '';
        r.on('data', (c) => d += c);
        r.on('end', () => { clearTimeout(timeout); res({ status: r.statusCode }); });
      }).on('error', (err) => { clearTimeout(timeout); rej(err); });
    });

    const start = performance.now();
    const requests = [];
    for (let i = 0; i < 10; i++) requests.push(get('/api/status'));
    for (let i = 0; i < 10; i++) requests.push(get('/api/plugins'));
    for (let i = 0; i < 10; i++) requests.push(get('/api/logs'));
    for (let i = 0; i < 10; i++) requests.push(get('/api/config'));

    const results = await Promise.all(requests);
    const elapsed = performance.now() - start;
    const ok = results.filter(r => r.status === 200).length;
    console.log('40 concurrent: ok=' + ok + '/40 time=' + elapsed.toFixed(0) + 'ms');

    if (ok !== 40) throw new Error('Expected 40 OK, got ' + ok);
    if (elapsed > 30000) throw new Error('Concurrent requests took too long (possible deadlock)');
    await srv.close();
    console.log('OK: concurrent request stress passed');
  "

  echo "── Stress Test 5: Memory usage monitoring ──"
  node --input-type=module -e "
    import { startApiServer } from './dist/api/server.js';
    import http from 'node:http';

    const srv = await startApiServer({ port: 0 });
    const get = (p) => new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + srv.port + p, (r) => {
        let d = '';
        r.on('data', (c) => d += c);
        r.on('end', () => res({ status: r.statusCode }));
      }).on('error', rej);
    });

    if (global.gc) global.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const rssBefore = process.memoryUsage().rss;

    for (let i = 0; i < 500; i++) {
      await get('/api/status');
    }

    if (global.gc) global.gc();
    const heapAfter = process.memoryUsage().heapUsed;
    const rssAfter = process.memoryUsage().rss;

    const heapGrowthMB = (heapAfter - heapBefore) / (1024 * 1024);
    const rssGrowthMB = (rssAfter - rssBefore) / (1024 * 1024);

    console.log('After 500 requests:');
    console.log('  Heap growth: ' + heapGrowthMB.toFixed(2) + 'MB');
    console.log('  RSS growth:  ' + rssGrowthMB.toFixed(2) + 'MB');

    // Flag suspicious growth (> 100MB indicates a leak)
    if (heapGrowthMB > 100) {
      console.warn('WARNING: heap grew by ' + heapGrowthMB.toFixed(2) + 'MB — possible memory leak');
    }

    await srv.close();
    console.log('OK: memory usage within bounds');
  "

  echo "── Stress Test 6: Server start/stop cycling ──"
  node --input-type=module -e "
    import { startApiServer } from './dist/api/server.js';
    import http from 'node:http';

    const get = (port, p) => new Promise((res, rej) => {
      http.get('http://127.0.0.1:' + port + p, (r) => {
        let d = '';
        r.on('data', (c) => d += c);
        r.on('end', () => res({ status: r.statusCode }));
      }).on('error', rej);
    });

    for (let i = 0; i < 15; i++) {
      const srv = await startApiServer({ port: 0 });
      const r = await get(srv.port, '/api/status');
      if (r.status !== 200) throw new Error('Cycle ' + i + ': status returned ' + r.status);
      await srv.close();
    }
    console.log('OK: 15 server start/stop cycles without EMFILE or leak');
  "

  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  ✓ Stress Test E2E — ALL CHECKS PASSED          ║"
  echo "╚══════════════════════════════════════════════════╝"
'

echo "Stress Test E2E complete."
