const { db } = require('../utils/firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

module.exports = async function handler(req, res) {
  // SPIDY-XXXX format ka naya token banayega (Highly Random)
  const token = 'SPIDY-' + uuidv4().substring(0, 8).toUpperCase();
  
  // Expiry time set to exactly 10 Days
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; 

  // Token ko Firebase mein save karega
  await db.collection('tokens').doc(token).set({
    token: token,
    used: false,
    createdAt: Date.now(),
    expiresAt: expiresAt,
    deviceBound: null // Verification ke time device bind hoga
  });

  // User ko wapis main website par bhej dega (token ke sath)
  res.redirect(`/?t=${token}`);
};
