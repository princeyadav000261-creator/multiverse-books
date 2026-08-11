const { db } = require('../utils/firebaseAdmin');
const { serialize } = require('cookie');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  // Frontend se token aur unique device fingerprint aayega
  const { token, fingerprint } = req.body;
  if (!token) return res.status(400).json({ error: 'Token missing' });

  const tokenRef = db.collection('tokens').doc(token);
  const doc = await tokenRef.get();

  if (!doc.exists) return res.status(400).json({ error: 'Invalid Token! Please get a new key.' });

  const data = doc.data();
  
  // Strict Checks
  if (data.used) return res.status(400).json({ error: 'Token already used by another device!' });
  if (Date.now() > data.expiresAt) return res.status(400).json({ error: 'Token expired! Please generate a new key.' });

  // User ka IP Address nikalna (Optional Security Logging ke liye)
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown_ip';

  // Token ko USED mark kar do taaki koi aur use na kar sake + Device bind kar do
  await tokenRef.update({ 
    used: true,
    usedAt: Date.now(),
    boundFingerprint: fingerprint || 'unknown',
    boundIp: ip
  });

  // Browser mein Strict HTTPOnly Cookie set karo (Jo JS se churai nahi ja sakti)
  const cookie = serialize('spidy_auth', `verified_${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 10 * 24 * 60 * 60, // 10 Days valid cookie
    path: '/'
  });

  res.setHeader('Set-Cookie', cookie);
  res.status(200).json({ success: true, message: 'Device Verified & Locked Successfully!' });
};
