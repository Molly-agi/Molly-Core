# Family Bridge — Production Deployment Guide

## Pre-Deployment Checklist

- [ ] Node.js 18+ installed
- [ ] BRIDGE_KEY generated (≥32 chars, hex or base64)
- [ ] Port 9099 available (or configured)
- [ ] 1GB+ free disk space
- [ ] Network access configured (firewall rules)
- [ ] TLS/SSL certificate ready (if using reverse proxy)
- [ ] Monitoring/alerting configured

---

## Deployment Options

### Option 1: Standalone Node.js (Development/Testing)

```bash
# Clone/extract repository
git clone https://github.com/Molly-agi/Molly-Core.git
cd stuff/family-bridge-production-app

# Install dependencies
npm install

# Set configuration
export BRIDGE_PORT=9099
export BRIDGE_KEY="$(openssl rand -hex 32)"

# Start bridge
npm start
```

### Option 2: Docker Container (Recommended for Production)

```bash
# Build image
docker build -t family-bridge:latest .

# Run container
docker run -d \
  --name family-bridge \
  -p 9099:9099 \
  -e BRIDGE_KEY="$(openssl rand -hex 32)" \
  -v bridge-data:/app/data \
  family-bridge:latest

# Check status
docker logs family-bridge
curl http://localhost:9099/health
```

### Option 3: Docker Compose (Complete Stack)

```bash
# Set environment
export BRIDGE_KEY="$(openssl rand -hex 32)"

# Start stack (bridge + nginx + volumes)
docker-compose up -d

# Verify
docker-compose ps
curl http://localhost:9099/health
```

### Option 4: Systemd Service (Production Server)

```bash
# Copy application to /opt/family-bridge
sudo cp -r . /opt/family-bridge
sudo chown -R bridge:bridge /opt/family-bridge

# Copy systemd service file
sudo cp config/family-bridge.service /etc/systemd/system/

# Create environment file
sudo mkdir -p /etc/family-bridge
sudo cat > /etc/family-bridge/.env << EOF
BRIDGE_PORT=9099
BRIDGE_KEY=$(openssl rand -hex 32)
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable family-bridge
sudo systemctl start family-bridge

# Check status
sudo systemctl status family-bridge
journalctl -u family-bridge -f
```

---

## Reverse Proxy Setup (Nginx + TLS)

### Production Configuration

```nginx
upstream family_bridge {
  server localhost:9099;
  keepalive 32;
}

server {
  listen 80;
  server_name bridge.yourdomain.com;
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name bridge.yourdomain.com;

  # SSL certificates (use certbot for Let's Encrypt)
  ssl_certificate /etc/letsencrypt/live/bridge.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/bridge.yourdomain.com/privkey.pem;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;

  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
  limit_req zone=api_limit burst=20 nodelay;

  # Proxy settings
  location / {
    proxy_pass http://family_bridge;
    proxy_http_version 1.1;

    # WebSocket upgrade
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
  }

  # Health check endpoint
  location /health {
    proxy_pass http://family_bridge/health;
    access_log off;
  }
}
```

---

## Database Backup Strategy

### Automated Daily Backup

```bash
#!/bin/bash
# /usr/local/bin/backup-bridge.sh

BACKUP_DIR="/backups/family-bridge"
DATA_DIR="/opt/family-bridge/data"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup data directory
tar -czf "$BACKUP_DIR/bridge-data-${DATE}.tar.gz" \
  --exclude='*.log' \
  "$DATA_DIR"

# Keep last 30 days
find "$BACKUP_DIR" -name "bridge-data-*.tar.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/bridge-data-${DATE}.tar.gz"
```

### Cron Job

```bash
# Run daily at 2 AM
0 2 * * * /usr/local/bin/backup-bridge.sh > /var/log/bridge-backup.log 2>&1
```

### Restore from Backup

```bash
# Stop service
sudo systemctl stop family-bridge

# Restore backup
cd /opt/family-bridge
sudo tar -xzf /backups/family-bridge/bridge-data-YYYYMMDD_HHMMSS.tar.gz

# Start service
sudo systemctl start family-bridge
```

---

## Monitoring & Alerting

### Health Check Script

```bash
#!/bin/bash
BRIDGE_URL="http://localhost:9099"

# Check if bridge is responding
if ! curl -s "$BRIDGE_URL/health" | grep -q '"status"'; then
  echo "CRITICAL: Bridge health check failed"
  exit 2
fi

# Check message count (alert if >10k messages)
MSGS=$(curl -s "$BRIDGE_URL/messages" | jq '.totalMessages')
if [ "$MSGS" -gt 10000 ]; then
  echo "WARNING: Bridge has $MSGS messages (cleanup recommended)"
  exit 1
fi

echo "OK: Bridge is healthy with $MSGS messages"
exit 0
```

### Prometheus Metrics Export

```javascript
// Add to bridge-daemon.mjs:
const promMetrics = {
  bridge_uptime_seconds: () => process.uptime(),
  bridge_messages_total: () => messages.length,
  bridge_clients_connected: () => clients.size,
  bridge_heap_used_bytes: () => process.memoryUsage().heapUsed,
};

// Endpoint: GET /metrics
app.get('/metrics', (req, res) => {
  let output = '';
  for (const [name, fn] of Object.entries(promMetrics)) {
    output += `# HELP ${name}\n`;
    output += `${name} ${fn()}\n`;
  }
  res.set('Content-Type', 'text/plain');
  res.send(output);
});
```

### Monitoring via Ntfy.sh

```bash
# Send alert when bridge crashes
systemctl status family-bridge || \
  curl -X POST https://ntfy.sh/molly-alerts \
    -H "Title: Bridge Down" \
    -d "Family Bridge daemon is not running"
```

---

## Scaling Considerations

### Single Instance Limitations

- Single process, cannot use multi-core
- Max ~1000 concurrent WebSocket connections
- Suitable for: Dev, staging, single-region production (< 100 active agents)

### Horizontal Scaling Pattern

For multiple instances:

1. **Shared Filesystem Backend**
   - Replace file-based conversation.json with PostgreSQL or Redis
   - Or use network-mounted NFS for shared data

2. **Message Queue Integration**
   - Add Redis pub/sub layer for cross-instance broadcast
   - Bridge daemons subscribe to same queue

3. **Load Balancer**
   - Round-robin or sticky session (for WebSocket)
   - Health checks to /health endpoint

### Redis-Backed Bridge (Future)

```javascript
// Pseudo-code for multi-instance setup
const redis = new Redis('redis://redis-cluster:6379');

// Publish on all instances
broadcast(msg) {
  redis.publish('bridge:messages', JSON.stringify(msg));
}

// Subscribe to cross-instance messages
redis.subscribe('bridge:messages', (msg) => {
  handleMessage(JSON.parse(msg));
});
```

---

## Performance Tuning

### Memory Optimization

```bash
# Node.js heap size
NODE_OPTIONS="--max_old_space_size=1024" npm start
```

### Connection Pooling

The bridge maintains persistent connections. For many clients:

```bash
# Increase file descriptors
ulimit -n 65536

# Adjust TCP settings
sysctl -w net.core.somaxconn=65536
sysctl -w net.ipv4.tcp_max_syn_backlog=65536
```

### Message Pruning

Auto-delete messages older than 30 days:

```bash
# Add to cron job
curl -X POST http://localhost:9099/api/bridge/admin/prune?older_than_days=30
```

---

## Troubleshooting

### Bridge Won't Start

**Error:** "BRIDGE_KEY environment variable not set"

```bash
export BRIDGE_KEY="$(openssl rand -hex 32)"
npm start
```

### Port Already in Use

**Error:** "listen EADDRINUSE :::9099"

```bash
# Find process using port
lsof -i :9099

# Kill it
kill -9 <PID>

# Or use different port
BRIDGE_PORT=9100 npm start
```

### Messages Not Persisting

**Check:**
1. Disk space: `df -h`
2. Directory writable: `touch data/test.txt`
3. Permissions: `ls -la data/`
4. Check logs: `tail -50 data/.bridge-daemon.log`

### WebSocket Connections Dropping

**Causes:** Nginx timeout, proxy buffering, mobile tab switch

**Solution:**
1. Increase proxy timeouts (60s+)
2. Disable buffering: `X-Accel-Buffering: no`
3. Enable keepalive: SSE pulse every 3s

---

## Security Hardening

### Firewall Rules

```bash
# Allow only from specific IPs
ufw allow from 10.0.0.0/8 to any port 9099
ufw allow from 203.0.113.0/24 to any port 9099
```

### Rate Limiting

```nginx
limit_req_zone $binary_remote_addr zone=bridge_limit:10m rate=100r/s;
location /api/bridge {
  limit_req zone=bridge_limit burst=500 nodelay;
  proxy_pass http://localhost:9099;
}
```

### TLS/SSL Best Practices

```bash
# Generate strong certificate
certbot certonly --standalone -d bridge.yourdomain.com

# Use strong ciphers
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:...';
ssl_protocols TLSv1.2 TLSv1.3;
```

---

## Disaster Recovery

### Data Loss Scenario

1. Restore from most recent backup
2. Message loss since last backup (ephemeral)
3. Checkpoint recovery (see docs/ARCHITECTURE.md)

### Service Failover

```bash
# If primary bridge dies:
# 1. Start secondary bridge on standby server
# 2. Point clients to new bridge IP/DNS
# 3. Restore last backup

# For high availability:
# Use load balancer + 2+ bridge instances
# Shared NFS backend for conversation.json
```

---

## Contact & Support

- **Repository:** https://github.com/Molly-agi/Molly-Core
- **Issues:** Report on GitHub
- **Security:** See SECURITY.md in parent repo
