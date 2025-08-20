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

// ✅ Fetch all applications (with linked user if exists)
router.get("/applications", async (req, res) => {
  try {
    const apps = await Application.aggregate([
      {
        $lookup: {
          from: "users",                // collection name for User
          localField: "registrationNumber",
          foreignField: "regNo",
          as: "userDetails",
        },
      },
      {
        $unwind: {
          path: "$userDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { lastUpdated: -1 } },
    ]);

    res.json(apps);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Fetch applications by department
router.get("/applications/department/:dept", async (req, res) => {
  try {
    const dept = req.params.dept;
    const apps = await Application.find({ department: dept }).sort({ lastUpdated: -1 });
    res.json(apps);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
