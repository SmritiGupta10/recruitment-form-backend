const express = require("express");
const User = require("../models/userModel");
const Application = require("../models/applicationModel");
const { sendMail } = require("../utils/sendMail");
const router = express.Router();
const { Redis } =require("@upstash/redis");
const zlib = require("zlib");

// Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ----------------- USERS NDJSON Route (Optimized) -----------------
router.get("/users/stream", async (req, res) => {
  try {
    const acceptEncoding = req.headers["accept-encoding"] || "";
    const supportsGzip = acceptEncoding.includes("gzip");

    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // ------------------- 1️⃣ Serve gzip clients -------------------
    if (supportsGzip) {
      const gzippedBufferBase64 = await redis.get("users_cache_gzip_raw");
      if (gzippedBufferBase64) {
        console.log("⚡ Serving pre-gzipped users from Redis (raw binary via Base64)");

        const gzippedBuffer = Buffer.from(gzippedBufferBase64, "base64");
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Content-Encoding", "gzip");
        return res.end(gzippedBuffer);
      }
    }

    // ------------------- 2️⃣ Serve raw NDJSON clients -------------------
    const ndjsonCache = await redis.get("users_cache_ndjson");
    if (ndjsonCache && !supportsGzip) {
      console.log("⚡ Serving cached NDJSON for raw client");
      res.setHeader("Content-Type", "application/x-ndjson");
      return res.end(ndjsonCache);
    }

    // ------------------- 3️⃣ Cache miss → fetch from Mongo -------------------
    console.log("📥 Fetching users from MongoDB...");
    const cursor = User.find().sort({ createdAt: -1 }).cursor();
    const users = [];
    for await (const user of cursor) {
      users.push(user.toObject());
    }

    // Convert to NDJSON string
    const ndjsonData = users.map(u => JSON.stringify(u)).join("\n") + "\n";

    // Gzip NDJSON buffer
    const gzipped = zlib.gzipSync(ndjsonData);

    // ------------------- 4️⃣ Cache both -------------------
    await redis.set("users_cache_ndjson", ndjsonData, { ex: 60 * 60 * 24 * 4 }); // 4 days
    await redis.set("users_cache_gzip_raw", gzipped.toString("base64"), { ex: 60 * 60 * 24 * 4 });

    console.log(`✅ Cached ${users.length} users (NDJSON + gzipped)`);

    // ------------------- 5️⃣ Serve response -------------------
    if (supportsGzip) {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Encoding", "gzip");
      res.end(gzipped);
    } else {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.end(ndjsonData);
    }
  } catch (err) {
    console.error("❌ NDJSON /users/stream error:", err);
    res.status(500).end();
  }
});

// ----------------- APPLICATIONS JSON Route -----------------
router.get("/applications", async (req, res) => {
  try {
    const acceptEncoding = req.headers["accept-encoding"] || "";
    const supportsGzip = acceptEncoding.includes("gzip");

    res.setHeader("Cache-Control", "no-cache");

    // Try cached JSON
    let jsonCache = await redis.get("applications_cache_json"); // raw JSON string
    let gzippedCache;

    if (supportsGzip) {
      gzippedCache = await redis.get("applications_cache_json_gzip"); // Base64
      if (gzippedCache) {
        console.log("⚡ Serving pre-gzipped JSON from Redis");
        const buffer = Buffer.from(gzippedCache, "base64");
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Encoding", "gzip");
        return res.end(buffer);
      }
    }

    if (!jsonCache) {
      // Fetch from MongoDB
      console.log("📥 Fetching applications from MongoDB...");
      const apps = await Application.find().sort({ lastUpdated: -1 }).lean();
      jsonCache = JSON.stringify(apps);

      // Cache raw JSON
      await redis.set("applications_cache_json", jsonCache, { ex: 345600 });

      // Cache gzipped version
      const gzipped = zlib.gzipSync(jsonCache);
      await redis.set("applications_cache_json_gzip", gzipped.toString("base64"), { ex: 345600 });

      console.log(`✅ Cached ${apps.length} applications (JSON + gzipped)`);
    }

    // Serve response
    if (supportsGzip) {
      const buffer = gzippedCache ? Buffer.from(gzippedCache, "base64") : zlib.gzipSync(jsonCache);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Encoding", "gzip");
      res.end(buffer);
    } else {
      res.setHeader("Content-Type", "application/json");
      res.end(jsonCache);
    }
  } catch (err) {
    console.error("❌ Applications route error:", err);
    res.status(500).end();
  }
});


// POST /send-unfilled-emails
router.post("/send-unfilled-emails", async (req, res) => {
  const { users } = req.body;
//  console.log("Received users:", users);
  if (!users || !users.length) {
    return res.status(400).json({ error: "No users provided" });
  }

  const results = [];

  for (const user of users) {
    try {
      console.log(`Sending email to: ${user.email}`);
      // ✅ Check if user exists
      await sendMail(
        user.email,
        user.firstname || "Applicant",
        "email-template2.html", 
        "Reminder: Complete Your Application Before the Deadline!"
      );

      // ✅ Update email status in DB
      await User.updateOne(
        { _id: user._id },
        { $set: { emailStatus: "success", lastEmailSentAt: new Date() } }
      );

      results.push({ id: user._id, status: "success" });
    } catch (err) {
      await User.updateOne(
        { _id: user._id },
        { $set: { emailStatus: "error", lastEmailSentAt: new Date() } }
      );

      results.push({ id: user._id, status: "error", error: err.message });
    }
  }

  res.json({ success: true, results });
});



module.exports = router;
