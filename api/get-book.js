const admin = require('firebase-admin');

// Firebase Admin Initialize (Sirf ek baar)
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
  // POST request only
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { bookId, userToken, bookSlug } = req.body;
  if (!bookId || !userToken || !bookSlug) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(userToken);
    const uid = decodedToken.uid;

    // Super Admin Check
    const adminDoc = await db.collection('admins').doc(decodedToken.email.toLowerCase()).get();
    const isSuperAdmin = adminDoc.exists;

    // Check Daily Limit (20 Books)
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

      let legacyCount = recentDownloadsArr.filter(i => typeof i === 'number').length;
      let totalRecentCount = accessedSlugs.size + legacyCount;

      if (totalRecentCount >= 20 && !accessedSlugs.has(bookSlug) && !isSuperAdmin) {
        return res.status(403).json({ error: 'Limit Reached! You can only open 20 new books in 24 hours.' });
      }
    }

    // Update Firebase with new accessed book
    recentDownloadsArr.push({ slug: bookSlug, time: now });
    await userRef.set({
      recentDownloads: recentDownloadsArr,
      lifetimeDownloads: admin.firestore.FieldValue.increment(1)
    }, { merge: true });

    // Fetch Book
    const bookDoc = await db.collection('books').doc(bookId).get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'Book not found' });

    // 🔥 MAIN MAGIC: Asli URL ki jagah API Proxy URL bhejenge
    const fileKey = bookDoc.data().pdfLink;
    const maskedUrl = `/api/read-file?key=${encodeURIComponent(fileKey)}`;

    res.status(200).json({ success: true, pdfLink: maskedUrl });

  } catch (error) {
    console.error("Auth Error:", error);
    return res.status(500).json({ error: 'Server Security Verification Failed!' });
  }
};
