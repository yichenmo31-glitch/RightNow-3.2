# RightNow native deployment templates

These templates target OpenCloudOS 9 and are intentionally not an unattended
installer. The host already runs Personal OpenClaw at `/`, so deployment must
merge the Nginx location snippet into the existing public `server` block and
must not replace the existing OpenClaw user service or configuration.

## Host layout

| Purpose | Path / service |
| --- | --- |
| Release checkout | `/opt/rightnow/current` |
| Frontend output | `/var/www/rightnow` |
| Secrets | `/etc/rightnow/*.env` (`root:root`, mode `0600`) |
| RAG virtualenv | `/opt/rightnow/venv-rag` |
| RAG persistence | `/var/lib/rightnow/rag` |
| Backend runtime/uploads | `/var/lib/rightnow/backend` |
| Backend | `rightnow-backend.service`, user `rightnow` |
| RAG | `rightnow-rag.service`, user `rightnow` |
| Provisioner | `rightnow-provisioner.service`, user `root` |
| OpenClaw | preserve existing root user unit and port `127.0.0.1:18789` |

The Provisioner is the only new root process because the existing Gateway
configuration and RightNow workspaces live below `/root/.openclaw`. Its unit
limits writable paths to that directory. It must never access or alter
`/root/.openclaw/workspace`; its implementation only accepts `rightnow-*`
agent IDs and derives `workspace-rightnow-*` paths server-side.

## Public paths

- `/`: unchanged Personal OpenClaw route.
- `/rightnow/`: RightNow SPA.
- `/rightnow-api/`: rewritten to Backend `/api/` on `127.0.0.1:5000`.
- `/rightnow-uploads/`: rewritten to Backend `/uploads/` when uploaded media is needed.

Build the frontend with its public base and API prefix:

```bash
cd /opt/rightnow/current
VITE_API_BASE_URL=/rightnow-api npm --workspace frontend exec vite build -- --base=/rightnow/
rsync -a --delete frontend/dist/ /var/www/rightnow/
```

The Backend currently returns upload URLs beginning with `/uploads/`. The
isolated `/rightnow-uploads/` proxy is prepared here, but those returned URLs
must become prefix-aware before uploads work without taking over Personal
OpenClaw's `/uploads/` namespace. Do not add a public root `/uploads/` location
without checking the Personal application first.

Install units and merge Nginx configuration only after reviewing paths:

```bash
install -o root -g root -m 0644 systemd/*.service /etc/systemd/system/
install -d -o root -g root -m 0755 /etc/rightnow
install -o root -g root -m 0600 env/*.example /etc/rightnow/
# Replace placeholders in /etc/rightnow/*.example, then rename each to *.env.
# Add: include /opt/rightnow/current/infra/native-deploy/nginx/rightnow.locations.conf;
# inside the existing public Nginx server block.
systemctl daemon-reload
nginx -t
```

Do not copy the example environment files into active use unchanged. Generate
independent secrets, keep PostgreSQL 15 and `rightnow_fitness` intact until a
verified dump/restore into PostgreSQL 16 succeeds, and apply Prisma migrations
instead of `prisma db push` in production.

Run `pwsh tests/validate-templates.ps1` in the repository for static checks.
On the server, run `sudo bash tests/validate-host.sh` after starting services.
