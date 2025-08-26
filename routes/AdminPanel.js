const express = require("express");
const User = require("../models/userModel");
const Application = require("../models/applicationModel");
const { sendMail } = require("../utils/sendMail");
const router = express.Router();
const { Redis } =require("@upstash/redis");
const { setCache, getCache } = require("../utils/cache");






// ----------------- USERS SSE Route -----------------
// ✅ SSE for users
router.get("/users", async (req, res) => {
  try {
    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Fetch users
    const users = await User.find().sort({ createdAt: -1 });

    // Send initial users as SSE
    res.write(`data: ${JSON.stringify(users)}\n\n`);

    // Optional: Keep connection alive for future updates
    const keepAlive = setInterval(() => {
      res.write(`:\n\n`); // comment ping to keep connection alive
    }, 25000); // every 25 seconds

    // Cleanup on client disconnect
    req.on("close", () => {
      clearInterval(keepAlive);
      res.end();
    });
  } catch (err) {
    console.error(err);
    res.end();
  }
});


// Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

router.get("/applications", async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let apps = await redis.get("applications_cache");

    if (!apps) {
      console.log("Fetching applications from MongoDB...");
      // Fetch fresh from Mongo
      const cursor = Application.find().sort({ lastUpdated: -1 }).cursor();
      apps = [];

      for await (const app of cursor) {
        apps.push(app.toObject());
      }

      // ✅ Always store as string
      await redis.set("applications_cache", JSON.stringify(apps), { ex: 600 });
      console.log(`✅ Cached ${apps.length} applications in Redis`);
    } else {
      console.log("⚡ Serving applications from Redis cache");
      // ✅ Parse only if string
      if (typeof apps === "string") {
        apps = JSON.parse(apps);
      }
    }

    // 🚀 Stream NDJSON
    for (const app of apps) {
      res.write(JSON.stringify(app) + "\n");
    }

    res.end();
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
