// sync.js
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');

// Models
const User = require('./models/userModel');
const Application = require('./models/applicationModel');
const SyncConfig = require('./models/syncConfigModel');

// Sheets helpers
const { readSheet, appendToSheet, ensureHeaders } = require('./sheets');
const creds = require('./credentials.json');

// Google Sheets Auth
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function getSheetsClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Sheet details
const SHEET_ID = '1SKHDyhZ5xP_RRjmL7OIk71QNoOPQRoy8OeXD6ijhg1Y';
const USERS_RANGE = 'Users!A1:J';
const APPLICATIONS_RANGE = 'Applications!A1:F';

// Headers
const USERS_HEADERS = [
  'ID', 'UserID', 'First Name', 'Last Name', 'Reg No',
  'College', 'Year', 'Email', 'Phone', 'Last Modified'
];
const APPLICATIONS_HEADERS = [
  'ID', 'UserID', 'Department', 'QuestionID', 'Answer', 'Last Updated'
];

// Ensure main sheets exist
(async () => {
  await ensureHeaders(SHEET_ID, 'Users', USERS_HEADERS);
  await ensureHeaders(SHEET_ID, 'Applications', APPLICATIONS_HEADERS);
})();

// ===== Utility: Last sync tracking =====
async function getLastSyncTime(key) {
  const record = await SyncConfig.findOne({ key });
  return record ? new Date(record.value) : new Date(0);
}
async function updateLastSyncTime(key, time) {
  await SyncConfig.findOneAndUpdate(
    { key },
    { value: time },
    { upsert: true }
  );
}

// ===== USERS SYNC =====
async function syncUsersMongoToSheet() {
  const sheets = await getSheetsClient();
  const existingRows = await readSheet(SHEET_ID, USERS_RANGE);
  const existingIds = new Set(existingRows.slice(1).map(r => r[0])); // skip headers
  const lastSync = await getLastSyncTime("mongoToSheet_users");

  let usersToSync;
  if (existingIds.size === 0) {
    usersToSync = await User.find().lean();
  } else {
    const updatedUsers = await User.find({ lastModified: { $gt: lastSync } }).lean();
    const missingUsers = await User.find({ _id: { $nin: Array.from(existingIds) } }).lean();
    usersToSync = [...updatedUsers, ...missingUsers];
  }

  if (!usersToSync.length) return;

  const rows = usersToSync.map(u => [
    u._id.toString(),
    u.userId || uuidv4(),
    u.firstname || '',
    u.lastname || '',
    u.regNo || '',
    u.college || '',
    u.year || '',
    u.email || '',
    u.phone || '',
    u.lastModified ? u.lastModified.toISOString() : new Date().toISOString()
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: USERS_RANGE,
    valueInputOption: 'RAW',
    resource: { values: rows }
  });

  await updateLastSyncTime("mongoToSheet_users", new Date());
}

async function syncUsersSheetToMongo() {
  const rows = await readSheet(SHEET_ID, USERS_RANGE);
  if (!rows.length) return;

  rows.shift(); // Remove headers
  for (const row of rows) {
    const [id, userId, firstname, lastname, regNo, college, year, email, phone, lastModified] = row;
    const mongoDoc = await User.findById(id);
    if (!mongoDoc || new Date(lastModified) > (mongoDoc.lastModified || 0)) {
      await User.findByIdAndUpdate(
        id,
        {
          userId: userId || uuidv4(),
          firstname: firstname || '',
          lastname: lastname || '',
          regNo: regNo || '',
          college: college || '',
          year: year || '',
          email: email || '',
          phone: phone || '',
          lastModified: new Date(lastModified || Date.now())
        },
        { upsert: true }
      );
    }
  }
}

// ===== APPLICATIONS SYNC =====
async function syncAppsMongoToSheet() {
  const lastSync = await getLastSyncTime("mongoToSheet_apps");
  const updatedApps = await Application.find({ lastUpdated: { $gt: lastSync } }).lean();

  if (!updatedApps.length) return;

  const rows = [];
  updatedApps.forEach(app => {
    app.answers.forEach(ans => {
      rows.push([
        app._id.toString(),
        app.userId,
        app.department,
        ans.questionId,
        ans.answerText,
        app.lastUpdated ? app.lastUpdated.toISOString() : new Date().toISOString()
      ]);
    });
  });

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: APPLICATIONS_RANGE,
    valueInputOption: 'RAW',
    resource: { values: rows }
  });

  // ✅ Department-wise sheets
  const departments = [...new Set(updatedApps.map(a => a.department))];
  for (const dept of departments) {
    const deptRows = rows.filter(r => r[2] === dept);
    await ensureHeaders(SHEET_ID, dept, APPLICATIONS_HEADERS);
    if (deptRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${dept}!A1:F`,
        valueInputOption: 'RAW',
        resource: { values: deptRows }
      });
    }
  }

  await updateLastSyncTime("mongoToSheet_apps", new Date());
}

async function syncAppsSheetToMongo() {
  const rows = await readSheet(SHEET_ID, APPLICATIONS_RANGE);
  if (!rows.length) return;

  rows.shift();
  const grouped = {};
  for (const row of rows) {
    const [id, userId, department, questionId, answerText, lastUpdated] = row;
    if (!grouped[id]) {
      grouped[id] = {
        _id: id,
        userId,
        department,
        answers: [],
        lastUpdated: new Date(lastUpdated || Date.now())
      };
    }
    grouped[id].answers.push({ questionId, answerText });
  }

  for (const id in grouped) {
    const appData = grouped[id];
    const mongoDoc = await Application.findById(id);
    if (!mongoDoc || new Date(appData.lastUpdated) > mongoDoc.lastUpdated) {
      await Application.findByIdAndUpdate(id, appData, { upsert: true });
    }
  }
}

// ===== DEPARTMENT SHEETS SYNC =====
async function syncDepartmentsMongoToSheet() {
    const lastSync = await getLastSyncTime("mongoToSheet_depts");
    const updatedApps = await Application.find({ lastUpdated: { $gt: lastSync } }).lean();
  
    if (!updatedApps.length) return;
  
    const sheets = await getSheetsClient();
    const fixedDepartments = ["writing", "dev", "ang", "bdpr", "pav"];
  
    for (const dept of fixedDepartments) {
      // Filter for this department only
      const deptRows = [];
      updatedApps
        .filter(app => app.department?.toLowerCase() === dept.toLowerCase())
        .forEach(app => {
          app.answers.forEach(ans => {
            deptRows.push([
              app._id.toString(),
              app.userId,
              app.department,
              ans.questionId,
              ans.answerText,
              app.lastUpdated ? app.lastUpdated.toISOString() : new Date().toISOString()
            ]);
          });
        });
  
      // Ensure sheet exists + headers
      await ensureHeaders(SHEET_ID, dept, APPLICATIONS_HEADERS);
  
      if (deptRows.length > 0) {
        // Append only changed rows for this dept
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${dept}!A1:F`,
          valueInputOption: 'RAW',
          resource: { values: deptRows }
        });
      }
    }
  
    await updateLastSyncTime("mongoToSheet_depts", new Date());
  }
  async function syncDepartmentsSheetToMongo() {
    const sheets = await getSheetsClient();
    const fixedDepartments = ["writing", "dev", "ang", "bdpr", "pav"];
  
    for (const dept of fixedDepartments) {
      const rows = await readSheet(SHEET_ID, `${dept}!A1:F`);
      if (!rows.length) continue;
  
      rows.shift(); // remove headers
  
      const grouped = {};
      for (const row of rows) {
        const [id, userId, department, questionId, answerText, lastUpdated] = row;
        if (!grouped[id]) {
          grouped[id] = {
            _id: id,
            userId,
            department,
            answers: [],
            lastUpdated: new Date(lastUpdated || Date.now())
          };
        }
        grouped[id].answers.push({ questionId, answerText });
      }
  
      for (const id in grouped) {
        const appData = grouped[id];
        const mongoDoc = await Application.findById(id);
        if (!mongoDoc || new Date(appData.lastUpdated) > mongoDoc.lastUpdated) {
          await Application.findByIdAndUpdate(id, appData, { upsert: true });
        }
      }
    }
  }
    
// ===== CRON JOB =====
function startSyncCron() {
  cron.schedule("*/40 * * * *", async () => {
    console.log("Starting sync job...");
    try {
      // await syncUsersMongoToSheet();
      // await syncUsersSheetToMongo();
      // await syncAppsMongoToSheet();
      // await syncAppsSheetToMongo();
      // await syncDepartmentsMongoToSheet();
      // await syncDepartmentsSheetToMongo();
      console.log("Sync job complete.");
    } catch (err) {
      console.error("Sync error:", err);
    }
  });
}

module.exports = {
  startSyncCron
};
