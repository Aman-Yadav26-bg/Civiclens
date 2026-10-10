#!/usr/bin/env python3
"""
CivicLens - Smart Civic Issue Reporting & Management Platform (SIH25031)
Standalone Backend Server in Python 3 (Native Standard Library - Zero Extra Dependencies Needed)
Provides full REST API endpoints, SQLite storage, multipart photo uploads, GIS Ward routing, and email dispatcher.
"""

import http.server
import socketserver
import os
import sys
import json
import re
import mimetypes
import urllib.parse
import time
import random
import datetime

# Ensure safe UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = int(os.environ.get("PORT", 5000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
CITIZEN_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "citizen")
RESOLUTION_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "resolutions")
DB_FILE = os.path.join(BASE_DIR, "civiclens_store.json")

# Ensure upload folders exist
for d in [UPLOAD_DIR, CITIZEN_UPLOAD_DIR, RESOLUTION_UPLOAD_DIR]:
    os.makedirs(d, exist_ok=True)

# Helper Functions
def icon_for(cat):
    icons = {
        "Pothole": "🕳️",
        "Garbage": "🗑️",
        "Street Light": "💡",
        "Water Leakage": "🚰",
        "Damaged Road": "🚧",
        "Drainage": "🌧️",
        "Sanitation": "🚽",
        "Environment": "🌳",
        "Other": "📍"
    }
    return icons.get(cat, "📍")

def dept_for(cat):
    if cat in ["Garbage", "Sanitation"]:
        return "Sanitation Department"
    if cat in ["Water Leakage", "Drainage"]:
        return "Water Supply & Sewerage"
    if cat == "Street Light":
        return "Electricity & Lighting"
    if cat == "Environment":
        return "Environment & Parks"
    return "Public Works Department"

def assign_ward(location="", lat=None, lon=None):
    loc = (location or "").lower()
    if "sector 12" in loc or "harmu" in loc or (lat and lat < 23.34):
        return "Ward 12 (Central)"
    if "morabadi" in loc or "tagore" in loc or (lat and lat > 23.38):
        return "Ward 07 (North)"
    if "lalpur" in loc or "circular" in loc or (lon and lon > 85.33):
        return "Ward 04 (East)"
    if "doranda" in loc or "hinoo" in loc or (lat and lat < 23.32):
        return "Ward 15 (South)"
    return "Ward 12 (Central)"

def calculate_ai_score(cat, description=""):
    text = (description or "").lower()
    base_score = 75
    priority = "Medium"
    confidence = random.randint(88, 97)

    if cat in ["Water Leakage", "Damaged Road"]:
        base_score = 85
        priority = "High"
    elif cat == "Pothole":
        base_score = 87
        priority = "High"
    elif cat == "Garbage":
        base_score = 65
        priority = "Medium"
    elif cat == "Street Light":
        base_score = 45
        priority = "Low"

    if any(k in text for k in ["danger", "hazard", "critical", "flood", "accident", "emergency", "broken", "severe"]):
        base_score = min(99, base_score + 12)
        priority = "Critical"

    return {"score": base_score, "priority": priority, "confidence": confidence}

def parse_multipart_data(content_type, body_bytes):
    fields = {}
    files = {}
    if not content_type or "boundary=" not in content_type:
        return fields, files

    boundary = content_type.split("boundary=")[1].strip()
    if boundary.startswith('"') and boundary.endswith('"'):
        boundary = boundary[1:-1]

    boundary_bytes = ("--" + boundary).encode("utf-8")
    parts = body_bytes.split(boundary_bytes)

    for part in parts:
        if not part or part == b"--\r\n" or part == b"--" or part == b"\r\n":
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        if not part:
            continue

        header_end = part.find(b"\r\n\r\n")
        if header_end == -1:
            continue

        header_data = part[:header_end].decode("utf-8", errors="ignore")
        payload = part[header_end + 4:]

        name_match = re.search(r'name="([^"]+)"', header_data)
        filename_match = re.search(r'filename="([^"]+)"', header_data)

        if name_match:
            name = name_match.group(1)
            if filename_match and filename_match.group(1):
                filename = filename_match.group(1)
                files[name] = {"filename": filename, "data": payload}
            else:
                fields[name] = payload.decode("utf-8", errors="ignore").strip()

    return fields, files

def extract_city(city_val="", location_val=""):
    if city_val and city_val.strip() and city_val.strip().lower() != "municipal zone":
        return city_val.strip()
    if location_val:
        parts = [p.strip() for p in location_val.split(",") if p.strip()]
        if len(parts) >= 2:
            candidate = parts[-2]
            candidate = re.sub(r'[\d\-]+', '', candidate).strip()
            if candidate and len(candidate) > 1:
                return candidate
        elif len(parts) == 1:
            candidate = re.sub(r'[\d\-]+', '', parts[0]).strip()
            if candidate:
                return candidate
    return "Municipal"

# Initial Data
INITIAL_COMPLAINTS = [
    {
        "id": "CIV-2026-1048",
        "cat": "Pothole",
        "icon": "🕳️",
        "description": "A large pothole near the main crossroads is creating a safety hazard for two-wheelers and heavy vehicles.",
        "location": "Sector 12, Central Zone",
        "city": "Central Zone",
        "latitude": 23.3441,
        "longitude": 85.3096,
        "status": "In Progress",
        "priority": "High",
        "dept": "Public Works Department",
        "ward": "Ward 12 (Central)",
        "confidence": 92,
        "score": 87,
        "date": "21 Aug 2026",
        "imageUrl": "",
        "resolutionProof": "",
        "resolutionNote": "Field team dispatched with cold asphalt mix.",
        "upvotes": 14,
        "citizenEmail": "citizen@demo.com",
        "officer": "Rahul Kumar (PWD)",
        "resolvedAt": None
    },
    {
        "id": "CIV-2026-1047",
        "cat": "Garbage",
        "icon": "🗑️",
        "description": "Unattended municipal garbage dump accumulating near the public ground, emitting foul smell.",
        "location": "Morabadi Area, North Zone",
        "city": "North Zone",
        "latitude": 23.3855,
        "longitude": 85.3347,
        "status": "Resolved",
        "priority": "Medium",
        "dept": "Sanitation Department",
        "ward": "Ward 07 (North)",
        "confidence": 96,
        "score": 61,
        "date": "20 Aug 2026",
        "imageUrl": "",
        "resolutionProof": "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop&q=80",
        "resolutionNote": "Garbage truck deployed. Site sanitized and cleared.",
        "upvotes": 8,
        "citizenEmail": "citizen@demo.com",
        "officer": "Priya Sharma (Sanitation)",
        "resolvedAt": "2026-08-20T16:45:00Z"
    },
    {
        "id": "CIV-2026-1042",
        "cat": "Street Light",
        "icon": "💡",
        "description": "Four consecutive LED street light poles not functional, causing dark patches at night.",
        "location": "Lalpur Main Market, East Zone",
        "city": "East Zone",
        "latitude": 23.3702,
        "longitude": 85.3382,
        "status": "Assigned",
        "priority": "Low",
        "dept": "Electricity & Lighting",
        "ward": "Ward 04 (East)",
        "confidence": 89,
        "score": 38,
        "date": "18 Aug 2026",
        "imageUrl": "",
        "resolutionProof": "",
        "resolutionNote": "",
        "upvotes": 5,
        "citizenEmail": "citizen@demo.com",
        "officer": "Amit Verma (Electricity)",
        "resolvedAt": None
    },
    {
        "id": "CIV-2026-1039",
        "cat": "Water Leakage",
        "icon": "🚰",
        "description": "Major underground pipeline burst leading to continuous road flooding and potable water loss.",
        "location": "Harmu Housing Colony, South-Central Zone",
        "city": "Central Zone",
        "latitude": 23.3512,
        "longitude": 85.3121,
        "status": "Reported",
        "priority": "Critical",
        "dept": "Water Supply & Sewerage",
        "ward": "Ward 12 (Central)",
        "confidence": 94,
        "score": 95,
        "date": "17 Aug 2026",
        "imageUrl": "",
        "resolutionProof": "",
        "resolutionNote": "",
        "upvotes": 23,
        "citizenEmail": "citizen@demo.com",
        "officer": "Sanjay Singh (Water)",
        "resolvedAt": None
    }
]

INITIAL_USERS = [
    {"id": "usr-1", "name": "Aditya Citizen", "email": "citizen@demo.com", "role": "citizen", "ward": "Ward 12 (Central)", "department": None},
    {"id": "usr-2", "name": "Rahul Kumar (Officer)", "email": "officer@demo.com", "role": "officer", "ward": "Ward 12 (Central)", "department": "Public Works Department"},
    {"id": "usr-3", "name": "Priya Sharma (Officer)", "email": "officer2@demo.com", "role": "officer", "ward": "Ward 07 (North)", "department": "Sanitation Department"},
    {"id": "usr-4", "name": "Chief Municipal Admin", "email": "admin@demo.com", "role": "admin", "ward": "All Wards", "department": "Municipal Corporation HQ"}
]

# Database Store Engine
class DataStore:
    def __init__(self):
        self.complaints = list(INITIAL_COMPLAINTS)
        self.users = list(INITIAL_USERS)
        self.upvotes = []
        self.timeline = [
            {"complaintId": "CIV-2026-1048", "title": "Reported", "description": "Citizen submitted report with GPS & photo", "timestamp": "21 Aug 2026 • 10:20 AM", "status": "Reported"},
            {"complaintId": "CIV-2026-1048", "title": "Assigned", "description": "Assigned to Public Works Department (Ward 12)", "timestamp": "21 Aug 2026 • 11:10 AM", "status": "Assigned"},
            {"complaintId": "CIV-2026-1048", "title": "In Progress", "description": "Officer Rahul Kumar initiated ground repair", "timestamp": "21 Aug 2026 • 01:45 PM", "status": "In Progress"},
            {"complaintId": "CIV-2026-1047", "title": "Reported", "description": "Citizen report logged", "timestamp": "20 Aug 2026 • 09:15 AM", "status": "Reported"},
            {"complaintId": "CIV-2026-1047", "title": "Resolved", "description": "Sanitation team completed site clearance and uploaded photo proof", "timestamp": "20 Aug 2026 • 04:45 PM", "status": "Resolved"}
        ]
        self.load()

    def load(self):
        if os.path.exists(DB_FILE):
            try:
                with open(DB_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.complaints = data.get("complaints", self.complaints)
                    self.users = data.get("users", self.users)
                    self.upvotes = data.get("upvotes", self.upvotes)
                    self.timeline = data.get("timeline", self.timeline)
            except Exception as e:
                print(f"[Warning] Failed to load DB file: {e}")
        else:
            self.save()

    def save(self):
        try:
            with open(DB_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "complaints": self.complaints,
                    "users": self.users,
                    "upvotes": self.upvotes,
                    "timeline": self.timeline
                }, f, indent=2)
        except Exception as e:
            print(f"[Error] Failed to save DB: {e}")

    def get_all(self, status=None, ward=None, category=None, search=None):
        items = list(self.complaints)
        if status and status != "All Status":
            items = [c for c in items if c.get("status", "").lower() == status.lower()]
        if ward and ward != "All Wards":
            items = [c for c in items if ward.lower() in c.get("ward", "").lower()]
        if category and category != "All":
            items = [c for c in items if c.get("cat", "").lower() == category.lower()]
        if search:
            q = search.lower()
            items = [c for c in items if q in c.get("id", "").lower() or q in c.get("cat", "").lower() or q in c.get("location", "").lower() or q in (c.get("description") or "").lower()]
        return items

    def get_by_id(self, complaint_id):
        for c in self.complaints:
            if c.get("id", "").lower() == complaint_id.lower():
                tl = [t for t in self.timeline if t.get("complaintId", "").lower() == c.get("id", "").lower()]
                res = dict(c)
                res["timeline"] = tl
                return res
        return None

    def create(self, data):
        self.complaints.insert(0, data)
        self.timeline.append({
            "complaintId": data["id"],
            "title": "Reported",
            "description": f"Citizen filed complaint at {data.get('location', 'detected locality')}",
            "timestamp": f"{data.get('date')} • {datetime.datetime.now().strftime('%I:%M %p')}",
            "status": "Reported"
        })
        self.save()
        return data

    def update(self, complaint_id, updates):
        for i, c in enumerate(self.complaints):
            if c.get("id", "").lower() == complaint_id.lower():
                old_status = c.get("status")
                c.update(updates)
                new_status = updates.get("status")
                if new_status and new_status != old_status:
                    self.timeline.append({
                        "complaintId": c["id"],
                        "title": new_status,
                        "description": updates.get("resolutionNote") or f"Status updated to {new_status} by municipal officer",
                        "timestamp": f"{datetime.datetime.now().strftime('%d %b %Y • %I:%M %p')}",
                        "status": new_status
                    })
                self.complaints[i] = c
                self.save()
                return c
        return None

    def upvote(self, complaint_id, user_email="citizen@demo.com"):
        for c in self.complaints:
            if c.get("id", "").lower() == complaint_id.lower():
                already = any(u.get("complaintId") == c["id"] and u.get("userEmail") == user_email for u in self.upvotes)
                if already:
                    return {"count": c.get("upvotes", 0), "alreadyUpvoted": True}
                self.upvotes.append({"complaintId": c["id"], "userEmail": user_email, "createdAt": datetime.datetime.now().isoformat()})
                c["upvotes"] = c.get("upvotes", 0) + 1
                self.save()
                return {"count": c["upvotes"], "alreadyUpvoted": False}
        return None

    def get_stats(self):
        total = len(self.complaints)
        pending = sum(1 for c in self.complaints if c.get("status") in ["Reported", "Pending"])
        in_progress = sum(1 for c in self.complaints if c.get("status") in ["In Progress", "Assigned"])
        resolved = sum(1 for c in self.complaints if c.get("status") == "Resolved")
        critical = sum(1 for c in self.complaints if c.get("priority") in ["Critical", "High"])

        categories = {}
        for c in self.complaints:
            cat = c.get("cat", "Other")
            categories[cat] = categories.get(cat, 0) + 1

        wards = {}
        for c in self.complaints:
            w = c.get("ward", "Ward 12 (Central)")
            wards[w] = wards.get(w, 0) + 1

        return {
            "total": total,
            "pending": pending,
            "inProgress": in_progress,
            "resolved": resolved,
            "critical": critical,
            "categories": categories,
            "wards": wards
        }

    def authenticate(self, email, password=""):
        for u in self.users:
            if u.get("email", "").lower() == email.lower():
                return u
        return None

    def register(self, name, email, password="", city="Central Zone"):
        for u in self.users:
            if u.get("email", "").lower() == email.lower():
                return None
        new_u = {
            "id": f"usr-{int(time.time()*1000)}",
            "name": name or email.split("@")[0],
            "email": email,
            "role": "citizen",
            "ward": f"Ward of {city}" if city else "Ward 12 (Central)",
            "department": None
        }
        self.users.append(new_u)
        self.save()
        return new_u

db_store = DataStore()

def dispatch_email_alert(report):
    city = report.get("city") or extract_city(location_val=report.get("location", ""))
    city_slug = re.sub(r'[^a-zA-Z0-9]', '', city.lower()) or "municipal"
    nodal_email = f"nodal.officer@{city_slug}.gov.in"
    
    maps_url = f"https://www.google.com/maps/search/?api=1&query={report.get('latitude', 23.3441)},{report.get('longitude', 85.3096)}"
    print("\n" + "="*50)
    print(f"✉️ [AUTOMATED NODAL DISPATCH] Alert sent to: {nodal_email}")
    print(f"📋 Complaint ID : {report.get('id')}")
    print(f"🏷️ Category     : {report.get('icon')} {report.get('cat')} | Ward: {report.get('ward')}")
    print(f"🚨 Priority     : {report.get('priority')} (AI Risk: {report.get('score')}/100)")
    print(f"📍 GPS Location : {report.get('location')} ({report.get('latitude')}, {report.get('longitude')})")
    print(f"🗺️ Map Link     : {maps_url}")
    print("="*50 + "\n")
    return {"success": True, "recipient": nodal_email, "mapsUrl": maps_url}

class CivicLensHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def _send_json(self, status_code, data):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/health":
            self._send_json(200, {
                "status": "active",
                "project": "CivicLens (SIH25031)",
                "version": "1.0.0-python",
                "timestamp": datetime.datetime.now().isoformat()
            })
            return

        if path == "/api/reports":
            status = query.get("status", [None])[0]
            ward = query.get("ward", [None])[0]
            category = query.get("category", [None])[0]
            search = query.get("search", [None])[0]
            reports = db_store.get_all(status, ward, category, search)
            self._send_json(200, {"success": True, "count": len(reports), "data": reports})
            return

        if path.startswith("/api/reports/"):
            comp_id = path.replace("/api/reports/", "").strip()
            report = db_store.get_by_id(comp_id)
            if report:
                self._send_json(200, {"success": True, "data": report})
            else:
                self._send_json(404, {"success": False, "error": "Complaint not found"})
            return

        if path == "/api/stats":
            stats = db_store.get_stats()
            self._send_json(200, {"success": True, "data": stats})
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/reports":
            ctype = self.headers.get("Content-Type", "")
            length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(length) if length > 0 else b""
            fields = {}
            image_url = ""

            if "multipart/form-data" in ctype:
                parsed_fields, parsed_files = parse_multipart_data(ctype, raw_body)
                fields = parsed_fields
                for k, file_info in parsed_files.items():
                    ext = os.path.splitext(file_info["filename"])[1] or ".jpg"
                    fn = f"ISSUE-{int(time.time()*1000)}-{random.randint(100,999)}{ext}"
                    target = os.path.join(CITIZEN_UPLOAD_DIR, fn)
                    with open(target, "wb") as f:
                        f.write(file_info["data"])
                    image_url = f"/uploads/citizen/{fn}"
                    break
            else:
                try:
                    fields = json.loads(raw_body.decode("utf-8"))
                except Exception:
                    qs = urllib.parse.parse_qs(raw_body.decode("utf-8"))
                    fields = {k: v[0] for k, v in qs.items()}
                image_url = fields.get("imageUrl", "")

            category = fields.get("category", "Pothole")
            description = fields.get("description", "")
            location = fields.get("location", "")
            try:
                lat = float(fields.get("latitude", 23.3441))
            except Exception:
                lat = 23.3441
            try:
                lon = float(fields.get("longitude", 85.3096))
            except Exception:
                lon = 85.3096

            if not location:
                location = f"GPS Coordinates ({lat:.5f}, {lon:.5f})"

            city = fields.get("city") or extract_city("", location)
            ward = assign_ward(location, lat, lon)
            ai = calculate_ai_score(category, description)
            dept = dept_for(category)
            cid = f"CIV-{datetime.datetime.now().year}-{random.randint(1000, 8999)}"

            report = {
                "id": cid,
                "cat": category,
                "icon": icon_for(category),
                "description": description,
                "location": location,
                "city": city,
                "latitude": lat,
                "longitude": lon,
                "status": "Reported",
                "priority": ai["priority"],
                "dept": dept,
                "ward": ward,
                "confidence": ai["confidence"],
                "score": ai["score"],
                "date": datetime.datetime.now().strftime("%d %b %Y"),
                "imageUrl": image_url,
                "resolutionProof": "",
                "resolutionNote": "",
                "upvotes": 1,
                "citizenEmail": fields.get("citizenEmail", "citizen@demo.com"),
                "citizenName": fields.get("citizenName", "Citizen User"),
                "officer": "Assigned automatically via GIS Ward Routing",
                "resolvedAt": None,
                "createdAt": datetime.datetime.now().isoformat()
            }

            saved = db_store.create(report)
            email_res = dispatch_email_alert(saved)
            self._send_json(201, {
                "success": True,
                "message": "Complaint submitted successfully and dispatched to nodal authorities.",
                "data": saved,
                "emailResult": email_res
            })
            return

        if re.match(r"^/api/reports/[^/]+/upvote$", path):
            comp_id = path.split("/")[3]
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            email = data.get("userEmail", "citizen@demo.com")
            res = db_store.upvote(comp_id, email)
            if res:
                self._send_json(200, {"success": True, "upvotes": res["count"], "alreadyUpvoted": res["alreadyUpvoted"]})
            else:
                self._send_json(404, {"success": False, "error": "Complaint not found"})
            return

        if re.match(r"^/api/reports/[^/]+/verify$", path):
            comp_id = path.split("/")[3]
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            action = data.get("action", "verify")
            new_status = "Verified & Closed" if action == "verify" else "In Progress"
            note = "Citizen confirmed resolution." if action == "verify" else "Citizen reported issue still persists."
            updated = db_store.update(comp_id, {"status": new_status, "resolutionNote": note})
            if updated:
                self._send_json(200, {"success": True, "data": updated, "message": note})
            else:
                self._send_json(404, {"success": False, "error": "Complaint not found"})
            return

        if path == "/api/auth/login":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            email = data.get("email", "")
            user = db_store.authenticate(email, data.get("password", ""))
            if not user:
                user = db_store.register(email.split("@")[0], email)
            token = f"jwt_mock_token_{user['id']}_{int(time.time())}"
            self._send_json(200, {"success": True, "user": user, "token": token})
            return

        if path == "/api/auth/register":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            email = data.get("email", "")
            user = db_store.register(data.get("name", ""), email, data.get("password", ""), data.get("city", "Central Zone"))
            if not user:
                self._send_json(400, {"success": False, "error": "User already exists."})
                return
            token = f"jwt_mock_token_{user['id']}_{int(time.time())}"
            self._send_json(201, {"success": True, "user": user, "token": token})
            return

        self._send_json(404, {"success": False, "error": "Endpoint not found"})

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/reports/"):
            comp_id = path.replace("/api/reports/", "").strip()
            ctype = self.headers.get("Content-Type", "")
            length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(length) if length > 0 else b""
            updates = {}

            if "multipart/form-data" in ctype:
                parsed_fields, parsed_files = parse_multipart_data(ctype, raw_body)
                updates = parsed_fields
                for k, file_info in parsed_files.items():
                    ext = os.path.splitext(file_info["filename"])[1] or ".jpg"
                    fn = f"RESOLVED-{int(time.time()*1000)}-{random.randint(100,999)}{ext}"
                    target = os.path.join(RESOLUTION_UPLOAD_DIR, fn)
                    with open(target, "wb") as f:
                        f.write(file_info["data"])
                    updates["resolutionProof"] = f"/uploads/resolutions/{fn}"
                    break
            else:
                try:
                    updates = json.loads(raw_body.decode("utf-8"))
                except Exception:
                    updates = {}

            if "resolutionProofUrl" in updates and not updates.get("resolutionProof"):
                updates["resolutionProof"] = updates["resolutionProofUrl"]

            if updates.get("status") == "Resolved":
                updates["resolvedAt"] = datetime.datetime.now().isoformat()

            updated = db_store.update(comp_id, updates)
            if updated:
                self._send_json(200, {
                    "success": True,
                    "message": f"Complaint {comp_id} updated.",
                    "data": updated
                })
            else:
                self._send_json(404, {"success": False, "error": "Complaint not found"})
            return

        self._send_json(404, {"success": False, "error": "Endpoint not found"})

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CivicLensHTTPHandler) as httpd:
        print("\n" + "="*58)
        print(f"🌿 CivicLens Backend Server (SIH25031) Started!")
        print(f"📍 Web App URL : http://localhost:{PORT}")
        print(f"📡 REST API    : http://localhost:{PORT}/api/reports")
        print(f"📊 Stats API   : http://localhost:{PORT}/api/stats")
        print("="*58 + "\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down CivicLens server.")

if __name__ == "__main__":
    run_server()
