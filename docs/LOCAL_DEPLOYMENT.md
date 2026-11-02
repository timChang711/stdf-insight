# Local deployment guide

This guide covers development, local production, Docker, LAN access, reverse proxy, upgrades, and troubleshooting.

## 1. Requirements

| Item | Minimum |
|---|---|
| Node.js | 22.13.0 or newer Node 22 LTS |
| npm | Version bundled with the selected Node 22 release |
| Memory | 4 GB free for small pilots; qualify larger files on target hardware |
| Browser | Current Chrome, Edge, Firefox, or Safari |
| Git | Required only when cloning or updating from GitHub |
| Docker | Optional; Docker Desktop or Docker Engine with Compose v2 |

Verify the environment:

```text
node --version
npm --version
git --version
```

## 2. Windows installation

Open PowerShell:

```powershell
git clone https://github.com/timChang711/stdf-insight.git
cd stdf-insight
npm ci
npm run dev:local
```

Open `http://localhost:5173`.

Stop the server with `Ctrl+C`.

### Windows build preview

```powershell
npm ci
npm run build:local
npm run start:local
```

Open `http://localhost:3000`.

The `:local` scripts are intentionally cross-platform. The unqualified `npm run build` script belongs to the ChatGPT Sites build lifecycle and expects Linux shell utilities.

## 3. macOS or Linux installation

```bash
git clone https://github.com/timChang711/stdf-insight.git
cd stdf-insight
npm ci
npm run dev:local
```

For production mode:

```bash
npm run build:local
npm run start:local
```

## 4. Change the production port

Direct command:

```bash
npx vinext start --hostname 0.0.0.0 --port 8080
```

PowerShell environment variable:

```powershell
$env:PORT = "8080"
npx vinext start --hostname 0.0.0.0
```

Linux or macOS:

```bash
PORT=8080 npx vinext start --hostname 0.0.0.0
```

## 5. Docker deployment

### Docker Compose

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f
```

Open `http://localhost:3000`.

Stop and remove the container:

```bash
docker compose down
```

### Docker without Compose

```bash
npm run docker:build
npm run docker:run
```

The Docker image does not contain STDF files. Users select files from their own workstation after the application opens.

## 6. Access from another computer on the LAN

1. Start production mode or Docker on the server computer.
2. Find its LAN IP address, for example `192.168.1.50`.
3. Permit inbound TCP port 3000 in the host firewall.
4. From another computer, open `http://192.168.1.50:3000`.

Use LAN HTTP only for controlled testing. Customer deployment should terminate HTTPS at a trusted reverse proxy.

## 7. Nginx reverse-proxy example

```nginx
server {
    listen 443 ssl http2;
    server_name stdf.example.com;

    ssl_certificate     /etc/ssl/certs/stdf.example.com.crt;
    ssl_certificate_key /etc/ssl/private/stdf.example.com.key;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

The small `client_max_body_size` is intentional: STDF is selected and parsed in the browser, not posted to this server.

Add authentication at the reverse proxy or identity-aware gateway before exposing a commercial instance.

## 8. Upgrade procedure

```bash
git pull --ff-only
npm ci
npm run check:local
npm run start:local
```

For Docker:

```bash
git pull --ff-only
docker compose build --no-cache
docker compose up -d
```

Read `CHANGELOG.md` before upgrading. Keep the previous image or Git tag until the new version passes customer acceptance tests.

## 9. No database backup is currently required

Version 0.1.0 does not persist users, projects, parsed data, or uploaded files. Closing the page clears the session. If persistent projects are added later, define database and object-storage backup procedures before release.

## 10. Troubleshooting

### `npm ci` fails

- Confirm Node is version 22.13.0 or later.
- Remove a partially created `node_modules` directory, then run `npm ci` again.
- Confirm the network can reach the npm registry.
- Do not regenerate `package-lock.json` unless dependency changes are intentional.

### Port already in use

Run on a different port:

```bash
npx vinext start --hostname 0.0.0.0 --port 3001
```

### `.stdf.gz` does not open

- Use a current browser with `DecompressionStream` support.
- Decompress the file and upload `.stdf` directly.
- Confirm the uncompressed file begins with a valid STDF FAR record.

### File opens but no tests appear

The current parser requires common PRR and PTR measurement data. Review [STDF support](STDF_SUPPORT.md). MPR-, FTR-, or vendor-specific-only files require parser expansion.

### Browser becomes slow

- Close other large tabs.
- Start with one file and a smaller pilot lot.
- Use a workstation with more memory.
- Do not promise a supported maximum file size until qualification is complete on target customer hardware.

