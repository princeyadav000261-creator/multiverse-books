const admin = require('firebase-admin');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

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
  } catch (e) {
    console.error("Firebase Admin init error:", e);
  }
}
const db = admin.firestore();

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = async function handler(req, res) {
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

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { fileName, fileType, userToken } = req.body;
  if (!fileName || !fileType || !userToken) return res.status(400).json({ error: 'Missing parameters' });

  try {
    // 1. Check if user is logged in
    const decodedToken = await admin.auth().verifyIdToken(userToken);
    const userEmail = (decodedToken.email || "").toLowerCase().trim();

    // 2. Admin Check
    const adminDoc = await db.collection('admins').doc(userEmail).get();
    if (!adminDoc.exists) {
      return res.status(403).json({ error: 'Only admins can upload files!' });
    }

    // 3. FOLDER PRESERVATION LOGIC (covers/ ya pdfs/)
    let finalKey = fileName;
    if (fileName.includes('/')) {
      const parts = fileName.split('/');
      const folder = parts[0]; // 'covers' ya 'pdfs'
      const originalName = parts.slice(1).join('/');
      finalKey = `${folder}/${Date.now()}-${originalName.replace(/\s+/g, '-')}`;
    } else {
      finalKey = `uploads/${Date.now()}-${fileName.replace(/\s+/g, '-')}`;
    }

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: finalKey,
      ContentType: fileType,
    });

    // 10 minutes ke liye presigned URL generate karein
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    return res.status(200).json({ success: true, uploadUrl, fileKey: finalKey });

  } catch (error) {
    console.error("Upload URL Error:", error);
    return res.status(500).json({ error: 'Failed to generate upload URL: ' + error.message });
  }
};
