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

const USERS_HEADERS = [
  'First Name', 'Last Name', 'Phone', 'Reg No','Email',
  'College', 'Year',  'Last Modified'
];
const APPLICATIONS_HEADERS = [
  'Name', 'Email', 'Phone', 'Reg No','College',
  'Year', 'Department', 'QuestionID', 'Answer', 'Last Updated'
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
// Headers


const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function retryRequest(fn, retries = 5, backoff = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Request failed, retrying in ${backoff}ms... (${i + 1}/${retries})`, err.message);
      await delay(backoff);
      backoff *= 2;
    }
  }
}

async function syncUsersMongoToSheet() {
  const sheets = await getSheetsClient();
  const existingRows = await readSheet(SHEET_ID, USERS_RANGE);

  // Map existing Reg No to row index and current values
  const existingMap = {};
  existingRows.slice(1).forEach((row, idx) => {
    const regNo = row[3];
    if (regNo) existingMap[regNo] = { rowIndex: idx + 2, values: row };
  });

  const lastSync = await getLastSyncTime("mongoToSheet_users");
  const allRegNos = Object.keys(existingMap);

  // Fetch users updated since last sync or missing
  const updatedUsers = await User.find({ lastModified: { $gt: lastSync } }).lean();
  const missingUsers = await User.find({ regNo: { $nin: allRegNos } }).lean();
  const usersToSync = [...updatedUsers, ...missingUsers];

  if (!usersToSync.length) return;

  const requests = [];
  const newRows = [];

  for (const u of usersToSync) {
    const rowData = [
      u.firstname || '',
      u.lastname || '',
      u.phone || '',
      u.regNo || '',
      u.email || '',
      u.college || '',
      u.year || '',
      u.lastModified ? u.lastModified.toISOString() : new Date().toISOString()
    ];

    if (existingMap[u.regNo]) {
      const existingValues = existingMap[u.regNo].values;
      // Compare existing row with new row, only update if there are changes
      const changed = rowData.some((val, idx) => val !== (existingValues[idx] || ''));
      if (changed) {
        requests.push({
          updateCells: {
            rows: [{ values: rowData.map(v => ({ userEnteredValue: { stringValue: v } })) }],
            fields: '*',
            start: {
              sheetId: 0,
              rowIndex: existingMap[u.regNo].rowIndex - 1,
              columnIndex: 0
            }
          }
        });
      }
    } else {
      newRows.push(rowData);
    }
  }

  const BATCH_SIZE = 50;

  // Batch update existing rows
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const batch = requests.slice(i, i + BATCH_SIZE);
    await retryRequest(() =>
      sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, resource: { requests: batch } })
    );
    await delay(500);
  }

  // Batch append new rows
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const batch = newRows.slice(i, i + BATCH_SIZE);
    await retryRequest(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: USERS_RANGE,
        valueInputOption: 'RAW',
        resource: { values: batch }
      })
    );
    await delay(500);
  }

  await updateLastSyncTime("mongoToSheet_users", new Date());
  console.log(`Synced ${usersToSync.length} users to Google Sheet (updated + added)`);
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


// const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function retryRequest(fn, retries = 5, backoff = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Request failed, retrying in ${backoff}ms... (${i + 1}/${retries})`, err.message);
      await delay(backoff);
      backoff *= 2;
    }
  }
}

// const APPLICATIONS_HEADERS = [
//   'Name', 'Email', 'Phone', 'Reg No','College',
//   'Year', 'Department', 'QuestionID', 'Answer', 'Last Updated'
// ];

// const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function retryRequest(fn, retries = 5, backoff = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Request failed, retrying in ${backoff}ms... (${i + 1}/${retries})`, err.message);
      await delay(backoff);
      backoff *= 2;
    }
  }
}

const crypto = require('crypto');

function computeAppHash(app) {
  const str = JSON.stringify({
    name: app.name,
    email: app.email,
    phone: app.phone,
    registrationNumber: app.registrationNumber,
    collegeName: app.collegeName,
    year: app.year,
    department: app.department,
    answers: app.answers
  });
  return crypto.createHash('md5').update(str).digest('hex');
}

async function syncAppsMongoToSheet() {
  const sheets = await getSheetsClient();

  // Read existing applications sheet
  const existingRows = await readSheet(SHEET_ID, APPLICATIONS_RANGE);

  // Determine which applications to fetch
  let updatedApps;
  if (existingRows.length <= 1) { // only headers exist
    updatedApps = await Application.find().lean(); // fetch all if sheet empty
  } else {
    const lastSync = await getLastSyncTime("mongoToSheet_apps");
    updatedApps = await Application.find({ lastUpdated: { $gt: lastSync } }).lean();
  }

  if (!updatedApps.length) return;

  // Map existing rows by unique key: registrationNumber + department + questionId
  const existingMap = {};
  existingRows.slice(1).forEach((row, idx) => {
    const key = `${row[3]}|${row[6]}|${row[7]}`; // RegNo|Department|QuestionID
    existingMap[key] = { rowIndex: idx + 2, values: row };
  });

  const requests = [];
  const newRows = [];

  for (const app of updatedApps) {
    const currentHash = computeAppHash(app);
    const hashChanged = !app.lastHash || app.lastHash !== currentHash;

    if (!hashChanged) continue; // skip if nothing changed

    // Process each answer
    for (const ans of app.answers) {
      const rowData = [
        app.name || '',
        app.email || '',
        app.phone || '',
        app.registrationNumber || '',
        app.collegeName || '',
        app.year || '',
        app.department || '',
        ans.questionId || '',
        ans.answerText || '',
        new Date().toISOString()
      ];

      const key = `${app.registrationNumber}|${app.department}|${ans.questionId}`;

      if (existingMap[key]) {
        const existingValues = existingMap[key].values;
        const changed = rowData.some((val, idx) => val !== (existingValues[idx] || ''));
        if (changed) {
          requests.push({
            updateCells: {
              rows: [{ values: rowData.map(v => ({ userEnteredValue: { stringValue: v } })) }],
              fields: '*',
              start: {
                sheetId: 0,
                rowIndex: existingMap[key].rowIndex - 1,
                columnIndex: 0
              }
            }
          });
        }
      } else {
        newRows.push(rowData);
      }
    }

    // Update lastHash in DB
    await Application.updateOne({ _id: app._id }, { $set: { lastHash: currentHash } });
  }

  const BATCH_SIZE = 50;

  // Batch update existing rows
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const batch = requests.slice(i, i + BATCH_SIZE);
    await retryRequest(() =>
      sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, resource: { requests: batch } })
    );
    await delay(500);
  }

  // Batch append new rows
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const batch = newRows.slice(i, i + BATCH_SIZE);
    await retryRequest(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: APPLICATIONS_RANGE,
        valueInputOption: 'RAW',
        resource: { values: batch }
      })
    );
    await delay(500);
  }

  // Department-wise sheets
  const departments = [...new Set(updatedApps.map(a => a.department))];
  for (const dept of departments) {
    const deptRows = [
      ...newRows.filter(r => r[6] === dept),
      ...requests
        .map(r => r.rows?.[0]?.values.map(v => v.userEnteredValue.stringValue) || [])
        .filter(r => r[6] === dept)
    ];

    if (deptRows.length > 0) {
      await ensureHeaders(SHEET_ID, dept, APPLICATIONS_HEADERS);
      for (let i = 0; i < deptRows.length; i += BATCH_SIZE) {
        const batch = deptRows.slice(i, i + BATCH_SIZE);
        await retryRequest(() =>
          sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: `${dept}!A1:J`,
            valueInputOption: 'RAW',
            resource: { values: batch }
          })
        );
        await delay(500);
      }
    }
  }

  await updateLastSyncTime("mongoToSheet_apps", new Date());
  console.log(`Synced ${updatedApps.length} applications (updated + added)`);
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
  cron.schedule("*/1 * * * *", async () => {
    console.log("Starting sync job...");
    try {
      await syncUsersMongoToSheet();
      await syncAppsMongoToSheet();

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
