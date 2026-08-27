const admin = require('firebase-admin');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

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

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { fileName, fileType, userToken } = req.body;
  if (!fileName || !fileType || !userToken) return res.status(400).json({ error: 'Missing parameters' });

  try {
    // Check if user is Super Admin
    const decodedToken = await admin.auth().verifyIdToken(userToken);
    const adminDoc = await db.collection('admins').doc(decodedToken.email.toLowerCase()).get();
    
    if (!adminDoc.exists) {
      return res.status(403).json({ error: 'Only admins can upload files!' });
    }

    // Unique File Key generate karo
    const uniqueFileName = `${Date.now()}-${fileName.replace(/\s+/g, '-')}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: uniqueFileName,
      ContentType: fileType,
    });

    // Generate link valid for 5 minutes
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    res.status(200).json({ success: true, uploadUrl, fileKey: uniqueFileName });

  } catch (error) {
    console.error("Upload URL Error:", error);
    return res.status(500).json({ error: 'Failed to generate upload URL.' });
  }
};

