const express = require("express");
const User = require("../models/userModel");
const Application = require("../models/applicationModel");

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
    // Fetch all applications
    const apps = await Application.find().sort({ lastUpdated: -1 });

    // Optionally attach user details if registrationNumber matches a user
    const users = await User.find(); // fetch all users once
    const appsWithUser = apps.map(app => {
      const user = users.find(u => u.regNo === app.registrationNumber) || null;
      return { ...app.toObject(), userDetails: user };
    });

    res.json(appsWithUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
