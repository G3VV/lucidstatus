import os
import secrets
import uuid
import json
import threading
from datetime import datetime, timedelta, timezone
from functools import wraps
from urllib.request import Request, urlopen
from urllib.error import URLError

from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_from_directory, Response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///statuspage.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(app.static_folder, 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024

CORS(app)
db = SQLAlchemy(app)
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

# ── Models ───────────────────────────────────────────────────────────────────

class Settings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    site_name = db.Column(db.String(100), default='lucid.cool')
    logo_path = db.Column(db.String(255), default='')
    admin_password_hash = db.Column(db.String(255))
    discord_webhook_url = db.Column(db.String(500), default='')  # legacy, kept for migration compat

class ThemeSettings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    bg_outer = db.Column(db.String(9), default='#1C2327')
    bg_panel = db.Column(db.String(9), default='#1E252A')
    bg_card = db.Column(db.String(9), default='#28333A')
    bg_bar = db.Column(db.String(9), default='#32434D')
    text_primary = db.Column(db.String(9), default='#F2FAFF')
    text_secondary = db.Column(db.String(9), default='#8B949E')
    accent = db.Column(db.String(9), default='#307EB4')
    border_online = db.Column(db.String(9), default='#83FF78')
    border_offline = db.Column(db.String(9), default='#FF5D5D')
    border_partial = db.Column(db.String(9), default='#FFD95D')
    bar_cpu = db.Column(db.String(9), default='#78A3FF')
    bar_ram = db.Column(db.String(9), default='#78FFB5')
    bar_disk = db.Column(db.String(9), default='#E6FF78')
    bar_net_in = db.Column(db.String(9), default='#C7FF78')
    bar_net_out = db.Column(db.String(20), default='rgba(255,183,120,0.75)')
    dot_up = db.Column(db.String(9), default='#83FF78')
    dot_down = db.Column(db.String(9), default='#FF5D5D')
    dot_partial = db.Column(db.String(9), default='#FFD95D')
    dot_grey = db.Column(db.String(9), default='#32434D')
    glow_from = db.Column(db.String(30), default='rgba(37,111,162,0.1)')
    status_operational = db.Column(db.String(9), default='#83FF78')
    status_degraded = db.Column(db.String(9), default='#FFD95D')
    status_partial = db.Column(db.String(9), default='#FFB778')
    status_major = db.Column(db.String(9), default='#FF5D5D')

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    sort_order = db.Column(db.Integer, default=0)
    servers = db.relationship('Server', backref='category', lazy=True, cascade='all, delete-orphan')

class Server(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    api_key = db.Column(db.String(64), unique=True, nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=False)
    cpu_percent = db.Column(db.Float, default=0)
    cpu_iowait = db.Column(db.Float, default=0)
    cpu_steal = db.Column(db.Float, default=0)
    ram_percent = db.Column(db.Float, default=0)
    swap_percent = db.Column(db.Float, default=0)
    ram_buffered = db.Column(db.Float, default=0)
    ram_cached = db.Column(db.Float, default=0)
    disk_percent = db.Column(db.Float, default=0)
    net_in_mbps = db.Column(db.Float, default=0)
    net_out_mbps = db.Column(db.Float, default=0)
    net_max_mbps = db.Column(db.Float, default=1000)
    last_seen = db.Column(db.DateTime, default=None)
    created_at = db.Column(db.DateTime, default=utcnow)
    webhook_notified = db.Column(db.Boolean, default=False)  # True if 'down' webhook already sent
    uptime_records = db.relationship('UptimeRecord', backref='server', lazy=True, cascade='all, delete-orphan')
    stat_snapshots = db.relationship('StatSnapshot', backref='server', lazy=True, cascade='all, delete-orphan')

class WebhookEndpoint(db.Model):
    """Configurable webhook endpoints for notifications."""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, default='My Webhook')
    url = db.Column(db.String(500), nullable=False)
    webhook_type = db.Column(db.String(20), default='discord')  # discord, slack, custom
    enabled = db.Column(db.Boolean, default=True)
    notify_down = db.Column(db.Boolean, default=True)
    notify_recovery = db.Column(db.Boolean, default=True)
    notify_degraded = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)

class UptimeRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    server_id = db.Column(db.Integer, db.ForeignKey('server.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), default='up')
    downtime_minutes = db.Column(db.Float, default=0)   # accumulated downtime in minutes for this day
    __table_args__ = (db.UniqueConstraint('server_id', 'date'),)

class StatSnapshot(db.Model):
    """Stores periodic snapshots for graphs."""
    id = db.Column(db.Integer, primary_key=True)
    server_id = db.Column(db.Integer, db.ForeignKey('server.id'), nullable=False)
    ts = db.Column(db.DateTime, nullable=False, default=utcnow)
    cpu = db.Column(db.Float, default=0)
    iowait = db.Column(db.Float, default=0)
    steal = db.Column(db.Float, default=0)
    ram = db.Column(db.Float, default=0)
    swap = db.Column(db.Float, default=0)
    buffered = db.Column(db.Float, default=0)
    cached = db.Column(db.Float, default=0)
    disk = db.Column(db.Float, default=0)
    net_in = db.Column(db.Float, default=0)
    net_out = db.Column(db.Float, default=0)

# ── Helpers ──────────────────────────────────────────────────────────────────

def get_settings():
    s = Settings.query.first()
    if not s:
        s = Settings(site_name='lucid.cool', logo_path='', admin_password_hash=generate_password_hash('admin'))
        db.session.add(s)
        db.session.commit()
    return s

def get_theme():
    t = ThemeSettings.query.first()
    if not t:
        t = ThemeSettings()
        db.session.add(t)
        db.session.commit()
    return t

def theme_to_dict(t):
    return {c.name: getattr(t, c.name) for c in ThemeSettings.__table__.columns if c.name != 'id'}

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin'):
            if request.path.startswith('/admin/api/'):
                return jsonify({'ok': False, 'error': 'Not authenticated'}), 401
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated

def compute_overall_status():
    servers = Server.query.all()
    if not servers:
        return 'operational'
    now = utcnow()
    down_count = 0
    partial_count = 0
    for s in servers:
        if s.last_seen is None or (now - s.last_seen).total_seconds() > 120:
            down_count += 1
        elif (now - s.last_seen).total_seconds() > 60:
            partial_count += 1
    if down_count == len(servers):
        return 'major_outage'
    elif down_count > 0:
        return 'partial_outage'
    elif partial_count > 0:
        return 'degraded'
    return 'operational'

def get_status_color(key, theme):
    m = {'operational': theme.status_operational, 'degraded': theme.status_degraded,
         'partial_outage': theme.status_partial, 'major_outage': theme.status_major}
    return m.get(key, '#83FF78')

STATUS_LABELS = {
    'operational': 'All services operational',
    'degraded': 'Some services experiencing delays',
    'partial_outage': 'Partial system outage',
    'major_outage': 'Major system outage',
}

def _dot_status(downtime_min):
    """Determine dot colour from accumulated downtime minutes.
    >10 min → down (red), >0 min → partial (yellow), else up (green)."""
    if downtime_min > 10:
        return 'down'
    elif downtime_min > 0:
        return 'partial'
    return 'up'

def get_uptime_dots(server, num_days=30):
    today = utcnow().date()
    records = {r.date: r for r in UptimeRecord.query.filter_by(server_id=server.id).all()}
    dots = []
    now = utcnow()
    for i in range(num_days - 1, -1, -1):
        d = today - timedelta(days=i)
        if d in records:
            rec = records[d]
            # For today, also account for ongoing downtime if server is currently offline
            if d == today and server.last_seen is not None:
                gap = (now - server.last_seen).total_seconds() / 60.0
                effective = rec.downtime_minutes + max(0, gap - 2)  # 2-min grace period
            else:
                effective = rec.downtime_minutes
            dots.append(_dot_status(effective))
        elif d < server.created_at.date():
            dots.append('none')
        elif d == today:
            # No record yet today — check if server has ever reported
            if server.last_seen is not None:
                gap = (now - server.last_seen).total_seconds() / 60.0
                if gap > 12:   # >10 min down + 2 min grace
                    dots.append('down')
                elif gap > 2:
                    dots.append('partial')
                else:
                    dots.append('up')
            else:
                dots.append('grey')
        else:
            dots.append('grey')
    return dots

def send_discord_webhook(server_name, event='down'):
    """Send webhook notifications to all matching enabled endpoints in background threads."""
    try:
        webhooks = WebhookEndpoint.query.filter_by(enabled=True).all()
    except Exception:
        return

    for wh in webhooks:
        # Check if this webhook wants this event type
        if event == 'down' and not wh.notify_down:
            continue
        if event == 'recovery' and not wh.notify_recovery:
            continue
        if event == 'degraded' and not wh.notify_degraded:
            continue

        url = (wh.url or '').strip()
        if not url:
            continue

        payload = _build_webhook_payload(wh.webhook_type, server_name, event)
        if not payload:
            continue

        def _send(u=url, p=payload):
            try:
                req = Request(u, data=p.encode('utf-8'),
                              headers={'Content-Type': 'application/json',
                                       'User-Agent': 'LucidStatus/1.0'})
                urlopen(req, timeout=10)
            except (URLError, Exception) as e:
                print(f'[Webhook] Failed to send to {u}: {e}')

        threading.Thread(target=_send, daemon=True).start()


def _build_webhook_payload(webhook_type, server_name, event):
    """Build JSON payload appropriate for the webhook type."""
    ts = datetime.now(timezone.utc).isoformat()

    if event == 'down':
        title = f'{server_name} is DOWN'
        desc = f'**{server_name}** has stopped reporting and appears to be offline.'
        color = 0xFF5D5D
        level = 'critical'
    elif event == 'recovery':
        title = f'{server_name} is back ONLINE'
        desc = f'**{server_name}** is reporting again.'
        color = 0x83FF78
        level = 'info'
    elif event == 'degraded':
        title = f'{server_name} is degraded'
        desc = f'**{server_name}** is experiencing delays.'
        color = 0xFFD95D
        level = 'warning'
    else:
        return None

    if webhook_type == 'discord':
        return json.dumps({
            'embeds': [{'title': title, 'description': desc, 'color': color, 'timestamp': ts}]
        })
    elif webhook_type == 'slack':
        return json.dumps({
            'text': f'*{title}*\n{desc}'
        })
    else:  # custom — generic JSON
        return json.dumps({
            'event': event,
            'server': server_name,
            'title': title,
            'message': desc,
            'level': level,
            'timestamp': ts,
        })

def server_to_dict(server):
    now = utcnow()
    online = server.last_seen is not None and (now - server.last_seen).total_seconds() < 120
    return {
        'id': server.id,
        'name': server.name,
        'category_id': server.category_id,
        'cpu': round(server.cpu_percent, 1),
        'iowait': round(server.cpu_iowait, 1),
        'steal': round(server.cpu_steal, 1),
        'ram': round(server.ram_percent, 1),
        'swap': round(server.swap_percent, 1),
        'buffered': round(server.ram_buffered, 1),
        'cached': round(server.ram_cached, 1),
        'disk': round(server.disk_percent, 1),
        'net_in': round(server.net_in_mbps, 2),
        'net_out': round(server.net_out_mbps, 2),
        'net_max': server.net_max_mbps,
        'online': online,
        'last_seen': server.last_seen.isoformat() if server.last_seen else None,
        'uptime': get_uptime_dots(server),
    }

# ── Public Routes ────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/server/<int:srv_id>')
def server_detail_page(srv_id):
    srv = Server.query.get_or_404(srv_id)
    return render_template('server.html', server_id=srv_id)

@app.route('/agent/<api_key>')
def serve_agent_script(api_key):
    server = Server.query.filter_by(api_key=api_key).first()
    if not server:
        return 'echo "Error: Invalid API key"', 404, {'Content-Type': 'text/plain'}
    base_url = request.host_url.rstrip('/')
    return generate_bash_script(base_url, api_key), 200, {'Content-Type': 'text/plain'}

@app.route('/api/status')
def api_status():
    settings = get_settings()
    theme = get_theme()
    status_key = compute_overall_status()
    categories = Category.query.order_by(Category.sort_order).all()
    data = {
        'site_name': settings.site_name,
        'logo': settings.logo_path if settings.logo_path else None,
        'status': status_key,
        'status_label': STATUS_LABELS[status_key],
        'status_color': get_status_color(status_key, theme),
        'theme': theme_to_dict(theme),
        'categories': [],
    }
    for cat in categories:
        servers = Server.query.filter_by(category_id=cat.id).all()
        data['categories'].append({
            'id': cat.id, 'name': cat.name,
            'servers': [server_to_dict(s) for s in servers],
        })
    return jsonify(data)

@app.route('/api/server/<int:srv_id>')
def api_server_detail(srv_id):
    srv = Server.query.get_or_404(srv_id)
    theme = get_theme()
    now = utcnow()
    online = srv.last_seen is not None and (now - srv.last_seen).total_seconds() < 120

    # Get history snapshots (last 24h default, or query param)
    hours = int(request.args.get('hours', 24))
    since = now - timedelta(hours=hours)
    snaps = StatSnapshot.query.filter(
        StatSnapshot.server_id == srv_id,
        StatSnapshot.ts >= since
    ).order_by(StatSnapshot.ts).all()

    history = [{
        'ts': s.ts.isoformat(),
        'cpu': round(s.cpu, 1), 'iowait': round(s.iowait, 1), 'steal': round(s.steal, 1),
        'ram': round(s.ram, 1), 'swap': round(s.swap, 1),
        'buffered': round(s.buffered, 1), 'cached': round(s.cached, 1),
        'disk': round(s.disk, 1),
        'net_in': round(s.net_in, 2), 'net_out': round(s.net_out, 2),
    } for s in snaps]

    # Calculate uptime percentage (last 30 days)
    uptime_dots = get_uptime_dots(srv, 90)
    total_days = len([d for d in uptime_dots if d != 'none'])
    up_days = len([d for d in uptime_dots if d == 'up'])
    partial_days = len([d for d in uptime_dots if d == 'partial'])
    uptime_pct = round(((up_days + partial_days * 0.5) / max(total_days, 1)) * 100, 2)

    return jsonify({
        'id': srv.id,
        'name': srv.name,
        'cpu': round(srv.cpu_percent, 1),
        'iowait': round(srv.cpu_iowait, 1),
        'steal': round(srv.cpu_steal, 1),
        'ram': round(srv.ram_percent, 1),
        'swap': round(srv.swap_percent, 1),
        'buffered': round(srv.ram_buffered, 1),
        'cached': round(srv.ram_cached, 1),
        'disk': round(srv.disk_percent, 1),
        'net_in': round(srv.net_in_mbps, 2),
        'net_out': round(srv.net_out_mbps, 2),
        'net_max': srv.net_max_mbps,
        'online': online,
        'last_seen': srv.last_seen.isoformat() if srv.last_seen else None,
        'created_at': srv.created_at.isoformat(),
        'uptime_dots': get_uptime_dots(srv, 90),
        'uptime_pct': uptime_pct,
        'history': history,
        'theme': theme_to_dict(get_theme()),
    })

# ── Agent Endpoint ───────────────────────────────────────────────────────────

@app.route('/api/report', methods=['POST'])
def agent_report():
    api_key = request.headers.get('X-API-Key') or request.json.get('api_key')
    if not api_key:
        return jsonify({'error': 'Missing API key'}), 401
    server = Server.query.filter_by(api_key=api_key).first()
    if not server:
        return jsonify({'error': 'Invalid API key'}), 401

    data = request.json
    server.cpu_percent = min(100, max(0, float(data.get('cpu', 0))))
    server.cpu_iowait = min(100, max(0, float(data.get('iowait', 0))))
    server.cpu_steal = min(100, max(0, float(data.get('steal', 0))))
    server.ram_percent = min(100, max(0, float(data.get('ram', 0))))
    server.swap_percent = min(100, max(0, float(data.get('swap', 0))))
    server.ram_buffered = min(100, max(0, float(data.get('buffered', 0))))
    server.ram_cached = min(100, max(0, float(data.get('cached', 0))))
    server.disk_percent = min(100, max(0, float(data.get('disk', 0))))
    server.net_in_mbps = max(0, float(data.get('net_in', 0)))
    server.net_out_mbps = max(0, float(data.get('net_out', 0)))
    now = utcnow()
    old_last_seen = server.last_seen  # capture before updating
    server.last_seen = now
    server.webhook_notified = False  # server is alive, clear notification flag

    # Save snapshot (throttle to one per minute)
    last_snap = StatSnapshot.query.filter_by(server_id=server.id).order_by(StatSnapshot.ts.desc()).first()
    if not last_snap or (now - last_snap.ts).total_seconds() >= 55:
        snap = StatSnapshot(
            server_id=server.id, ts=now,
            cpu=server.cpu_percent, iowait=server.cpu_iowait, steal=server.cpu_steal,
            ram=server.ram_percent, swap=server.swap_percent,
            buffered=server.ram_buffered, cached=server.ram_cached,
            disk=server.disk_percent,
            net_in=server.net_in_mbps, net_out=server.net_out_mbps,
        )
        db.session.add(snap)

    # ── Uptime tracking based on gap since last report ──
    today = now.date()
    rec = UptimeRecord.query.filter_by(server_id=server.id, date=today).first()
    if not rec:
        rec = UptimeRecord(server_id=server.id, date=today, status='up', downtime_minutes=0)
        db.session.add(rec)

    # If there was a previous report, check the gap
    was_offline = False
    if old_last_seen is not None:
        gap_min = (now - old_last_seen).total_seconds() / 60.0
        if gap_min > 2:  # more than 2 minutes = downtime (agent reports every 30s)
            rec.downtime_minutes = (rec.downtime_minutes or 0) + gap_min
            was_offline = True

    # Derive status from accumulated downtime
    rec.status = _dot_status(rec.downtime_minutes or 0)

    db.session.commit()

    # Send Discord webhook if server was offline and just came back
    if was_offline:
        send_discord_webhook(server.name, 'recovery')

    return jsonify({'ok': True})

@app.route('/api/report/down', methods=['POST'])
def report_down():
    """Manual endpoint kept for backwards compat — adds 10+ min downtime so dot turns red."""
    api_key = request.headers.get('X-API-Key')
    if not api_key:
        return jsonify({'error': 'Missing API key'}), 401
    server = Server.query.filter_by(api_key=api_key).first()
    if not server:
        return jsonify({'error': 'Invalid API key'}), 401
    today = utcnow().date()
    rec = UptimeRecord.query.filter_by(server_id=server.id, date=today).first()
    if not rec:
        rec = UptimeRecord(server_id=server.id, date=today, status='down', downtime_minutes=11)
        db.session.add(rec)
    else:
        rec.downtime_minutes = (rec.downtime_minutes or 0) + 11
        rec.status = _dot_status(rec.downtime_minutes)
    db.session.commit()
    return jsonify({'ok': True})

# ── Admin Auth ───────────────────────────────────────────────────────────────

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        password = request.form.get('password', '')
        settings = get_settings()
        if check_password_hash(settings.admin_password_hash, password):
            session['admin'] = True
            return redirect(url_for('admin_dashboard'))
        return render_template('login.html', error='Invalid password')
    return render_template('login.html')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin', None)
    return redirect(url_for('index'))

# ── Admin Dashboard ──────────────────────────────────────────────────────────

@app.route('/admin')
@login_required
def admin_dashboard():
    return render_template('admin.html')

@app.route('/admin/api/settings', methods=['GET', 'POST'])
@login_required
def admin_settings():
    s = get_settings()
    if request.method == 'POST':
        s.site_name = request.form.get('site_name', s.site_name)
        if 'logo' in request.files:
            f = request.files['logo']
            if f.filename:
                ext = os.path.splitext(secure_filename(f.filename))[1]
                fname = f'logo_{uuid.uuid4().hex[:8]}{ext}'
                f.save(os.path.join(app.config['UPLOAD_FOLDER'], fname))
                s.logo_path = f'/static/uploads/{fname}'
        new_pw = request.form.get('new_password', '').strip()
        if new_pw:
            s.admin_password_hash = generate_password_hash(new_pw)
        s.discord_webhook_url = request.form.get('discord_webhook_url', s.discord_webhook_url or '')
        db.session.commit()
        return jsonify({'ok': True, 'logo': s.logo_path, 'site_name': s.site_name})
    return jsonify({'site_name': s.site_name, 'logo': s.logo_path})

@app.route('/admin/api/theme', methods=['GET', 'POST'])
@login_required
def admin_theme():
    t = get_theme()
    if request.method == 'POST':
        data = request.json
        for col in ThemeSettings.__table__.columns:
            if col.name != 'id' and col.name in data:
                setattr(t, col.name, data[col.name])
        db.session.commit()
        return jsonify({'ok': True, 'theme': theme_to_dict(t)})
    return jsonify(theme_to_dict(t))

@app.route('/admin/api/categories', methods=['GET', 'POST'])
@login_required
def admin_categories():
    if request.method == 'POST':
        data = request.json
        cat = Category(name=data['name'], sort_order=data.get('sort_order', 0))
        db.session.add(cat)
        db.session.commit()
        return jsonify({'id': cat.id, 'name': cat.name})
    cats = Category.query.order_by(Category.sort_order).all()
    return jsonify([{'id': c.id, 'name': c.name, 'sort_order': c.sort_order} for c in cats])

@app.route('/admin/api/categories/<int:cat_id>', methods=['PUT', 'DELETE'])
@login_required
def admin_category_detail(cat_id):
    cat = Category.query.get_or_404(cat_id)
    if request.method == 'DELETE':
        db.session.delete(cat)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json
    cat.name = data.get('name', cat.name)
    cat.sort_order = data.get('sort_order', cat.sort_order)
    db.session.commit()
    return jsonify({'id': cat.id, 'name': cat.name})

@app.route('/admin/api/servers', methods=['GET', 'POST'])
@login_required
def admin_servers():
    if request.method == 'POST':
        data = request.json
        api_key = secrets.token_hex(32)
        srv = Server(name=data['name'], category_id=data['category_id'], api_key=api_key,
                     net_max_mbps=float(data.get('net_max_mbps', 1000)))
        db.session.add(srv)
        db.session.commit()
        base_url = request.host_url.rstrip('/')
        return jsonify({'id': srv.id, 'name': srv.name, 'api_key': api_key,
                        'bash_script': generate_bash_script(base_url, api_key)})
    servers = Server.query.all()
    return jsonify([{
        'id': s.id, 'name': s.name, 'category_id': s.category_id,
        'api_key': s.api_key, 'net_max_mbps': s.net_max_mbps,
        'last_seen': s.last_seen.isoformat() if s.last_seen else None,
    } for s in servers])

@app.route('/admin/api/servers/<int:srv_id>', methods=['PUT', 'DELETE'])
@login_required
def admin_server_detail(srv_id):
    srv = Server.query.get_or_404(srv_id)
    if request.method == 'DELETE':
        db.session.delete(srv)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json
    srv.name = data.get('name', srv.name)
    srv.category_id = data.get('category_id', srv.category_id)
    srv.net_max_mbps = float(data.get('net_max_mbps', srv.net_max_mbps))
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/admin/api/servers/<int:srv_id>/script')
@login_required
def admin_server_script(srv_id):
    srv = Server.query.get_or_404(srv_id)
    base_url = request.host_url.rstrip('/')
    return jsonify({'bash_script': generate_bash_script(base_url, srv.api_key)})

# ── Webhook Admin API ────────────────────────────────────────────────────────

@app.route('/admin/api/webhooks', methods=['GET', 'POST'])
@login_required
def admin_webhooks():
    if request.method == 'POST':
        data = request.json
        wh = WebhookEndpoint(
            name=data.get('name', 'My Webhook'),
            url=data['url'],
            webhook_type=data.get('webhook_type', 'discord'),
            enabled=data.get('enabled', True),
            notify_down=data.get('notify_down', True),
            notify_recovery=data.get('notify_recovery', True),
            notify_degraded=data.get('notify_degraded', False),
        )
        db.session.add(wh)
        db.session.commit()
        return jsonify({'id': wh.id, 'name': wh.name})
    webhooks = WebhookEndpoint.query.order_by(WebhookEndpoint.created_at).all()
    return jsonify([{
        'id': w.id, 'name': w.name, 'url': w.url,
        'webhook_type': w.webhook_type, 'enabled': w.enabled,
        'notify_down': w.notify_down, 'notify_recovery': w.notify_recovery,
        'notify_degraded': w.notify_degraded,
    } for w in webhooks])

@app.route('/admin/api/webhooks/<int:wh_id>', methods=['PUT', 'DELETE'])
@login_required
def admin_webhook_detail(wh_id):
    wh = WebhookEndpoint.query.get_or_404(wh_id)
    if request.method == 'DELETE':
        db.session.delete(wh)
        db.session.commit()
        return jsonify({'ok': True})
    data = request.json
    wh.name = data.get('name', wh.name)
    wh.url = data.get('url', wh.url)
    wh.webhook_type = data.get('webhook_type', wh.webhook_type)
    wh.enabled = data.get('enabled', wh.enabled)
    wh.notify_down = data.get('notify_down', wh.notify_down)
    wh.notify_recovery = data.get('notify_recovery', wh.notify_recovery)
    wh.notify_degraded = data.get('notify_degraded', wh.notify_degraded)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/admin/api/webhooks/<int:wh_id>/test', methods=['POST'])
@login_required
def admin_webhook_test(wh_id):
    wh = WebhookEndpoint.query.get_or_404(wh_id)
    url = (wh.url or '').strip()
    if not url:
        return jsonify({'ok': False, 'error': 'No URL configured'}), 400
    payload = _build_webhook_payload(wh.webhook_type, 'Test Server', 'down')
    try:
        req = Request(url, data=payload.encode('utf-8'),
                      headers={'Content-Type': 'application/json',
                               'User-Agent': 'LucidStatus/1.0'})
        urlopen(req, timeout=10)
        return jsonify({'ok': True})
    except Exception as e:
        app.logger.error('Webhook test failed for %s: %s', url, e)
        return jsonify({'ok': False, 'error': str(e)}), 502

# ── Background Server Monitor ────────────────────────────────────────────────

def _background_checker():
    """Runs every 30s to detect offline servers and fire webhooks."""
    import time
    while True:
        time.sleep(30)
        try:
            with app.app_context():
                now = utcnow()
                changed = False
                for srv in Server.query.all():
                    is_offline = srv.last_seen is None or (now - srv.last_seen).total_seconds() > 120
                    if is_offline and not srv.webhook_notified:
                        srv.webhook_notified = True
                        changed = True
                        send_discord_webhook(srv.name, 'down')
                    elif not is_offline and srv.webhook_notified:
                        srv.webhook_notified = False
                        changed = True
                if changed:
                    db.session.commit()
        except Exception as e:
            print(f'[Monitor] Error: {e}')


def generate_bash_script(base_url, api_key):
    return f'''#!/usr/bin/env bash
# Status Page Agent — installs as a systemd service that runs 24/7
# Usage: bash <(curl -s {base_url}/agent/{api_key})

set -e

AGENT_PATH="/opt/lucidstatus-agent.sh"
SERVICE_NAME="lucidstatus"

cat > "$AGENT_PATH" << 'AGENT'
#!/usr/bin/env bash
API_KEY="{api_key}"
URL="{base_url}/api/report"
INTERVAL=30

get_net() {{
    local iface
    iface=$(ip route | awk '/default/ {{print $5; exit}}')
    if [[ -z "$iface" ]]; then iface="eth0"; fi
    local rx1 tx1 rx2 tx2
    rx1=$(cat /sys/class/net/$iface/statistics/rx_bytes 2>/dev/null || echo 0)
    tx1=$(cat /sys/class/net/$iface/statistics/tx_bytes 2>/dev/null || echo 0)
    sleep 1
    rx2=$(cat /sys/class/net/$iface/statistics/rx_bytes 2>/dev/null || echo 0)
    tx2=$(cat /sys/class/net/$iface/statistics/tx_bytes 2>/dev/null || echo 0)
    local rx_mbps tx_mbps
    rx_mbps=$(awk "BEGIN {{printf \\"%.2f\\", ($rx2 - $rx1) * 8 / 1000000}}")
    tx_mbps=$(awk "BEGIN {{printf \\"%.2f\\", ($tx2 - $tx1) * 8 / 1000000}}")
    echo "$rx_mbps $tx_mbps"
}}

while true; do
    # CPU breakdown
    read CPU IOWAIT STEAL <<< $(top -bn1 | grep "Cpu(s)" | awk '{{printf "%.1f %.1f %.1f", $2+$4, $10, $16}}')
    [[ -z "$IOWAIT" ]] && IOWAIT=0
    [[ -z "$STEAL" ]] && STEAL=0

    # RAM breakdown
    RAM=$(free | awk '/Mem:/ {{printf "%.1f", $3/$2 * 100}}')
    SWAP=$(free | awk '/Swap:/ {{if($2>0) printf "%.1f", $3/$2*100; else print "0"}}')
    BUFFERED=$(awk '/Buffers:/ {{printf "%.1f", $2*100/'$(free | awk '/Mem:/ {{print $2}}')"}}" /proc/meminfo)
    CACHED=$(awk '/^Cached:/ {{printf "%.1f", $2*100/'$(free | awk '/Mem:/ {{print $2}}')"}}" /proc/meminfo)

    DISK=$(df / | awk 'NR==2 {{print $5}}' | tr -d '%')
    NET=($(get_net))
    NET_IN=${{NET[0]}}
    NET_OUT=${{NET[1]}}

    curl -s -X POST "$URL" \\
        -H "Content-Type: application/json" \\
        -H "X-API-Key: $API_KEY" \\
        -d "{{\\\"cpu\\\": $CPU, \\\"iowait\\\": $IOWAIT, \\\"steal\\\": $STEAL, \\\"ram\\\": $RAM, \\\"swap\\\": $SWAP, \\\"buffered\\\": $BUFFERED, \\\"cached\\\": $CACHED, \\\"disk\\\": $DISK, \\\"net_in\\\": $NET_IN, \\\"net_out\\\": $NET_OUT}}"

    sleep $INTERVAL
done
AGENT

chmod +x "$AGENT_PATH"

cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Status Page Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash $AGENT_PATH
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo ""
echo "Status page agent installed and running as a systemd service."
echo "  Service: $SERVICE_NAME"
echo "  Status:  systemctl status $SERVICE_NAME"
echo "  Logs:    journalctl -u $SERVICE_NAME -f"
echo "  Remove:  systemctl disable --now $SERVICE_NAME && rm $AGENT_PATH /etc/systemd/system/$SERVICE_NAME.service"
'''

# ── Init ─────────────────────────────────────────────────────────────────────

def _migrate_add_columns():
    """Add any missing columns to existing SQLite tables on startup."""
    import sqlite3
    db_path = os.path.join(app.instance_path, 'statuspage.db')
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    migrations = [
        # (table, column, type, default)
        ('server', 'cpu_iowait', 'FLOAT', 0),
        ('server', 'cpu_steal', 'FLOAT', 0),
        ('server', 'swap_percent', 'FLOAT', 0),
        ('server', 'ram_buffered', 'FLOAT', 0),
        ('server', 'ram_cached', 'FLOAT', 0),
        ('stat_snapshot', 'iowait', 'FLOAT', 0),
        ('stat_snapshot', 'steal', 'FLOAT', 0),
        ('stat_snapshot', 'swap', 'FLOAT', 0),
        ('stat_snapshot', 'buffered', 'FLOAT', 0),
        ('stat_snapshot', 'cached', 'FLOAT', 0),
        ('uptime_record', 'downtime_minutes', 'FLOAT', 0),
        ('settings', 'discord_webhook_url', 'VARCHAR(500)', "''"),
        ('server', 'webhook_notified', 'BOOLEAN', 0),
    ]
    for table, col, dtype, default in migrations:
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {dtype} DEFAULT {default}")
        except sqlite3.OperationalError:
            pass  # column already exists

    conn.commit()
    conn.close()

with app.app_context():
    _migrate_add_columns()
    db.create_all()
    get_settings()
    get_theme()

# Start background monitor (only once, avoid double-start under Flask reloader)
if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
    _monitor_thread = threading.Thread(target=_background_checker, daemon=True)
    _monitor_thread.start()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'true').lower() in ('true', '1', 'yes')
    app.run(host='0.0.0.0', port=port, debug=debug)
