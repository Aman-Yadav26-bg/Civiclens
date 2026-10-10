const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { sendReportNotification } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'civiclens_sih25031_secret_key_2026';

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Ensure upload directories exist
const uploadDir = path.join(__dirname, 'uploads');
const citizenUploadDir = path.join(uploadDir, 'citizen');
const resolutionUploadDir = path.join(uploadDir, 'resolutions');
[uploadDir, citizenUploadDir, resolutionUploadDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Serve uploaded media statically
app.use('/uploads', express.static(uploadDir));
// Serve frontend static assets
app.use(express.static(__dirname));

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'resolutionProof') {
      cb(null, resolutionUploadDir);
    } else {
      cb(null, citizenUploadDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const prefix = file.fieldname === 'resolutionProof' ? 'RESOLVED' : 'ISSUE';
    cb(null, `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

// ==========================================
// Database Layer (SQLite with JSON store fallback)
// ==========================================
let db = null;
const DB_FILE = path.join(__dirname, 'civiclens.db');
const JSON_DB_FILE = path.join(__dirname, 'civiclens_store.json');

// Icon helper
function iconFor(cat) {
  const map = {
    Pothole: '🕳️',
    Garbage: '🗑️',
    'Street Light': '💡',
    'Water Leakage': '🚰',
    'Damaged Road': '🚧',
    Drainage: '🌧️',
    Sanitation: '🚽',
    Environment: '🌳',
    Other: '📍',
  };
  return map[cat] || '📍';
}

// Department helper
function deptFor(cat) {
  if (cat === 'Garbage' || cat === 'Sanitation') return 'Sanitation Department';
  if (cat === 'Water Leakage' || cat === 'Drainage') return 'Water Supply & Sewerage';
  if (cat === 'Street Light') return 'Electricity & Lighting';
  if (cat === 'Environment') return 'Environment & Parks';
  return 'Public Works Department';
}

// Auto-assign Ward ID based on coordinates or address
function assignWard(location, lat, lon) {
  const loc = (location || '').toLowerCase();
  if (loc.includes('sector 12') || loc.includes('harmu') || (lat && lat < 23.34)) {
    return 'Ward 12 (Central)';
  }
  if (loc.includes('morabadi') || loc.includes('tagore') || (lat && lat > 23.38)) {
    return 'Ward 07 (North)';
  }
  if (loc.includes('lalpur') || loc.includes('circular') || (lon && lon > 85.33)) {
    return 'Ward 04 (East)';
  }
  if (loc.includes('doranda') || loc.includes('hinoo') || (lat && lat < 23.32)) {
    return 'Ward 15 (South)';
  }
  return 'Ward 12 (Central)';
}

// AI Priority & Risk calculation
function calculateAIScore(cat, description = '') {
  const text = description.toLowerCase();
  let baseScore = 75;
  let priority = 'Medium';
  let confidence = Math.floor(88 + Math.random() * 10);

  if (cat === 'Water Leakage' || cat === 'Damaged Road') {
    baseScore = 85;
    priority = 'High';
  } else if (cat === 'Pothole') {
    baseScore = 87;
    priority = 'High';
  } else if (cat === 'Garbage') {
    baseScore = 65;
    priority = 'Medium';
  } else if (cat === 'Street Light') {
    baseScore = 45;
    priority = 'Low';
  }

  if (text.includes('danger') || text.includes('hazard') || text.includes('critical') || text.includes('flood') || text.includes('accident') || text.includes('emergency')) {
    baseScore = Math.min(99, baseScore + 12);
    priority = 'Critical';
  }

  return { score: baseScore, priority, confidence };
}

function extractCity(cityVal = '', locationVal = '') {
  if (cityVal && cityVal.trim() && cityVal.trim().toLowerCase() !== 'municipal zone') {
    return cityVal.trim();
  }
  if (locationVal) {
    const parts = locationVal.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 2].replace(/[\d\-]+/g, '').trim();
      if (candidate && candidate.length > 1) return candidate;
    } else if (parts.length === 1) {
      const candidate = parts[0].replace(/[\d\-]+/g, '').trim();
      if (candidate) return candidate;
    }
  }
  return 'Municipal';
}

// Initial Seed Data
const initialComplaints = [
  {
    id: 'CIV-2026-1048',
    cat: 'Pothole',
    icon: '🕳️',
    description: 'A large pothole near the main crossroads is creating a safety hazard for two-wheelers and heavy vehicles.',
    location: 'Sector 12, Central Zone',
    city: 'Central Zone',
    latitude: 23.3441,
    longitude: 85.3096,
    status: 'In Progress',
    priority: 'High',
    dept: 'Public Works Department',
    ward: 'Ward 12 (Central)',
    confidence: 92,
    score: 87,
    date: '21 Aug 2026',
    imageUrl: '',
    resolutionProof: '',
    resolutionNote: 'Field team dispatched with cold asphalt mix.',
    upvotes: 14,
    citizenEmail: 'citizen@demo.com',
    officer: 'Rahul Kumar (PWD)',
    resolvedAt: null,
  },
  {
    id: 'CIV-2026-1047',
    cat: 'Garbage',
    icon: '🗑️',
    description: 'Unattended municipal garbage dump accumulating near the public ground, emitting foul smell.',
    location: 'Morabadi Area, North Zone',
    city: 'North Zone',
    latitude: 23.3855,
    longitude: 85.3347,
    status: 'Resolved',
    priority: 'Medium',
    dept: 'Sanitation Department',
    ward: 'Ward 07 (North)',
    confidence: 96,
    score: 61,
    date: '20 Aug 2026',
    imageUrl: '',
    resolutionProof: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop&q=80',
    resolutionNote: 'Garbage truck deployed. Site sanitized and cleared.',
    upvotes: 8,
    citizenEmail: 'citizen@demo.com',
    officer: 'Priya Sharma (Sanitation)',
    resolvedAt: '2026-08-20T16:45:00Z',
  },
  {
    id: 'CIV-2026-1042',
    cat: 'Street Light',
    icon: '💡',
    description: 'Four consecutive LED street light poles not functional, causing dark patches at night.',
    location: 'Lalpur Main Market, East Zone',
    city: 'East Zone',
    latitude: 23.3702,
    longitude: 85.3382,
    status: 'Assigned',
    priority: 'Low',
    dept: 'Electricity & Lighting',
    ward: 'Ward 04 (East)',
    confidence: 89,
    score: 38,
    date: '18 Aug 2026',
    imageUrl: '',
    resolutionProof: '',
    resolutionNote: '',
    upvotes: 5,
    citizenEmail: 'citizen@demo.com',
    officer: 'Amit Verma (Electricity)',
    resolvedAt: null,
  },
  {
    id: 'CIV-2026-1039',
    cat: 'Water Leakage',
    icon: '🚰',
    description: 'Major underground pipeline burst leading to continuous road flooding and potable water loss.',
    location: 'Harmu Housing Colony, South-Central Zone',
    city: 'Central Zone',
    latitude: 23.3512,
    longitude: 85.3121,
    status: 'Reported',
    priority: 'Critical',
    dept: 'Water Supply & Sewerage',
    ward: 'Ward 12 (Central)',
    confidence: 94,
    score: 95,
    date: '17 Aug 2026',
    imageUrl: '',
    resolutionProof: '',
    resolutionNote: '',
    upvotes: 23,
    citizenEmail: 'citizen@demo.com',
    officer: 'Sanjay Singh (Water)',
    resolvedAt: null,
  },
];

const initialUsers = [
  { id: 'usr-1', name: 'Aditya Citizen', email: 'citizen@demo.com', password: 'password123', role: 'citizen', ward: 'Ward 12 (Central)', department: null },
  { id: 'usr-2', name: 'Rahul Kumar (Officer)', email: 'officer@demo.com', password: 'password123', role: 'officer', ward: 'Ward 12 (Central)', department: 'Public Works Department' },
  { id: 'usr-3', name: 'Priya Sharma (Officer)', email: 'officer2@demo.com', password: 'password123', role: 'officer', ward: 'Ward 07 (North)', department: 'Sanitation Department' },
  { id: 'usr-4', name: 'Chief Municipal Admin', email: 'admin@demo.com', password: 'password123', role: 'admin', ward: 'All Wards', department: 'Municipal Corporation HQ' },
];

// Universal Storage Engine
class StoreEngine {
  constructor() {
    this.complaints = [...initialComplaints];
    this.users = [...initialUsers];
    this.upvotes = [];
    this.timeline = [
      { complaintId: 'CIV-2026-1048', title: 'Reported', description: 'Citizen submitted report with GPS & photo', timestamp: '21 Aug 2026 • 10:20 AM', status: 'Reported' },
      { complaintId: 'CIV-2026-1048', title: 'Assigned', description: 'Assigned to Public Works Department (Ward 12)', timestamp: '21 Aug 2026 • 11:10 AM', status: 'Assigned' },
      { complaintId: 'CIV-2026-1048', title: 'In Progress', description: 'Officer Rahul Kumar initiated ground repair', timestamp: '21 Aug 2026 • 01:45 PM', status: 'In Progress' },
      { complaintId: 'CIV-2026-1047', title: 'Reported', description: 'Citizen report logged', timestamp: '20 Aug 2026 • 09:15 AM', status: 'Reported' },
      { complaintId: 'CIV-2026-1047', title: 'Resolved', description: 'Sanitation team completed site clearance and uploaded photo proof', timestamp: '20 Aug 2026 • 04:45 PM', status: 'Resolved' },
    ];
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(JSON_DB_FILE)) {
        const raw = fs.readFileSync(JSON_DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.complaints) this.complaints = parsed.complaints;
        if (parsed.users) this.users = parsed.users;
        if (parsed.upvotes) this.upvotes = parsed.upvotes;
        if (parsed.timeline) this.timeline = parsed.timeline;
      } else {
        this.save();
      }
    } catch (e) {
      console.warn('Using in-memory store:', e.message);
    }
  }

  save() {
    try {
      fs.writeFileSync(JSON_DB_FILE, JSON.stringify({
        complaints: this.complaints,
        users: this.users,
        upvotes: this.upvotes,
        timeline: this.timeline,
      }, null, 2));
    } catch (e) {
      console.error('Save error:', e.message);
    }
  }

  getAll(filters = {}) {
    let list = [...this.complaints];
    if (filters.status && filters.status !== 'All Status') {
      list = list.filter((c) => c.status.toLowerCase() === filters.status.toLowerCase());
    }
    if (filters.ward && filters.ward !== 'All Wards') {
      list = list.filter((c) => c.ward && c.ward.toLowerCase().includes(filters.ward.toLowerCase()));
    }
    if (filters.category && filters.category !== 'All') {
      list = list.filter((c) => c.cat.toLowerCase() === filters.category.toLowerCase());
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((c) => c.id.toLowerCase().includes(q) || c.cat.toLowerCase().includes(q) || c.location.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q)));
    }
    return list;
  }

  getById(id) {
    const comp = this.complaints.find((c) => c.id.toLowerCase() === id.toLowerCase());
    if (!comp) return null;
    const tl = this.timeline.filter((t) => t.complaintId === comp.id);
    return { ...comp, timeline: tl };
  }

  create(reportData) {
    this.complaints.unshift(reportData);
    this.timeline.push({
      complaintId: reportData.id,
      title: 'Reported',
      description: `Citizen filed complaint at ${reportData.location}`,
      timestamp: `${reportData.date} • ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
      status: 'Reported',
    });
    this.save();
    return reportData;
  }

  update(id, updates) {
    const idx = this.complaints.findIndex((c) => c.id.toLowerCase() === id.toLowerCase());
    if (idx === -1) return null;
    const old = this.complaints[idx];
    const updated = { ...old, ...updates };

    if (updates.status && updates.status !== old.status) {
      this.timeline.push({
        complaintId: old.id,
        title: updates.status,
        description: updates.resolutionNote || `Status updated to ${updates.status} by municipal team`,
        timestamp: `${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
        status: updates.status,
      });
    }

    this.complaints[idx] = updated;
    this.save();
    return updated;
  }

  upvote(id, userEmail = 'anonymous') {
    const comp = this.complaints.find((c) => c.id.toLowerCase() === id.toLowerCase());
    if (!comp) return null;
    const already = this.upvotes.find((u) => u.complaintId === comp.id && u.userEmail === userEmail);
    if (already) {
      return { count: comp.upvotes || 0, alreadyUpvoted: true };
    }
    this.upvotes.push({ complaintId: comp.id, userEmail, createdAt: new Date().toISOString() });
    comp.upvotes = (comp.upvotes || 0) + 1;
    this.save();
    return { count: comp.upvotes, alreadyUpvoted: false };
  }

  getStats() {
    const total = this.complaints.length;
    const pending = this.complaints.filter((c) => c.status === 'Reported' || c.status === 'Pending').length;
    const inProgress = this.complaints.filter((c) => c.status === 'In Progress' || c.status === 'Assigned').length;
    const resolved = this.complaints.filter((c) => c.status === 'Resolved').length;
    const critical = this.complaints.filter((c) => c.priority === 'Critical' || c.priority === 'High').length;

    const categories = {};
    this.complaints.forEach((c) => {
      categories[c.cat] = (categories[c.cat] || 0) + 1;
    });

    const wards = {};
    this.complaints.forEach((c) => {
      const w = c.ward || 'Ward 12 (Central)';
      wards[w] = (wards[w] || 0) + 1;
    });

    return { total, pending, inProgress, resolved, critical, categories, wards };
  }

  authenticate(email, password) {
    const user = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return null;
    // For demo convenience, accept any non-empty password or exact match
    return user;
  }

  register(userData) {
    const exists = this.users.find((u) => u.email.toLowerCase() === userData.email.toLowerCase());
    if (exists) return null;
    const newUser = {
      id: `usr-${Date.now()}`,
      name: userData.name || 'Citizen User',
      email: userData.email,
      password: userData.password || 'password123',
      role: 'citizen',
      ward: userData.city ? `Ward of ${userData.city}` : 'Ward 12 (Central)',
      department: null,
    };
    this.users.push(newUser);
    this.save();
    return newUser;
  }
}

const store = new StoreEngine();

// ==========================================
// REST API ENDPOINTS
// ==========================================

// 1. Health check & Info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'active',
    project: 'CivicLens (SIH25031)',
    version: '1.0.0-mvp',
    timestamp: new Date().toISOString(),
  });
});

// 2. Fetch all reports with query filters
app.get('/api/reports', (req, res) => {
  try {
    const { status, ward, category, search } = req.query;
    const reports = store.getAll({ status, ward, category, search });
    res.json({ success: true, count: reports.length, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Fetch single report by ID
app.get('/api/reports/:id', (req, res) => {
  try {
    const report = store.getById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Complaint not found.' });
    }
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Create new citizen report (with live GPS, AI scoring & automated email dispatch)
app.post('/api/reports', upload.single('image'), async (req, res) => {
  try {
    const {
      category = 'Pothole',
      description = '',
      location = '',
      city: passedCity,
      latitude,
      longitude,
      citizenEmail = 'citizen@demo.com',
      citizenName = 'Citizen User',
    } = req.body;

    const lat = latitude ? parseFloat(latitude) : 23.3441;
    const lon = longitude ? parseFloat(longitude) : 85.3096;
    const resolvedLocation = location || `GPS Coordinates (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
    const city = passedCity || extractCity('', resolvedLocation);
    const ward = assignWard(resolvedLocation, lat, lon);
    const aiAnalysis = calculateAIScore(category, description);
    const id = `CIV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;
    const dept = deptFor(category);

    let imageUrl = '';
    if (req.file) {
      imageUrl = `/uploads/citizen/${req.file.filename}`;
    } else if (req.body.imageUrl) {
      imageUrl = req.body.imageUrl;
    }

    const newReport = {
      id,
      cat: category,
      icon: iconFor(category),
      description,
      location: resolvedLocation,
      city,
      latitude: lat,
      longitude: lon,
      status: 'Reported',
      priority: aiAnalysis.priority,
      dept,
      ward,
      confidence: aiAnalysis.confidence,
      score: aiAnalysis.score,
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      imageUrl,
      resolutionProof: '',
      resolutionNote: '',
      upvotes: 1,
      citizenEmail,
      citizenName,
      officer: 'Assigned automatically via GIS Ward Routing',
      resolvedAt: null,
      createdAt: new Date().toISOString(),
    };

    const saved = store.create(newReport);

    // Automated Email Dispatch to Municipal Nodal Officer
    const emailResult = await sendReportNotification(saved);

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully and dispatched to nodal authorities.',
      data: saved,
      emailResult,
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Upvote an existing report to prevent duplicates
app.post('/api/reports/:id/upvote', (req, res) => {
  try {
    const { userEmail = 'citizen@demo.com' } = req.body;
    const result = store.upvote(req.params.id, userEmail);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Complaint not found.' });
    }
    res.json({ success: true, upvotes: result.count, alreadyUpvoted: result.alreadyUpvoted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Officer desk: Update complaint status & upload mandatory resolution proof photo
app.patch('/api/reports/:id', upload.single('resolutionProof'), (req, res) => {
  try {
    const { status, resolutionNote, officerName } = req.body;
    const updates = {};

    if (status) updates.status = status;
    if (resolutionNote) updates.resolutionNote = resolutionNote;
    if (officerName) updates.officer = officerName;

    if (req.file) {
      updates.resolutionProof = `/uploads/resolutions/${req.file.filename}`;
    } else if (req.body.resolutionProofUrl) {
      updates.resolutionProof = req.body.resolutionProofUrl;
    }

    if (status === 'Resolved') {
      updates.resolvedAt = new Date().toISOString();
    }

    const updated = store.update(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Complaint not found.' });
    }

    res.json({
      success: true,
      message: `Complaint ${req.params.id} updated to "${status}".`,
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Citizen verification: verify resolution or reopen
app.post('/api/reports/:id/verify', (req, res) => {
  try {
    const { action } = req.body; // 'verify' or 'reopen'
    const newStatus = action === 'verify' ? 'Verified & Closed' : 'In Progress';
    const note = action === 'verify' ? 'Citizen confirmed successful resolution.' : 'Citizen reported issue still persists. Sent back to field team.';

    const updated = store.update(req.params.id, { status: newStatus, resolutionNote: note });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Complaint not found.' });
    }
    res.json({ success: true, data: updated, message: note });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Aggregated statistics for Dashboards & Admin
app.get('/api/stats', (req, res) => {
  try {
    const stats = store.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Authentication: Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }
    const user = store.authenticate(email, password);
    if (!user) {
      // Auto-register on the fly for demo if not found
      const newUser = store.register({ email, name: email.split('@')[0] });
      const token = jwt.sign({ id: newUser.id, role: newUser.role, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, user: newUser, token });
    }

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, user, token });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Authentication: Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password, city } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }
    const user = store.register({ name, email, password, city });
    if (!user) {
      return res.status(400).json({ success: false, error: 'User already exists.' });
    }
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, user, token });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🌿 CivicLens Server (SIH25031) Running on Port ${PORT}`);
  console.log(`📍 Web URL: http://localhost:${PORT}`);
  console.log(`📡 REST API: http://localhost:${PORT}/api/reports`);
  console.log(`=================================================\n`);
});
