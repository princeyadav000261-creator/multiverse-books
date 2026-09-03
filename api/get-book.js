const admin = require('firebase-admin');
const crypto = require('crypto');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        }),
    });
}
const db = admin.firestore();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { bookId, userToken, bookSlug } = req.body;
  if (!bookId || !userToken || !bookSlug) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(userToken);
    const uid = decodedToken.uid;

    const adminDoc = await db.collection('admins').doc(decodedToken.email.toLowerCase()).get();
    const isSuperAdmin = adminDoc.exists;

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    let recentDownloadsArr = [];
    let now = Date.now();
    let accessedSlugs = new Set();

    if (userSnap.exists()) {
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
      
      if (totalRecentCount >= 20 && !accessedSlugs.has(bookSlug) && !isSuperAdmin) {
        return res.status(403).json({ error: 'Limit Reached! You can only open 20 new books in 24 hours.' });
      }
    }

    recentDownloadsArr.push({ slug: bookSlug, time: now });
    await userRef.set({
      recentDownloads: recentDownloadsArr,
      lifetimeDownloads: admin.firestore.FieldValue.increment(1)
    }, { merge: true });

    const bookDoc = await db.collection('books').doc(bookId).get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'Book not found' });

    const fileKey = bookDoc.data().pdfLink;
    const secret = process.env.SECURE_SECRET;
    const workerBaseUrl = process.env.WORKER_URL;

    // Fixed: Expiry parameter completely removed from HMAC logic
    const dataToSign = `${fileKey}-${secret}`;
    const signature = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');

    // Secure Worker URL without time limit
    const secureWorkerUrl = `${workerBaseUrl}/?file=${encodeURIComponent(fileKey)}&sig=${signature}`;

    res.status(200).json({ success: true, pdfLink: secureWorkerUrl });

  } catch (error) {
    console.error("Auth Error:", error);
    return res.status(500).json({ error: 'Server Security Verification Failed!' });
  }
};
