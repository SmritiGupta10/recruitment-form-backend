const express = require("express");
const User = require("../models/userModel");
const Application = require("../models/applicationModel");
const { sendMail } = require("../utils/sendMail");
const router = express.Router();
const { Redis } =require("@upstash/redis");
// const { setCache, getCache } = require("../utils/cache");
const zlib = require("zlib");



// Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
// ----------------- USERS NDJSON Route -----------------
router.get("/users/stream", async (req, res) => {
  try {
    // ✅ NDJSON headers (Safari/iPhone compatible)
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // ✅ Try Redis first
    let users = await redis.get("users_cache");

    if (users) {
      console.log("✅ Serving users from Redis cache");
      try {
        users = JSON.parse(users); // ensure it's parsed
      } catch (err) {
        console.error("⚠️ Redis cache corrupted, refetching Mongo:", err);
        users = null;
      }
    }

    // ✅ If no cache → fetch Mongo
    if (!users) {
      console.log("⏳ Fetching users from MongoDB");
      users = [];

      const cursor = User.find().sort({ createdAt: -1 }).cursor();
      for await (const user of cursor) {
        users.push(user.toObject());
      }

      // ✅ Cache in Upstash Redis for 4 days
      await redis.set("users_cache", JSON.stringify(users), {
        ex: 60 * 60 * 24 * 4,
      });
    }

    console.log(`🚀 Streaming ${users.length} users`);

    // ✅ Stream NDJSON line by line
    for (const user of users) {
      res.write(JSON.stringify(user) + "\n");
      res.flush?.(); // Safari flush
    }

    res.end();
  } catch (err) {
    console.error("❌ NDJSON /users/stream error:", err);
    if (!res.headersSent) res.status(500).end();
    else res.end();
  }
});

// ----------------- APPLICATIONS NDJSON Route -----------------

router.get("/applications", async (req, res) => {
  try {
    const acceptEncoding = req.headers["accept-encoding"] || "";
    const supportsGzip = acceptEncoding.includes("gzip");

    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // ------------------- 1️⃣ Serve gzip clients -------------------
    if (supportsGzip) {
      const gzippedBufferBase64 = await redis.get("applications_cache_gzip_raw"); 
      // stored as Base64 because Upstash only supports strings
      if (gzippedBufferBase64) {
        console.log("⚡ Serving pre-gzipped applications from Redis (raw binary via Base64)");

        const gzippedBuffer = Buffer.from(gzippedBufferBase64, "base64");

        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Content-Encoding", "gzip");
        return res.end(gzippedBuffer);
      }
    }

    // ------------------- 2️⃣ Serve raw clients -------------------
    const ndjsonCache = await redis.get("applications_cache_ndjson");
    if (ndjsonCache && !supportsGzip) {
      console.log("⚡ Serving cached NDJSON for raw client");
      res.setHeader("Content-Type", "application/x-ndjson");
      return res.end(ndjsonCache);
    }

    // ------------------- 3️⃣ Cache miss → fetch from Mongo -------------------
    console.log("📥 Fetching applications from MongoDB...");
    const cursor = Application.find().sort({ lastUpdated: -1 }).cursor();
    const apps = [];
    for await (const app of cursor) {
      apps.push(app.toObject());
    }

    // Convert to NDJSON string
    const ndjsonData = apps.map(a => JSON.stringify(a)).join("\n") + "\n";

    // Gzip NDJSON buffer
    const gzipped = zlib.gzipSync(ndjsonData);

    // ------------------- 4️⃣ Cache both -------------------
    await redis.set("applications_cache_ndjson", ndjsonData, { ex: 345600 }); // raw NDJSON
    await redis.set("applications_cache_gzip_raw", gzipped.toString("base64"), { ex: 345600 }); // gzip as Base64

    console.log(`✅ Cached ${apps.length} applications (NDJSON + gzipped)`);

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
    console.error("❌ Applications stream error:", err);
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
