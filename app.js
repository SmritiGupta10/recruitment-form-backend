const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');

const userRoutes = require('./routes/userRoutes');
const applicationRoutes = require('./routes/applicationRoutes');

dotenv.config();
const app = express();
app.use(express.json());
connectDB();

app.use(cors());
app.use(bodyParser.json());
app.get('/', (req, res) => res.send('Server running'));

app.use('/api/user', userRoutes);
app.use('/api', applicationRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));