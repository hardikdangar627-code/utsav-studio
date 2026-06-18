// ═══════════════════════════════════════════════════════════════
// THE UTSAV STUDIO — Backend Server
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ── MIDDLEWARE ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (the HTML website)
app.use(express.static(path.join(__dirname)));

// ── DATA STORAGE ───────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'submissions.json');

function loadSubmissions() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading submissions:', e.message);
  }
  return [];
}

function saveSubmission(entry) {
  const submissions = loadSubmissions();
  submissions.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(submissions, null, 2), 'utf8');
}

// ── EMAIL TRANSPORTER ──────────────────────────────────────────
let transporter = null;

async function initTransporter() {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Verify connection
    try {
      await transporter.verify();
      console.log('✉️  Email transporter ready — notifications ON');
    } catch (err) {
      console.warn('⚠️  Email verification failed:', err.message);
      console.warn('   Form submissions will still be saved locally.');
      transporter = null;
    }
  } else {
    console.log('ℹ️  No email credentials found — submissions saved locally only.');
    console.log('   Set EMAIL_USER and EMAIL_PASS in .env to enable email notifications.');
  }
}

async function sendNotificationEmail(data) {
  if (!transporter) return;

  const mailOptions = {
    from: `"Utsav Studio Website" <${process.env.EMAIL_USER}>`,
    to: process.env.NOTIFY_EMAIL || process.env.EMAIL_USER,
    subject: `📸 New Booking Enquiry — ${data.service || 'General'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#FAFAF7;padding:32px;border:1px solid #C9A84C;border-radius:4px;">
        <h2 style="color:#C9A84C;font-size:22px;margin-bottom:8px;">🕉️ The Utsav Studio — New Enquiry</h2>
        <p style="color:#7A6F5A;font-size:14px;margin-bottom:24px;">A new booking request has been submitted through the website.</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px;border-bottom:1px solid #eee;color:#C9A84C;font-weight:bold;width:140px;">👤 Name</td><td style="padding:10px;border-bottom:1px solid #eee;">${data.name || 'N/A'}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee;color:#C9A84C;font-weight:bold;">📱 Phone</td><td style="padding:10px;border-bottom:1px solid #eee;">${data.phone || 'N/A'}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee;color:#C9A84C;font-weight:bold;">✉️ Email</td><td style="padding:10px;border-bottom:1px solid #eee;">${data.email || 'N/A'}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee;color:#C9A84C;font-weight:bold;">📅 Event Date</td><td style="padding:10px;border-bottom:1px solid #eee;">${data.date || 'Not specified'}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee;color:#C9A84C;font-weight:bold;">🎬 Service</td><td style="padding:10px;border-bottom:1px solid #eee;">${data.service || 'N/A'}</td></tr>
          <tr><td style="padding:10px;color:#C9A84C;font-weight:bold;vertical-align:top;">💬 Message</td><td style="padding:10px;line-height:1.6;">${data.message || 'No message'}</td></tr>
        </table>
        <p style="color:#999;font-size:12px;margin-top:24px;">Submitted at: ${new Date(data.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Notification email sent for:', data.name);
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
  }
}

// ── API ROUTES ─────────────────────────────────────────────────

// POST /api/contact — Handle contact form submissions
app.post('/api/contact', async (req, res) => {
  try {
    const { name, phone, email, date, service, message } = req.body;

    // Basic validation
    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone number are required.',
      });
    }

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : '',
      date: date || '',
      service: service || '',
      message: message ? message.trim() : '',
      submittedAt: new Date().toISOString(),
    };

    // Save to JSON file
    saveSubmission(entry);
    console.log(`📩 New submission from: ${entry.name} (${entry.phone})`);

    // Send email notification (non-blocking)
    sendNotificationEmail(entry).catch(() => {});

    res.json({
      success: true,
      message: 'Thank you! We\'ll contact you within 24 hours.',
      id: entry.id,
    });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/submissions — View all submissions (protected by simple key)
app.get('/api/submissions', (req, res) => {
  const key = req.query.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const submissions = loadSubmissions();
  res.json({ total: submissions.length, submissions });
});

// DELETE /api/submissions/:id — Delete a submission
app.delete('/api/submissions/:id', (req, res) => {
  const key = req.query.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const submissions = loadSubmissions();
  const filtered = submissions.filter((s) => s.id !== req.params.id);

  if (filtered.length === submissions.length) {
    return res.status(404).json({ error: 'Submission not found.' });
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(filtered, null, 2), 'utf8');
  res.json({ success: true, message: 'Submission deleted.' });
});

// POST /api/chat — AI Chat proxy (keeps API key server-side)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.json({
        reply: 'Thanks for your interest! Please reach us on WhatsApp: 9537662251 📱 for the quickest response.',
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `You are a warm, friendly assistant for THE UTSAV STUDIO, a premium wedding photography & cinematography studio based in India. 

Answer concisely (2-4 sentences). Be polite and helpful.

Services offered:
• Wedding Photography
• Cinematic Wedding Films  
• Pre-Wedding Photography
• Engagement Photography & Films
• Maternity Photography
• Baby & Family Photography
• Event Photography & Videography
• Reels & Social Media Content
• Album Designing & Premium Prints
• Drone Photography & Videography

For pricing, always direct to WhatsApp: 9537662251
Instagram: @the_utsav_studio
Google Reviews: https://share.google/TR4TEB9vTRTbCA0PC

Always end with a warm tone. If someone asks about booking, suggest they fill the contact form or WhatsApp directly.`,
        messages: messages.slice(-10), // Keep last 10 messages for context
      }),
    });

    const data = await response.json();
    const reply =
      data.content?.find((c) => c.type === 'text')?.text ||
      'Please reach us on WhatsApp: 9537662251 📱';

    res.json({ reply });
  } catch (err) {
    console.error('Chat API error:', err.message);
    res.json({
      reply: 'Please reach us on WhatsApp: 9537662251 📱 for the quickest response!',
    });
  }
});

// GET / — Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'utsav-html.html'));
});

// ── START SERVER ───────────────────────────────────────────────
const HOST = '0.0.0.0';
app.listen(PORT, HOST, async () => {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  🕉️  THE UTSAV STUDIO — Server Running');
  console.log('═══════════════════════════════════════════════');
  console.log(`  🌐 Website:  http://${HOST}:${PORT}`);
  console.log(`  📬 API:      http://${HOST}:${PORT}/api/contact`);
  console.log(`  💬 Chat:     http://${HOST}:${PORT}/api/chat`);
  console.log('═══════════════════════════════════════════════');
  console.log('');

  await initTransporter();
});
