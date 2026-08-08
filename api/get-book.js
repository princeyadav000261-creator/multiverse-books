const { db } = require('../utils/firebaseAdmin');

module.exports = async function handler(req, res) {
  // Check HTTPOnly Cookie
  const authCookie = req.cookies.spidy_auth;
  
  if (!authCookie || authCookie !== 'verified_session') {
    return res.status(401).json({ error: 'Unauthorized. Token Verify Karein.' });
  }

  // Agar verified hai, toh Firebase se book ka URL do
  const bookId = req.query.bookId;
  if(!bookId) return res.status(400).json({ error: 'Book ID missing' });

  const bookDoc = await db.collection('books').doc(bookId).get();
  
  if (!bookDoc.exists) return res.status(404).json({ error: 'Book not found' });

  res.status(200).json({ success: true, data: bookDoc.data() });
};

