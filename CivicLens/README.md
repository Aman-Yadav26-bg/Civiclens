# CivicLens - SIH25031 Full-Stack MVP

> **Smart Civic Issue Reporting & Management Platform for Smart India Hackathon (SIH25031)**

CivicLens transforms civic reporting into an end-to-end transparent municipal workflow featuring **Live Geolocation with OpenStreetMap & Leaflet.js**, **AI Vision Risk Scoring**, **Automated Email Alerts to Nodal Officers**, **Ward-based Field Officer Resolution with Mandatory Photo Proof**, and a **Community Upvoting Engine** to prevent duplicate complaints.

---

## 🌟 Key Features

1. **Live Geolocation & Reverse Geocoding (`report.html`)**:
   - `navigator.geolocation` acquires high-accuracy GPS coordinates.
   - OpenStreetMap Nominatim reverse geocoding auto-populates exact street addresses.
   - Interactive Leaflet.js map with a draggable marker.
   - GIS auto-assignment to municipal Ward IDs (e.g. Ward 12 Central, Ward 07 North, Ward 04 East, Ward 15 South).

2. **Dynamic Complaints Tracker & Upvoting (`complaints.html` & `issue.html`)**:
   - Color-coded status badges (**Red**: Reported / Pending, **Yellow**: In Progress / Assigned, **Green**: Resolved).
   - Multi-tier filtering by Status, Category, and Ward.
   - Client-side upvoting engine preventing duplicate reports for the same locality.
   - Live Before-and-After photo audit: Citizen Issue photo vs. Officer Resolution Proof photo.

3. **Field Officer Resolution Desk (`officer.html`)**:
   - Role-based secured desk for municipal engineers.
   - Ward and Department filtering.
   - Mandatory **"After Resolution Photo"** proof upload before marking tickets as "Resolved".
   - Real-time status progression (`Reported` -> `Assigned` -> `In Progress` -> `Resolved` -> `Verified & Closed`).

4. **Automated Nodal Officer Email Dispatcher**:
   - Automatically formats and emails an executive summary containing Complaint ID, Category, Ward ID, AI Risk Score, GPS coordinates, Google Maps link, and Citizen Image to the municipal nodal officer upon submission.

5. **Admin Command & GIS Heatmap (`admin.html`)**:
   - Live aggregated KPI metrics (`/api/stats`).
   - Interactive Leaflet.js city-wide issue density map with priority-colored pins.
   - Department SLA performance tracking.

---

## 🚀 How to Run the Project

You can run CivicLens using either the **Python Server** (ready out-of-the-box on your machine) or the **Node.js/Express Server**.

### Option A: Running with Python 3 (Instant - Zero Extra Dependencies)

CivicLens includes a standalone server `app.py` built with Python standard libraries:

```bash
# In the project directory:
python app.py
```

- **Web App URL**: [http://localhost:5000](http://localhost:5000)
- **REST API Endpoint**: [http://localhost:5000/api/reports](http://localhost:5000/api/reports)

---

### Option B: Running with Node.js & Express

```bash
# 1. Install dependencies
npm install express nodemailer cors dotenv multer jsonwebtoken bcryptjs sqlite3

# 2. (Optional) Configure .env with your custom SMTP credentials

# 3. Start the server
npm start
# or for auto-reload during development:
npm run dev
```

---

## 🔑 Demo Login Credentials (1-Click in `login.html`)

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Citizen** | `citizen@demo.com` | `password123` | Report issues, upvote, track journey, verify resolution |
| **Field Officer** | `officer@demo.com` | `password123` | Officer Desk (`officer.html`), Ward filtering, resolution photo upload |
| **Admin** | `admin@demo.com` | `password123` | Full Command Center (`admin.html`), GIS Heatmap, city stats |

---

## 📡 REST API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status |
| `GET` | `/api/reports` | Fetch all reports with query filters (`status`, `ward`, `category`, `search`) |
| `GET` | `/api/reports/:id` | Fetch specific complaint with timeline and upvotes |
| `POST` | `/api/reports` | Create new complaint with multipart photo, GPS, auto-ward, and email alert |
| `POST` | `/api/reports/:id/upvote` | Upvote an existing complaint |
| `PATCH` | `/api/reports/:id` | Officer updates status and uploads mandatory resolution photo |
| `POST` | `/api/reports/:id/verify` | Citizen verifies resolution or reopens ticket |
| `GET` | `/api/stats` | Aggregated analytics for Dashboards |
| `POST` | `/api/auth/login` | Authenticate user and issue JWT token |
| `POST` | `/api/auth/register` | Register new citizen account |

---

## 🏆 Smart India Hackathon Presentation Flow

1. **Spot & Report**: Open `report.html`, click **"Use My Location"** to show live GPS + OpenStreetMap reverse geocoding + Leaflet pin. Upload a photo to see the simulated AI vision classification and severity score.
2. **Automated Alert**: Submit report -> Observe the automated nodal email dispatch log in the server console with clickable Google Maps URL.
3. **Public Upvoting**: Open `complaints.html` -> click **"👍 Upvote"** to demonstrate duplicate prevention.
4. **Officer Field Action**: Log in as `officer@demo.com` -> open `officer.html` -> filter by Ward 12 -> click **"Action →"** -> upload resolution photo and mark **"Resolved"**.
5. **Resolution Audit**: Open `issue.html?id=...` -> show the **Before (Citizen) vs After (Officer Proof)** photo comparison.
6. **Command Center**: Open `admin.html` -> show live analytics and city-wide Leaflet GIS issue heatmap.
