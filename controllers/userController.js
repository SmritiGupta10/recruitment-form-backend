const User = require('../models/User');
const generateId = require('../utils/generateId');
exports.registerUser = async (req, res) => {
  try {
    const userId = generateId();
    const user = new User({ ...req.body, userId });
    await user.save();
    res.status(201).json({ userId });
  } catch (error) {
    res.status(500).json({ error: 'User registration failed' });
  }
};