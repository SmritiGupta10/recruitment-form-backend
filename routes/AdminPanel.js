const express = require("express");
const User = require("../models/userModel");
const Application = require("../models/applicationModel");
const { sendMail } = require("../utils/sendMail");

const router = express.Router();

// ✅ Fetch all users
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Fetch all applications (optionally attach user if exists)
router.get("/applications", async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/x-ndjson");

    const users = await User.find();
    const userMap = new Map(users.map(u => [u.regNo, u]));

    const cursor = Application.find().sort({ lastUpdated: -1 }).cursor();

    for await (const app of cursor) {
      const user = userMap.get(app.registrationNumber) || null;
      const appWithUser = { ...app.toObject(), userDetails: user };
      res.write(JSON.stringify(appWithUser) + "\n");
    }

    res.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
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
