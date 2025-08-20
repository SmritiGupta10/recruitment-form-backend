const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const { startSyncCron } = require('./sync');
const adminPanelRoutes = require('./routes/adminPanel');

dotenv.config();
connectDB();

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'https://www.manipalthetalk.org'], 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  credentials: true
}));

app.use(bodyParser.json());

app.get('/', (req, res) => res.send('Server running'));

app.use('/api/user', require('./routes/userRoutes'));
app.use('/api', require('./routes/applicationRoutes'));
app.use('/applicants', adminPanelRoutes);


// Start sync cron
startSyncCron();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
