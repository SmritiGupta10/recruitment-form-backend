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

router.get("/users", async (req, res) => {
  try {
    // 1️⃣ Try cache first
    let cache = await redis.get("users_hs_cache_json");
    if (cache) {
      console.log("⚡ Serving cached JSON users from Redis");

      if (typeof cache !== "string") {
        cache = JSON.stringify(cache);
      }

      // ✅ Let Express handle JSON headers
      return res.type("json").send(cache);
    }

    // 2️⃣ Cache miss → fetch from Mongo
    console.log("📥 Fetching users from MongoDB...");
    const users = await User.find().sort({ createdAt: -1 }).lean();

    const jsonData = JSON.stringify(users);

    // 3️⃣ Cache result (always store as string)
    await redis.set("users_hs_cache_json", jsonData, { ex: 60 * 60 * 24 * 4 }); // 4 days

    console.log(`✅ Cached ${users.length} users (JSON)`);

    // 4️⃣ Serve response
    res.type("json").send(jsonData);

  } catch (err) {
    console.error("❌ JSON /users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});


router.get("/applications", async (req, res) => {
  try {
    // 1️⃣ Try cache first
    let cache = await redis.get("applications_hs_cache_json");
    if (cache) {
      console.log("⚡ Serving cached applications from Redis");

      if (typeof cache !== "string") {
        cache = JSON.stringify(cache);
      }
      // ✅ Just send JSON properly
      return res.type("json").send(cache);
    }

    // 2️⃣ Cache miss → fetch from Mongo
    console.log("📥 Fetching applications from MongoDB...");
    const apps = await Application.find().sort({ lastUpdated: -1 }).lean();

    const jsonData = JSON.stringify(apps);

    // 3️⃣ Cache result (store as string)
    await redis.set("applications_hs_cache_json", jsonData, { ex: 60 * 60 * 24 * 4 }); // 4 days

    // 4️⃣ Serve response cleanly
    res.type("json").send(jsonData);

  } catch (err) {
    console.error("❌ Applications fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
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
