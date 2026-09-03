const { db } = require('../utils/firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const referer = req.headers['referer'] || req.headers['referrer'] || '';
  const { auth_key } = req.query;

  // 1. Direct Access Block: Check if secret key or trusted referer exists
  const validSecret = process.env.SHORTLINK_AUTH_SECRET || "SPIDY_BYPASS_SHIELD_99";
  const isFromShortlink = referer.includes('arolinks.com') || auth_key === validSecret;

  if (!isFromShortlink) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Access Denied - Spidy Book Hub</title>
        <style>
          body { background: #0a0a0c; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #141418; border: 1px solid #ff4757; border-radius: 16px; padding: 30px; text-align: center; max-width: 380px; box-shadow: 0 10px 30px rgba(255, 71, 87, 0.2); }
          h2 { color: #ff4757; margin-bottom: 10px; font-size: 20px; }
          p { color: #a1a1aa; font-size: 13px; line-height: 1.5; margin-bottom: 20px; }
          a { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: bold; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>⚠️ Direct Generation Blocked</h2>
          <p>Directly opening or copying the generator link is prohibited. Please click 'Get Key' on the website and complete verification.</p>
          <a href="/">Go to Homepage</a>
        </div>
      </body>
      </html>
    `);
  }

  // 2. Token Creation
  const token = 'SPIDY-' + uuidv4().substring(0, 8).toUpperCase();
  const expiresAt = Date.now() + (10 * 24 * 60 * 60 * 1000); // 10 Days

  await db.collection('tokens').doc(token).set({
    token: token,
    used: false,
    createdAt: Date.now(),
    expiresAt: expiresAt,
    deviceBound: null,
    isActivated: false
  });

  // Redirect back with clean token
  return res.redirect(`/?t=${token}`);
};
