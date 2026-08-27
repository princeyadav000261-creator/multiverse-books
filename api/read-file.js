const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = async function handler(req, res) {
  // URL me key parameter zaroori hai (jaise ?key=math-book.pdf)
  const { key } = req.query;
  if (!key) return res.status(400).send("File key missing");

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    
    // R2 se file fetch karo
    const response = await s3Client.send(command);
    
    // Browser ko batao ki ye local PDF hai
    res.setHeader("Content-Type", response.ContentType || "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    
    // Cloudflare se aane wale data ko direct user ke browser me bhejo
    response.Body.pipe(res);

  } catch (error) {
    console.error("Proxy Error:", error);
    res.status(500).send("File not found or server error.");
  }
};

