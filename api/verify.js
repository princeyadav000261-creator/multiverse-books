const { db } = require('../utils/firebaseAdmin');
const { serialize } = require('cookie');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token missing' });

  const tokenRef = db.collection('tokens').doc(token);
  const doc = await tokenRef.get();

  if (!doc.exists) return res.status(400).json({ error: 'Invalid Token' });

  const data = doc.data();
  if (data.used) return res.status(400).json({ error: 'Token already used' });
  if (Date.now() > data.expiresAt) return res.status(400).json({ error: 'Token expired' });

  // Token ko USED mark kar do taaki koi dobara use na kar sake
  await tokenRef.update({ used: true });

  // Browser mein HTTPOnly Cookie set karo (Jo JS se churai nahi ja sakti)
  const cookie = serialize('spidy_auth', 'verified_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 ghante ka device lock
    path: '/'
  });

  res.setHeader('Set-Cookie', cookie);
  res.status(200).json({ success: true, message: 'Verified successfully' });
};

