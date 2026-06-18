// ═══════════════════════════════════════════════════════════════
// THE UTSAV STUDIO — Backend Server (Vercel Compatible)
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ── MIDDLEWARE ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (the HTML website)
app.use(express.static(path.join(__dirname)));

// ── IN-MEMORY STORAGE (Vercel ke liye) ────────────────────────
// NOTE: Vercel serverless hai — file system permanent nahi hota.
// Submissions memory mein rahenge (server restart pe reset honge).
// Permanent storage ke liye database use karo (MongoDB Atlas free tier).
let submissions = [];

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

    try {
      await transporter.verify();
      console.log('✉️  Email transporter ready — notifications ON');
    } catch (err) {
      console.warn('⚠️  Email verification failed:', err.message);
      console.warn('   EMAIL_USER aur EMAIL_PASS check karo .env mein.');
      transporter = null;
    }
  } else {
    console.log('ℹ️  EMAIL_USER / EMAIL_PASS nahi mila — email band hai.');
    console.log('   Vercel > Settings > Environment Variables mein daalo.');
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
        <div style="margin-top:24px;padding:16px;background:#fff8e7;border-radius:4px;border-left:4px solid #C9A84C;">
          <p style="margin:0;color:#7A6F5A;font-size:13px;">📱 Client ko WhatsApp karo: <a href="https://wa.me/91${data.phone}" style="color:#C9A84C;">wa.me/91${data.phone}</a></p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Email bhej di:', data.name);
  } catch (err) {
    console.error('❌ Email nahi gayi:', err.message);
  }
}

// ── API ROUTES ─────────────────────────────────────────────────

// POST /api/contact — Form submission handle karo
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

    // Memory mein save karo (Vercel compatible)
    submissions.push(entry);
    console.log(`📩 New submission: ${entry.name} (${entry.phone})`);

    // Email bhejo (non-blocking)
    sendNotificationEmail(entry).catch(() => {});

    res.json({
      success: true,
      message: "Thank you! We'll contact you within 24 hours.",
      id: entry.id,
    });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/submissions — Saari submissions dekho (admin only)
app.get('/api/submissions', (req, res) => {
  const key = req.query.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  res.json({ total: submissions.length, submissions });
});

// DELETE /api/submissions/:id — Ek submission delete karo
app.delete('/api/submissions/:id', (req, res) => {
  const key = req.query.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const before = submissions.length;
  submissions = submissions.filter((s) => s.id !== req.params.id);

  if (submissions.length === before) {
    return res.status(404).json({ error: 'Submission not found.' });
  }

  res.json({ success: true, message: 'Submission deleted.' });
});

// POST /api/chat — AI Chat proxy
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
        messages: messages.slice(-10),
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

// GET / — Main HTML page serve karo
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
