const admin = require('firebase-admin');
const crypto = require('crypto');

// Firebase Admin Initialize (Sirf ek baar)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY 
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
          : undefined,
      }),
    });
  } catch (initErr) {
    console.error("Firebase Admin Init Error:", initErr);
  }
}
const db = admin.firestore();

module.exports = async function handler(req, res) {
  // CORS Headers lagayein
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { bookId, userToken, bookSlug } = req.body;
  if (!bookId || !userToken || !bookSlug) {
    return res.status(400).json({ error: 'Missing parameters: bookId, userToken, or bookSlug' });
  }

  let uid = null;
  let userEmail = "";

  // 1. Verify User Token
  try {
    const decodedToken = await admin.auth().verifyIdToken(userToken);
    uid = decodedToken.uid;
    userEmail = (decodedToken.email || "").toLowerCase().trim();
  } catch (authErr) {
    console.error("Token verification failed:", authErr.message);
    return res.status(401).json({ error: 'Session Expired! Please re-login.' });
  }

  try {
    // 2. Admin Check
    let isSuperAdmin = false;
    if (userEmail) {
      const adminDoc = await db.collection('admins').doc(userEmail).get();
      isSuperAdmin = adminDoc.exists;
    }

    // 3. User Daily Limit Check (24 Hours)
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    let recentDownloadsArr = [];
    let now = Date.now();
    let accessedSlugs = new Set();

    if (userSnap.exists) {
      let userData = userSnap.data();
      let rawDownloads = userData.recentDownloads || [];

      rawDownloads.forEach(item => {
        let time = typeof item === 'number' ? item : item.time;
        let itemSlug = typeof item === 'number' ? null : item.slug;
        if (now - time < 24 * 60 * 60 * 1000) {
          recentDownloadsArr.push(item);
          if (itemSlug) accessedSlugs.add(itemSlug);
        }
      });

      let totalRecentCount = accessedSlugs.size + recentDownloadsArr.filter(i => typeof i === 'number').length;

      // Super Admin ke liye limit bypass rahegi
      if (totalRecentCount >= 20 && !accessedSlugs.has(bookSlug) && !isSuperAdmin) {
        return res.status(403).json({ error: 'Daily limit reached! Max 20 books in 24 hours.' });
      }
    }

    // User session update
    recentDownloadsArr.push({ slug: bookSlug, time: now });
    await userRef.set({
      recentDownloads: recentDownloadsArr,
      lifetimeDownloads: admin.firestore.FieldValue.increment(1)
    }, { merge: true });

    // 4. Book Data fetch
    const bookDoc = await db.collection('books').doc(bookId).get();
    if (!bookDoc.exists) {
      return res.status(404).json({ error: 'Book not found in database!' });
    }

    const fileKey = bookDoc.data().pdfLink;
    if (!fileKey) {
      return res.status(404).json({ error: 'PDF file link missing for this book!' });
    }

    // 5. Cloudflare Worker URL
    const workerBaseUrl = (process.env.WORKER_URL || "https://spidy-proxy.spidybookhub-backend.workers.dev").replace(/\/+$/, "");

    // Direct clean worker proxy link
    const secureWorkerUrl = `${workerBaseUrl}/stream?file=${encodeURIComponent(fileKey)}`;

    return res.status(200).json({ 
      success: true, 
      pdfLink: secureWorkerUrl,
      rawKey: fileKey 
    });

  } catch (error) {
    console.error("Backend Error:", error);
    return res.status(500).json({ error: 'Server Error: ' + (error.message || 'Verification Failed') });
  }
};
