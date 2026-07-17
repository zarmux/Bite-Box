const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const RESTAURANT_CAPACITY = 60;
const RESERVATION_FILE = path.join(__dirname, 'data', 'reservations.json');
const PREORDER_FILE = path.join(__dirname, 'data', 'preorders.json');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `https://bite-box-cnna.onrender.com`;
const DEFAULT_SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

const TIME_LABELS = {
  '4pm': '4:00 PM',
  '5pm': '5:00 PM',
  '6pm': '6:00 PM',
  '7pm': '7:00 PM',
  '8pm': '8:00 PM',
  '9pm': '9:00 PM'
};

app.use(express.json());
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    }
  }
}));

async function readJsonFile(filePath, fallback = []) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

function getGuestCount(guestsValue) {
  const parsedValue = parseInt(String(guestsValue).trim(), 10);
  return Number.isNaN(parsedValue) || parsedValue < 1 ? 2 : parsedValue;
}

function getBookedCount(reservations, date, time) {
  return reservations
    .filter((r) => r.date === date && r.time === time)
    .reduce((sum, r) => sum + r.guestCount, 0);
}

async function createTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials are missing. Set SMTP_USER and SMTP_PASS in your environment.');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || DEFAULT_SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendReservationEmail(reservation) {
  const transporter = await createTransporter();
  const timeLabel = TIME_LABELS[reservation.time] || reservation.time;
  const guestLabel = `${reservation.guestCount} Guests`;

  const restaurantHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #b54a40;">New Table Reservation</h2>
      <p>A customer has booked a table at BiteBox. Here are the details:</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Name</td><td style="padding: 8px;">${reservation.name}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Phone</td><td style="padding: 8px;">${reservation.phone}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Email</td><td style="padding: 8px;">${reservation.email}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Date</td><td style="padding: 8px;">${reservation.date}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Time</td><td style="padding: 8px;">${timeLabel}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Guests</td><td style="padding: 8px;">${guestLabel}</td></tr>
      </table>
      <p style="margin-top: 20px; color: #7b6350; font-size: 14px;">This reservation was submitted via the BiteBox website.</p>
    </div>
  `;

  const preorderUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/preorder.html`;
  const customerHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #b54a40;">Your table reservation is booked</h2>
      <p>Hi ${reservation.name}, your reservation at BiteBox is confirmed for <strong>${reservation.date}</strong> at <strong>${timeLabel}</strong>.</p>
      <p>We're looking forward to welcoming you and your party of <strong>${guestLabel}</strong>.</p>
      <p>If you want to make your visit even smoother, you can pre-order your favorite dishes before you arrive.</p>
      <p style="margin-top: 20px;">
        <a href="${preorderUrl}" style="display: inline-block; background-color: #b54a40; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 4px; font-weight: bold;">Pre-order Food</a>
      </p>
      <p style="margin-top: 12px; font-size: 14px; color: #7b6350;">Or open: <a href="${preorderUrl}">${preorderUrl}</a></p>
    </div>
  `;

  if (process.env.RESTAURANT_EMAIL) {
    await transporter.sendMail({
      from: `"BiteBox Reservations" <${process.env.SMTP_USER}>`,
      to: process.env.RESTAURANT_EMAIL,
      subject: `New Table Reservation – ${reservation.name} on ${reservation.date}`,
      html: restaurantHtml
    });
  }

  if (reservation.email) {
    await transporter.sendMail({
      from: `"BiteBox Reservations" <${process.env.SMTP_USER}>`,
      to: reservation.email,
      subject: 'Your BiteBox reservation is booked',
      html: customerHtml,
      text: `Your table reservation is booked. Pre-order food here: ${preorderUrl}`
    });
  }
}

async function sendPreorderEmail(preorder) {
  const transporter = await createTransporter();
  const preorderSummary = preorder.items.replace(/,/g, ', ');

  const restaurantHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #b54a40;">New Pre-order Request</h2>
      <p>A guest has requested a pre-order for their visit.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Name</td><td style="padding: 8px;">${preorder.name}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Phone</td><td style="padding: 8px;">${preorder.phone}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Email</td><td style="padding: 8px;">${preorder.email}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Arrival Date</td><td style="padding: 8px;">${preorder.date}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Items</td><td style="padding: 8px;">${preorderSummary}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #7b6350;">Notes</td><td style="padding: 8px;">${preorder.notes || 'None'}</td></tr>
      </table>
    </div>
  `;

  const customerHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #b54a40;">Your BiteBox pre-order request is received</h2>
      <p>Hi ${preorder.name}, we have received your pre-order request for <strong>${preorder.date}</strong>.</p>
      <p>Selected dishes: <strong>${preorderSummary}</strong></p>
      <p>We will get everything ready for your visit and keep it warm for you.</p>
    </div>
  `;

  if (process.env.RESTAURANT_EMAIL) {
    await transporter.sendMail({
      from: `"BiteBox Reservations" <${process.env.SMTP_USER}>`,
      to: process.env.RESTAURANT_EMAIL,
      subject: `New Pre-order Request – ${preorder.name}`,
      html: restaurantHtml
    });
  }

  if (preorder.email) {
    await transporter.sendMail({
      from: `"BiteBox Reservations" <${process.env.SMTP_USER}>`,
      to: preorder.email,
      subject: 'Your BiteBox pre-order request is received',
      html: customerHtml
    });
  }
}

app.post('/api/reservations', async (req, res) => {
  try {
    const { name, phone, email, date, time, guests } = req.body;

    if (!name?.trim() || !phone?.trim() || !email?.trim() || !date || !time || !guests) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required.'
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      return res.status(400).json({
        success: false,
        message: 'Please select a future date.'
      });
    }

    const guestCount = getGuestCount(guests);
    if (!Number.isInteger(guestCount) || guestCount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid number of guests.'
      });
    }

    const reservations = await readJsonFile(RESERVATION_FILE, []);
    const booked = getBookedCount(reservations, date, time);

    if (booked + guestCount > RESTAURANT_CAPACITY) {
      return res.status(409).json({
        success: false,
        available: false,
        message: 'Table not available. We are fully booked for this time slot.'
      });
    }

    const reservation = {
      id: Date.now().toString(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      date,
      time,
      guests,
      guestCount,
      createdAt: new Date().toISOString()
    };

    reservations.push(reservation);
    await writeJsonFile(RESERVATION_FILE, reservations);

    try {
      await sendReservationEmail(reservation);
    } catch (emailError) {
      console.warn('Email not configured or failed to send:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Your table has been reserved! We look forward to seeing you.'
    });
  } catch (error) {
    console.error('Reservation error:', error);
    res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
});

app.post('/api/preorders', async (req, res) => {
  try {
    const { name, phone, email, date, items, notes } = req.body;

    if (!name?.trim() || !phone?.trim() || !email?.trim() || !date || !items?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your name, phone, email, arrival date, and at least one dish.'
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    const preorder = {
      id: Date.now().toString(),
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      date,
      items: items.trim(),
      notes: notes?.trim() || '',
      createdAt: new Date().toISOString()
    };

    const preorders = await readJsonFile(PREORDER_FILE, []);
    preorders.push(preorder);
    await writeJsonFile(PREORDER_FILE, preorders);

    try {
      await sendPreorderEmail(preorder);
    } catch (emailError) {
      console.warn('Pre-order email not configured or failed to send:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Your pre-order request has been received. We will prepare your food for your visit.'
    });
  } catch (error) {
    console.error('Pre-order error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to submit your pre-order. Please try again.'
    });
  }
});

app.get('/api/reservations/availability', async (req, res) => {
  try {
    const { date, time } = req.query;
    if (!date || !time) {
      return res.status(400).json({ message: 'Date and time are required.' });
    }

    const reservations = await readJsonFile(RESERVATION_FILE, []);
    const booked = getBookedCount(reservations, date, time);

    res.json({
      booked,
      capacity: RESTAURANT_CAPACITY,
      available: Math.max(0, RESTAURANT_CAPACITY - booked)
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to check availability.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BiteBox server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to use the reservation form.`);
});

module.exports = app;
