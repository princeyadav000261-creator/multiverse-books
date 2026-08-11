const { db } = require('../utils/firebaseAdmin');
const admin = require('firebase-admin'); // Firebase Admin auth verify karne ke liye

module.exports = async function handler(req, res) {
  // 1. Check Secure Token Cookie
  const authCookie = req.cookies.spidy_auth;
  if (!authCookie || !authCookie.startsWith('verified_')) {
    return res.status(401).json({ error: 'Unauthorized Access. Please Verify Token First.' });
  }

  // Frontend se POST method ke through Book ID aur User ka Auth Token aayega
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { bookId, userToken, bookSlug } = req.body;
  if (!bookId || !userToken || !bookSlug) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    // 2. Verify Firebase User Token securely
    const decodedToken = await admin.auth().verifyIdToken(userToken);
    const uid = decodedToken.uid;

    // 3. Super Admin Check
    const adminDoc = await db.collection('admins').doc(decodedToken.email.toLowerCase()).get();
    const isSuperAdmin = adminDoc.exists;

    // 4. Fetch User Data to Check Daily Limit
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    let recentDownloadsArr = [];
    let now = Date.now();
    let accessedSlugs = new Set();

    if (userSnap.exists()) {
      let userData = userSnap.data();
      let rawDownloads = userData.recentDownloads || [];

      // Filter last 24 hours
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

      // 🔥 STRICT BACKEND LIMIT CHECK (20 Books) 🔥
      if (totalRecentCount >= 20 && !accessedSlugs.has(bookSlug) && !isSuperAdmin) {
        return res.status(403).json({ error: 'Limit Reached! You can only open 20 new books in 24 hours.' });
      }
    }

    // 5. Update Firebase with new accessed book (Backend khud karega)
    recentDownloadsArr.push({ slug: bookSlug, time: now });
    await userRef.set({
      recentDownloads: recentDownloadsArr,
      lifetimeDownloads: admin.firestore.FieldValue.increment(1)
    }, { merge: true });

    // 6. Fetch Book PDF Link and Return it securely
    const bookDoc = await db.collection('books').doc(bookId).get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'Book not found' });

    // Yahan sirf abhi link bhejenge, bookData return hoga
    res.status(200).json({ success: true, pdfLink: bookDoc.data().pdfLink });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server Security Verification Failed!' });
  }
};
