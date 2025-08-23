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
// POST /send-unfilled-emails
router.post("/send-unfilled-emails", async (req, res) => {
  const { users } = req.body;
 console.log("Received users:", users);
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
router.post("/export-users-excel", async (req, res) => {
  const { users } = req.body;

  if (!users || !users.length) {
    return res.status(400).json({ error: "No users provided" });
  }

  try {
    // ✅ Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Users");

    // ✅ Define columns
    worksheet.columns = [
      { header: "First Name", key: "firstname", width: 20 },
      { header: "Last Name", key: "lastname", width: 20 },
      { header: "Reg No", key: "regNo", width: 15 },
      { header: "College", key: "college", width: 25 },
      { header: "Year", key: "year", width: 10 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Created At", key: "createdAt", width: 20 },
      { header: "Email Status", key: "emailStatus", width: 15 },
    ];

    // ✅ Add rows
    users.forEach((u) => {
      worksheet.addRow({
        firstname: u.firstname,
        lastname: u.lastname,
        regNo: u.regNo,
        college: u.college,
        year: u.year,
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt
          ? new Date(u.createdAt).toISOString()
          : "N/A",
        emailStatus: u.emailStatus || "pending",
      });
    });

    // ✅ Write workbook to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // ✅ Send as download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=users.xlsx"
    );

    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to export Excel" });
  }
});


module.exports = router;
