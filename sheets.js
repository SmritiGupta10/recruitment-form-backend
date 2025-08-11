const { google } = require('googleapis');
const creds = require('./credentials.json');

// Authenticate
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Connect to Sheets
async function getSheetsClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

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
          {
            addSheet: {
              properties: { title: sheetName }
            }
          }
        ]
      }
    });
  }
}

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
      resource: {
        values: [headers],
      },
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

// Write rows to a sheet
async function appendToSheet(spreadsheetId, range, values) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    resource: {
      values: Array.isArray(values[0]) ? values : [values],
    },
  });
}

module.exports = { readSheet, appendToSheet, ensureHeaders };
