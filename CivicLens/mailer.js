const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log('✓ Custom SMTP Transporter initialized.');
  } else {
    try {
      // Create Ethereal test account for instant out-of-the-box demo without credentials
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log(`✓ Ethereal Test SMTP active (User: ${testAccount.user})`);
    } catch (err) {
      console.warn('⚠️ Could not connect to Ethereal, falling back to simulated mailer:', err.message);
      transporter = null;
    }
  }
  return transporter;
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

/**
 * Dispatch automated email notification to Municipal Nodal Officer
 * @param {Object} report Report data object
 */
async function sendReportNotification(report) {
  const detectedCity = report.city || extractCity('', report.location || '');
  const citySlug = detectedCity.toLowerCase().replace(/[^a-z0-9]/g, '') || 'municipal';
  const nodalOfficerEmail = process.env.NODAL_OFFICER_EMAIL || `nodal.officer@${citySlug}.gov.in`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${report.latitude || 23.3441},${report.longitude || 85.3096}`;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${report.latitude || 23.3441}&mlon=${report.longitude || 85.3096}#map=17/${report.latitude || 23.3441}/${report.longitude || 85.3096}`;

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f8f5; margin: 0; padding: 20px; color: #17352b; }
      .container { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #dbe7df; box-shadow: 0 4px 15px rgba(0,0,0,0.06); }
      .header { background: #16834b; color: #ffffff; padding: 24px; text-align: center; }
      .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
      .header p { margin: 6px 0 0; opacity: 0.9; font-size: 13px; letter-spacing: 0.5px; }
      .content { padding: 24px; }
      .badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
      .badge-high { background: #ffebeb; color: #d33a3a; }
      .badge-med { background: #fff8d9; color: #9b7b00; }
      .badge-low { background: #eaf7ef; color: #20834d; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 20px 0; }
      .card { background: #f8fbf9; padding: 12px; border-radius: 8px; border: 1px solid #e7eee9; }
      .card small { color: #6e7e76; font-size: 11px; display: block; text-transform: uppercase; }
      .card b { font-size: 14px; color: #17352b; margin-top: 3px; display: block; }
      .photo-box { text-align: center; margin: 20px 0; background: #edf5f0; border-radius: 10px; padding: 12px; }
      .photo-box img { max-width: 100%; max-height: 280px; border-radius: 8px; object-fit: cover; }
      .btn { display: inline-block; background: #16834b; color: #ffffff !important; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: bold; font-size: 14px; margin-right: 10px; }
      .btn-osm { background: #375345; }
      .footer { background: #f2f7f4; padding: 16px; text-align: center; font-size: 12px; color: #76877e; border-top: 1px solid #e3ede6; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>🌿 CivicLens • Municipal Alert</h1>
        <p>SMART INDIA HACKATHON 2026 • SIH25031 DISPATCH</p>
      </div>
      <div class="content">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #edf1ee; padding-bottom:12px;">
          <div>
            <h2 style="margin:0; font-size:18px;">${report.id}</h2>
            <span style="color:#607369; font-size:13px;">Filed: ${report.date || new Date().toLocaleString('en-IN')}</span>
          </div>
          <span class="badge ${report.priority === 'Critical' || report.priority === 'High' ? 'badge-high' : 'badge-med'}">
            ${report.priority} Priority (${report.score || 85}/100)
          </span>
        </div>

        <p style="margin:16px 0; font-size:14px; line-height:1.6;">
          <strong>Citizen Description:</strong> ${report.description || 'No additional description provided.'}
        </p>

        <div class="grid">
          <div class="card">
            <small>Category</small>
            <b>${report.icon || '📍'} ${report.cat}</b>
          </div>
          <div class="card">
            <small>Assigned Department</small>
            <b>${report.dept || 'Public Works Department'}</b>
          </div>
          <div class="card">
            <small>Assigned Ward</small>
            <b>${report.ward || 'Ward 12 (Central)'}</b>
          </div>
          <div class="card">
            <small>AI Vision Confidence</small>
            <b>${report.confidence || 92}% Match</b>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <small>GPS Location & Address</small>
          <b>${report.location || 'Captured GPS Coordinates'}</b>
          <span style="font-size:12px; color:#5b6d64; display:block; margin-top:3px;">
            Coordinates: ${report.latitude ? report.latitude.toFixed(5) : '23.34410'}, ${report.longitude ? report.longitude.toFixed(5) : '85.30960'}
          </span>
        </div>

        ${report.imageUrl ? `
        <div class="photo-box">
          <p style="margin:0 0 8px; font-weight:600; font-size:13px; color:#2d4d3e;">📸 Citizen Uploaded Photo</p>
          <img src="${report.imageUrl}" alt="Issue Photo" />
        </div>
        ` : ''}

        <div style="margin:24px 0 10px; text-align:center;">
          <a href="${mapsUrl}" target="_blank" class="btn">📍 Open in Google Maps</a>
          <a href="${osmUrl}" target="_blank" class="btn btn-osm">🗺️ OpenStreetMap</a>
        </div>
      </div>
      <div class="footer">
        Automated civic issue notification generated by CivicLens AI Dispatch Engine.<br>
        ${detectedCity} Municipal Corporation • Civic Administration Portal
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    const mail = await getTransporter();
    const mailOptions = {
      from: process.env.SMTP_FROM || '"CivicLens Municipal Dispatch" <alerts@civiclens.gov.in>',
      to: nodalOfficerEmail,
      subject: `🚨 [${report.priority} Priority] ${report.cat} Reported in ${report.ward || 'Ward 12'} (${report.id})`,
      text: `New Civic Complaint: ${report.id}\nCategory: ${report.cat}\nLocation: ${report.location}\nGPS: ${report.latitude}, ${report.longitude}\nPriority: ${report.priority}\nWard: ${report.ward}\nMaps: ${mapsUrl}`,
      html: htmlContent,
    };

    if (mail) {
      const info = await mail.sendMail(mailOptions);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`✉️ Email dispatched to ${nodalOfficerEmail} (Message ID: ${info.messageId})`);
      if (previewUrl) {
        console.log(`🔗 Ethereal Email Preview: ${previewUrl}`);
      }
      return { success: true, messageId: info.messageId, previewUrl: previewUrl || null, recipient: nodalOfficerEmail };
    } else {
      console.log(`✉️ [Simulated Dispatch] Email constructed for ${nodalOfficerEmail} for issue ${report.id}`);
      return { success: true, simulated: true, recipient: nodalOfficerEmail, mapsUrl };
    }
  } catch (error) {
    console.error('❌ Error sending email notification:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendReportNotification };
