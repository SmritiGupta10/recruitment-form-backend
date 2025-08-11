const {google} = require('googleapis');
const creds = require('./credentials.json');
// Authenticate
const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
// Connect to Sheets
async function getSheetsClient() {
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  return sheets;
}
// Read rows from a sheet
async function readSheet(spreadsheetId, range) {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values;
  }
  
  // Write rows to a sheet
  async function appendToSheet(spreadsheetId, range, values) {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      resource: {
        values: [values],
      },
    });
  }
  
  module.exports = { readSheet, appendToSheet };