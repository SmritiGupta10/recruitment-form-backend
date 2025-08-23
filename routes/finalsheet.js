const express = require("express");
const User = require("../models/userModel");
const router = express.Router();
const { google } = require("googleapis");
const creds = require("../credentials.json");

// Authenticate with Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = "1G-uOgyDCglSSzqO2bdyNjjbKm7rFt7w73etwGScKXNQ";
const SHEET_NAME = "Users";

// Headers for Google Sheets
const HEADERS = [
  "Firstname",
  "Lastname",
  "RegNo",
  "College",
  "Year",
  "Email",
  "Phone",
  "DateAdded",
  "Timestamp-sync",
];

// Mapping headers to MongoDB user keys
const headerKeyMap = {
  Firstname: "firstname",
  Lastname: "lastname",
  RegNo: "regNo",
  College: "college",
  Year: "year",
  Email: "email",
  Phone: "phone",
  DateAdded: "createdAt",
  "Timestamp-sync": null, // handled separately
};

// Ensure headers exist in the sheet
async function ensureHeaders() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!1:1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!1:1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }
}

// Format date to DD/MM/YY
function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

// Route to add all users to Google Sheet (no email checks)
router.post("/add-users-to-sheet", async (req, res) => {
  const { users } = req.body;
  if (!users || !users.length)
    return res.status(400).json({ error: "No users provided" });

  const results = [];

  try {
    await ensureHeaders();

    // Prepare batch data for Google Sheets
    const values = users.map(user =>
      HEADERS.map(key => {
        if (key === "Timestamp-sync") return new Date().toLocaleString();
        if (key === "DateAdded") return formatDate(user.createdAt);
        return user[headerKeyMap[key]] || "";
      })
    );

    if (values.length > 0) {
      // Append all users to Google Sheet
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: SHEET_NAME,
        valueInputOption: "RAW",
        requestBody: { values },
      });

      // Update MongoDB in bulk
      const bulkOps = users.map(u => ({
        updateOne: {
          filter: { _id: u._id },
          update: { $set: { sheetStatus: "success", lastSheetUpdateAt: new Date() } },
        },
      }));
      await User.bulkWrite(bulkOps);

      users.forEach(u => results.push({ id: u._id, status: "success" }));
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error("Google Sheets API error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
