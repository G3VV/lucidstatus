<p align="center">
  <h1 align="center">LucidStatus</h1>
  <p align="center">A self-hosted Hetrixtools alternative</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10+-blue?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/flask-3.0-lightgrey?logo=flask" alt="Flask">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## Screenshots

> The main page, showing all your servers and a preview of their usage, with uptime.

![Status Page](http://pussycl.art/JzfufGnJ)

### Server Detail
> The advanced view, shown when clicking onto a server on the main page.

![Server Detail](http://pussycl.art/0JihW6Fv)

### Admin Panel — Servers
> Admin panel, allowing you to set categories and add servers, alongside giving you a bash command to track statistics.

![Admin Panel](http://pussycl.art/xCDJyZ2V.gif)

### Admin Panel — Theme Editor
> The status page is fully customisable, with every single little thing having a colour that you can change.

![Theme Editor](http://pussycl.art/RrGskVTK)

---

## Features

- **Real-time monitoring** — CPU, RAM, Swap, Disk, Network IN/OUT with live-updating bars
- **90-day uptime dots** — Visual uptime history, PER server
- **Admin panel** — Easily accessible interface to add, edit and remove servers
- **Theme editor** — A bunch of colours to customize your status page
- **Bash monitoring agent** — One-command install via auto-generated bash script with systemd service

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/G3VV/lucidstatus.git
cd lucidstatus
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

Create a `.env` file in the project root:

```env
# Server port
PORT=5000

# Enable debug mode (true/false)
DEBUG=false

# Secret key (leave empty to auto-generate)
SECRET_KEY=
```

### 4. Run the app

```bash
python app.py
```

The status page will be available at `http://localhost:5000`.

---

## Admin Panel

Navigate to `/admin` to access the admin panel.

**Default password:** `admin` (change this in settings).

The admin panel has four tabs:

| Tab | Description |
|-----|-------------|
| **Servers** | Add, edit, delete servers. Copy the auto-generated install script for each server. |
| **Categories** | Create and reorder categories to group your servers. |
| **Settings** | Change site name, upload a logo, update admin password. |
| **Theme** | Customize every color on the status page with live color pickers. |

---

## Installing the Monitoring Agent

LucidStatus uses a lightweight bash agent that runs as a systemd service on each monitored server.

### From the Admin Panel

1. Go to `/admin` → **Servers** tab
2. Click **+ Add Server**, give it a name and category
3. Click the **Script** button next to the server
4. Copy the install command and run it on the target server:

```bash
curl -sS 'https://your-domain.com/agent/SERVER_API_KEY' | sudo bash
```

### What the agent does

- Installs as a systemd service called `lucidstatus`
- Collects CPU, IOWait, Steal, RAM, Swap, Buffered, Cached, Disk, and Network stats every **30 seconds**
- Reports metrics to your LucidStatus instance via a simple HTTP POST
- Auto-starts on boot, auto-restarts on failure

### Agent management commands

```bash
# Check status
sudo systemctl status lucidstatus

# View logs
sudo journalctl -u lucidstatus -f

# Restart the agent
sudo systemctl restart lucidstatus

# Stop the agent
sudo systemctl stop lucidstatus

# Uninstall
sudo systemctl stop lucidstatus
sudo systemctl disable lucidstatus
sudo rm /etc/systemd/system/lucidstatus.service
sudo rm /opt/lucidstatus-agent.sh
sudo systemctl daemon-reload
```

---

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | All servers with current stats, uptime dots & theme |
| `GET` | `/api/server/<id>?hours=24` | Single server detail with stat history |

### Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/report` | Submit server metrics (requires `api_key` in body) |

### Admin (requires login)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/admin/api/settings` | Get/update site settings |
| `GET/POST` | `/admin/api/theme` | Get/update theme colors |
| `GET/POST` | `/admin/api/categories` | List/create categories |
| `PUT/DELETE` | `/admin/api/categories/<id>` | Update/delete a category |
| `GET/POST` | `/admin/api/servers` | List/create servers |
| `PUT/DELETE` | `/admin/api/servers/<id>` | Update/delete a server |
| `GET` | `/admin/api/servers/<id>/script` | Get install script for a server |

---

## Tech Stack

- **Backend:** Python 3.10+, Flask 3.0, SQLAlchemy, SQLite
- **Frontend:** Vanilla JS, CSS custom properties, Chart.js 4
- **Agent:** Bash, systemd, cURL
- **Fonts:** Inter (Google Fonts)

---

## License

MIT
