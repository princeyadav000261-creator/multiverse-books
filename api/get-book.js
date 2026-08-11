const { db } = require('../utils/firebaseAdmin');

module.exports = async function handler(req, res) {
  // Check strict HTTPOnly Cookie
  const authCookie = req.cookies.spidy_auth;
  
  if (!authCookie || !authCookie.startsWith('verified_')) {
    return res.status(401).json({ error: 'Unauthorized Access. Please Verify Token First.' });
  }

  // Agar verified hai, toh Firebase se book ka URL do
  const bookId = req.query.bookId;
  if(!bookId) return res.status(400).json({ error: 'Book ID missing' });

  const bookDoc = await db.collection('books').doc(bookId).get();
  
  if (!bookDoc.exists) return res.status(404).json({ error: 'Book not found' });

  res.status(200).json({ success: true, data: bookDoc.data() });
};
