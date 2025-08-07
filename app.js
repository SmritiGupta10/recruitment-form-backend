const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');

const userRoutes = require('./routes/userRoutes');
const applicationRoutes = require('./routes/applicationRoutes');

dotenv.config();
const app = express();
connectDB();

app.use(cors());
app.use(bodyParser.json());

app.use('/api/user', userRoutes);
app.use('/api', applicationRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));