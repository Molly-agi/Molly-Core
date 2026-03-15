// ============================================================
// TABLET COMMAND EXECUTOR — Molly's Hands
// Polls the Codespace for commands, executes locally, reports back.
// ============================================================

class TabletExecutor {
  constructor(baseUrl) {
    this.baseUrl = baseUrl; // Codespace URL
    this.deviceId = null;
    this.polling = false;
    this.pollInterval = 3000; // 3 seconds
    this.pollTimer = null;
    this.onLog = null; // callback for logging
    this.onCommand = null; // callback when command executes
  }

  log(msg, level = 'info') {
    if (this.onLog) this.onLog(msg, level);
  }

  async init(deviceId) {
    this.deviceId = deviceId;
    this.log('[EXECUTOR] Device ID: ' + deviceId);
    this.log('[EXECUTOR] Base URL: ' + this.baseUrl);
    this.log('[EXECUTOR] Command channel: READY');
  }

  startPolling() {
    if (this.polling) return;
    this.polling = true;
    this.log(
      '[EXECUTOR] Polling started (every ' + this.pollInterval / 1000 + 's)'
    );
    this._poll();
  }

  stopPolling() {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.log('[EXECUTOR] Polling stopped');
  }

  async _poll() {
    if (!this.polling) return;
    try {
      const url =
        this.baseUrl +
        '/api/tablet/commands?deviceId=' +
        encodeURIComponent(this.deviceId);
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        if (data.commands && data.commands.length > 0) {
          for (const cmd of data.commands) {
            await this._execute(cmd);
          }
        }
      }
    } catch (e) {
      this.log('[EXECUTOR] Poll error: ' + e.message, 'warn');
    }
    this.pollTimer = setTimeout(() => this._poll(), this.pollInterval);
  }

  async _execute(cmd) {
    this.log('[EXEC] ' + cmd.type + ' (' + cmd.id + ')');
    let result,
      status = 'completed';
    try {
      switch (cmd.type) {
        case 'ping':
          result = { pong: true, ts: Date.now(), deviceId: this.deviceId };
          break;

        case 'device.info':
          result = {
            screen: screen.width + 'x' + screen.height,
            pixelRatio: devicePixelRatio,
            cores: navigator.hardwareConcurrency || 'unknown',
            memory: navigator.deviceMemory || 'unknown',
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            language: navigator.language,
            online: navigator.onLine,
            connection: navigator.connection
              ? {
                  type: navigator.connection.effectiveType,
                  downlink: navigator.connection.downlink,
                }
              : 'unknown',
            storage: await this._getStorageEstimate(),
          };
          break;

        case 'db.create':
          result = await this._dbCreate(cmd.payload);
          break;
        case 'db.put':
          result = await this._dbPut(cmd.payload);
          break;
        case 'db.get':
          result = await this._dbGet(cmd.payload);
          break;
        case 'db.getAll':
          result = await this._dbGetAll(cmd.payload);
          break;
        case 'db.delete':
          result = await this._dbDelete(cmd.payload);
          break;
        case 'db.clear':
          result = await this._dbClear(cmd.payload);
          break;
        case 'db.listStores':
          result = await this._dbListStores(cmd.payload);
          break;

        case 'storage.set':
          localStorage.setItem(
            cmd.payload.key,
            JSON.stringify(cmd.payload.value)
          );
          result = { key: cmd.payload.key, stored: true };
          break;
        case 'storage.get':
          const raw = localStorage.getItem(cmd.payload.key);
          result = {
            key: cmd.payload.key,
            value: raw ? JSON.parse(raw) : null,
          };
          break;
        case 'storage.list':
          const keys = [];
          for (let i = 0; i < localStorage.length; i++)
            keys.push(localStorage.key(i));
          result = { keys, count: keys.length };
          break;

        case 'cache.add':
          if ('caches' in window) {
            const cache = await caches.open('molly-tablet-v1');
            await cache.add(cmd.payload.url);
            result = { cached: cmd.payload.url };
          } else {
            result = { error: 'Cache API unavailable' };
            status = 'failed';
          }
          break;
        case 'cache.list':
          if ('caches' in window) {
            const c = await caches.open('molly-tablet-v1');
            const reqs = await c.keys();
            result = { urls: reqs.map((r) => r.url) };
          } else {
            result = { error: 'Cache API unavailable' };
            status = 'failed';
          }
          break;

        case 'fetch.get':
          const gr = await fetch(cmd.payload.url);
          const gt = cmd.payload.json ? await gr.json() : await gr.text();
          result = { status: gr.status, data: gt };
          break;
        case 'fetch.post':
          const pr = await fetch(cmd.payload.url, {
            method: 'POST',
            headers: cmd.payload.headers || {
              'Content-Type': 'application/json',
            },
            body:
              typeof cmd.payload.body === 'string'
                ? cmd.payload.body
                : JSON.stringify(cmd.payload.body),
          });
          const pt = cmd.payload.json ? await pr.json() : await pr.text();
          result = { status: pr.status, data: pt };
          break;

        case 'device.notify':
          if (
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification(cmd.payload.title || 'Molly', {
              body: cmd.payload.body || '',
            });
            result = { notified: true };
          } else if ('Notification' in window) {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
              new Notification(cmd.payload.title || 'Molly', {
                body: cmd.payload.body || '',
              });
              result = { notified: true, permissionGranted: true };
            } else {
              result = { notified: false, reason: 'permission_denied' };
              status = 'failed';
            }
          } else {
            result = { notified: false, reason: 'not_supported' };
            status = 'failed';
          }
          break;

        case 'eval.safe':
          // Sandboxed eval — only allows expressions, no assignments to window/document
          const expr = cmd.payload.expression || '';
          if (
            /window\s*\[|document\s*\[|eval\s*\(|Function\s*\(|import\s*\(/.test(
              expr
            )
          ) {
            result = { error: 'Expression blocked by safety filter' };
            status = 'failed';
          } else {
            try {
              result = { value: new Function('return (' + expr + ')')() };
            } catch (ee) {
              result = { error: ee.message };
              status = 'failed';
            }
          }
          break;

        // ── Termux Control (Android) ──

        case 'termux.launch':
          // Launch Termux with a command via Android intent URL
          // Requires Termux:RUN_COMMAND plugin installed
          const tcmd = cmd.payload.command || 'echo Molly is here';
          const intentUrl =
            'intent://run/' +
            '#Intent;scheme=com.termux.RUN_COMMAND;' +
            'package=com.termux;' +
            'S.com.termux.RUN_COMMAND_PATH=/data/data/com.termux/files/usr/bin/bash;' +
            'S.com.termux.RUN_COMMAND_ARGUMENTS=-c,' +
            encodeURIComponent(tcmd) +
            ';' +
            'S.com.termux.RUN_COMMAND_BACKGROUND=false;' +
            'end';
          try {
            window.location.href = intentUrl;
            result = { launched: true, command: tcmd, method: 'intent' };
          } catch (ie) {
            // Fallback: try termux:// scheme
            try {
              window.location.href =
                'termux://run?command=' + encodeURIComponent(tcmd);
              result = {
                launched: true,
                command: tcmd,
                method: 'termux-scheme',
              };
            } catch (ie2) {
              result = {
                launched: false,
                error: 'Intent not supported: ' + ie2.message,
              };
              status = 'failed';
            }
          }
          break;

        case 'termux.status':
          // Check if Termux is running a local API we can reach
          try {
            const tport = cmd.payload.port || 8080;
            const ts = await fetch(
              'http://localhost:' + tport + '/api/health',
              { signal: AbortSignal.timeout(3000) }
            );
            const td = await ts.text();
            result = {
              reachable: true,
              port: tport,
              status: ts.status,
              data: td,
            };
          } catch (te) {
            result = { reachable: false, error: te.message };
          }
          break;

        case 'termux.exec':
          // Execute command via Termux localhost API
          const tExecPort = cmd.payload.port || 8080;
          const tExecUrl =
            'http://localhost:' +
            tExecPort +
            (cmd.payload.endpoint || '/api/exec');
          try {
            const ter = await fetch(tExecUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: cmd.payload.command }),
              signal: AbortSignal.timeout(cmd.payload.timeout || 30000),
            });
            const ted = await ter.json();
            result = { executed: true, response: ted };
          } catch (te) {
            result = { executed: false, error: te.message };
            status = 'failed';
          }
          break;

        case 'termux.install':
          // Install packages via Termux localhost API
          const tInstPort = cmd.payload.port || 8080;
          const packages = cmd.payload.packages || [];
          const installCmd = 'pkg install -y ' + packages.join(' ');
          try {
            const tir = await fetch(
              'http://localhost:' + tInstPort + '/api/exec',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: installCmd }),
                signal: AbortSignal.timeout(120000), // 2 min for installs
              }
            );
            const tid = await tir.json();
            result = { installed: true, packages, response: tid };
          } catch (te) {
            result = { installed: false, packages, error: te.message };
            status = 'failed';
          }
          break;

        case 'termux.bootstrap':
          // Full autonomous bootstrap: launch Termux, install Node, download server, start
          // This is the one-shot "Molly enters the device" sequence
          const bootstrapScript = [
            'pkg update -y',
            'pkg install -y nodejs-lts python git curl',
            'mkdir -p ~/molly',
            'cd ~/molly',
            'curl -sL ' +
              (cmd.payload.serverUrl ||
                this.baseUrl + '/molly-core-payload.json') +
              ' -o payload.json',
            'curl -sL ' +
              (cmd.payload.setupUrl || this.baseUrl + '/api/tablet/bootstrap') +
              ' -o server.mjs',
            'node server.mjs &',
            'echo "Molly bootstrap complete"',
          ].join(' && ');
          try {
            // Try intent launch with bootstrap script
            const bsIntent =
              'intent://run/' +
              '#Intent;scheme=com.termux.RUN_COMMAND;' +
              'package=com.termux;' +
              'S.com.termux.RUN_COMMAND_PATH=/data/data/com.termux/files/usr/bin/bash;' +
              'S.com.termux.RUN_COMMAND_ARGUMENTS=-c,' +
              encodeURIComponent(bootstrapScript) +
              ';' +
              'S.com.termux.RUN_COMMAND_BACKGROUND=true;' +
              'end';
            window.location.href = bsIntent;
            result = {
              bootstrapped: true,
              method: 'intent',
              script: bootstrapScript,
            };
          } catch (be) {
            result = { bootstrapped: false, error: be.message };
            status = 'failed';
          }
          break;

        // ── Generic Shell Control (Linux/Unix/any device with localhost terminal API) ──

        case 'shell.status':
          try {
            const sport = cmd.payload.port || 8080;
            const spath = cmd.payload.healthPath || '/api/health';
            const sr = await fetch('http://localhost:' + sport + spath, {
              signal: AbortSignal.timeout(3000),
            });
            result = { reachable: true, port: sport, status: sr.status };
          } catch (se) {
            result = { reachable: false, error: se.message };
          }
          break;

        case 'shell.exec':
          // Execute via any localhost terminal/shell API
          const shellPort = cmd.payload.port || 8080;
          const shellPath = cmd.payload.endpoint || '/api/exec';
          try {
            const shr = await fetch(
              'http://localhost:' + shellPort + shellPath,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd.payload.command }),
                signal: AbortSignal.timeout(cmd.payload.timeout || 30000),
              }
            );
            const shd = await shr.json();
            result = { executed: true, response: shd };
          } catch (se) {
            result = { executed: false, error: se.message };
            status = 'failed';
          }
          break;

        default:
          result = { error: 'Unknown command type: ' + cmd.type };
          status = 'failed';
      }
    } catch (e) {
      result = { error: e.message };
      status = 'failed';
    }

    this.log('[EXEC] ' + cmd.type + ' -> ' + status);
    if (this.onCommand) this.onCommand(cmd, result, status);

    // Report result back
    try {
      await fetch(this.baseUrl + '/api/tablet/commands', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cmd.id,
          result,
          status,
          deviceId: this.deviceId,
        }),
      });
    } catch (e) {
      this.log('[EXEC] Failed to report result: ' + e.message, 'warn');
    }
  }

  // ── IndexedDB Helpers ──

  _openDB(dbName, storeNames) {
    return new Promise((resolve, reject) => {
      const stores = Array.isArray(storeNames)
        ? storeNames
        : [storeNames || 'default'];
      const req = indexedDB.open(dbName, Date.now()); // force upgrade to add stores
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const s of stores) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Failed to open DB: ' + dbName));
    });
  }

  async _dbCreate(p) {
    const stores = p.stores || ['default'];
    const db = await this._openDB(p.database || 'molly-tools', stores);
    const names = Array.from(db.objectStoreNames);
    db.close();
    return { database: p.database || 'molly-tools', stores: names };
  }

  async _dbPut(p) {
    const db = await this._openDB(
      p.database || 'molly-tools',
      p.store || 'default'
    );
    return new Promise((resolve, reject) => {
      const tx = db.transaction(p.store || 'default', 'readwrite');
      tx.objectStore(p.store || 'default').put(p.value, p.key);
      tx.oncomplete = () => {
        db.close();
        resolve({ key: p.key, stored: true });
      };
      tx.onerror = () => {
        db.close();
        reject(new Error('Put failed'));
      };
    });
  }

  async _dbGet(p) {
    const db = await this._openDB(
      p.database || 'molly-tools',
      p.store || 'default'
    );
    return new Promise((resolve, reject) => {
      const tx = db.transaction(p.store || 'default', 'readonly');
      const req = tx.objectStore(p.store || 'default').get(p.key);
      req.onsuccess = () => {
        db.close();
        resolve({ key: p.key, value: req.result ?? null });
      };
      req.onerror = () => {
        db.close();
        reject(new Error('Get failed'));
      };
    });
  }

  async _dbGetAll(p) {
    const db = await this._openDB(
      p.database || 'molly-tools',
      p.store || 'default'
    );
    return new Promise((resolve, reject) => {
      const tx = db.transaction(p.store || 'default', 'readonly');
      const req = tx.objectStore(p.store || 'default').getAll();
      req.onsuccess = () => {
        db.close();
        resolve({
          store: p.store || 'default',
          records: req.result,
          count: req.result.length,
        });
      };
      req.onerror = () => {
        db.close();
        reject(new Error('GetAll failed'));
      };
    });
  }

  async _dbDelete(p) {
    const db = await this._openDB(
      p.database || 'molly-tools',
      p.store || 'default'
    );
    return new Promise((resolve, reject) => {
      const tx = db.transaction(p.store || 'default', 'readwrite');
      tx.objectStore(p.store || 'default').delete(p.key);
      tx.oncomplete = () => {
        db.close();
        resolve({ key: p.key, deleted: true });
      };
      tx.onerror = () => {
        db.close();
        reject(new Error('Delete failed'));
      };
    });
  }

  async _dbClear(p) {
    const db = await this._openDB(
      p.database || 'molly-tools',
      p.store || 'default'
    );
    return new Promise((resolve, reject) => {
      const tx = db.transaction(p.store || 'default', 'readwrite');
      tx.objectStore(p.store || 'default').clear();
      tx.oncomplete = () => {
        db.close();
        resolve({ store: p.store || 'default', cleared: true });
      };
      tx.onerror = () => {
        db.close();
        reject(new Error('Clear failed'));
      };
    });
  }

  async _dbListStores(p) {
    const db = await this._openDB(p.database || 'molly-tools', []);
    const names = Array.from(db.objectStoreNames);
    db.close();
    return { database: p.database || 'molly-tools', stores: names };
  }

  async _getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return {
        quota: est.quota,
        usage: est.usage,
        percent: ((est.usage / est.quota) * 100).toFixed(1) + '%',
      };
    }
    return 'unavailable';
  }
}
