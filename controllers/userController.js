const User = require('../models/User');
const generateId = require('../utils/generateId');

exports.registerUser = async (req, res) => {
  try {
    // 1️⃣ Generate a unique userId
    const userId = generateId();

    // 2️⃣ Create a new user document
    const user = new User({ ...req.body, userId });

    // 3️⃣ Save to MongoDB
    const savedUser = await user.save();

    // 4️⃣ Return full saved data to frontend
    res.status(201).json({
      message: 'User registered successfully',
      data: savedUser
    });

  } catch (error) {
    res.status(500).json({
      error: 'User registration failed',
      details: error.message
    });
  }
};
