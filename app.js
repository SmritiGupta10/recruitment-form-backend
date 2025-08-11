const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const app = express();
const userRoutes = require('./routes/userRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const { readSheet, appendToSheet } = require('./sheets');
const SHEET_ID = '1SKHDyhZ5xP_RRjmL7OIk71QNoOPQRoy8OeXD6ijhg1Y'; // from URL
const RANGE = 'Sheet1!A1:H'; // Adjust as needed
// View data
app.get('/sheet', async (req, res) => {
    const data = await readSheet(SHEET_ID, RANGE);
    res.json(data);
  });
  
  // Add data (e.g., from MongoDB or form)
  app.post('/sheet', async (req, res) => {
    const row = req.body.row; // Expecting an array
    await appendToSheet(SHEET_ID, RANGE, row);
    res.send({ success: true });
  });
dotenv.config();

app.use(express.json());
connectDB();


app.use(cors({
    origin: 'http://localhost:3000', // Only allow this origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
    credentials: true // If you need to send cookies/auth headers
  }));
app.use(bodyParser.json());
app.get('/', (req, res) => res.send('Server running'));

app.use('/api/user', userRoutes);
app.use('/api', applicationRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));