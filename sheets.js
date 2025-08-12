const { google } = require('googleapis');
const creds = require('./credentials.json');

// Authenticate
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Connect to Sheets API
async function getSheetsClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

// Ensure a sheet with a given name exists
async function ensureSheetExists(spreadsheetId, sheetName) {
  const sheets = await getSheetsClient();
  const sheetData = await sheets.spreadsheets.get({ spreadsheetId });

  const exists = sheetData.data.sheets.some(
    s => s.properties.title === sheetName
  );

  if (!exists) {
    console.log(`✅ Creating sheet: ${sheetName}`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: sheetName } } }
        ]
      }
    });
  }
}

// Ensure headers exist in a sheet (first row)
async function ensureHeaders(spreadsheetId, sheetName, headers) {
  await ensureSheetExists(spreadsheetId, sheetName);
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    console.log(`✅ Adding headers to ${sheetName}...`);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      resource: { values: [headers] },
    });
  }
}

// Read rows from a sheet safely
async function readSheet(spreadsheetId, range) {
  const sheets = await getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values || [];
  } catch (err) {
    if (err.message.includes('Unable to parse range')) {
      console.log(`⚠️ Range "${range}" does not exist. Returning empty array.`);
      return [];
    }
    throw err;
  }
}

// Overwrite entire sheet data (clear old data first)
async function overwriteSheet(spreadsheetId, sheetName, values) {
  await ensureSheetExists(spreadsheetId, sheetName);
  const sheets = await getSheetsClient();

  // Clear existing data
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: sheetName,
  });

  // Write new data
  if (values && values.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      resource: { values },
    });
  }
}

// Append rows to a sheet without clearing
async function appendToSheet(spreadsheetId, sheetName, values) {
  await ensureSheetExists(spreadsheetId, sheetName);
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetName,
    valueInputOption: 'RAW',
    resource: { values: Array.isArray(values[0]) ? values : [values] },
  });
}

module.exports = {
  getSheetsClient,
  ensureSheetExists,
  ensureHeaders,
  readSheet,
  overwriteSheet,
  appendToSheet
};
