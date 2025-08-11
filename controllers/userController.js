const User = require('../models/User');
const generateId = require('../utils/generateId');

exports.registerUser = async (req, res) => {
  try {
    const { email, phone } = req.body; // or whichever fields are unique for identifying a user

    // 1️⃣ Check if user already exists
    const existingUser = await User.findOne({ email, phone });

    if (existingUser) {
      // Return existing user (acts as "login" for autosave)
      return res.status(200).json({
        message: 'User already exists, returning existing data',
        data: existingUser
      });
    }

    // 2️⃣ Generate new userId
    const userId = generateId();

    // 3️⃣ Create and save new user
    const user = new User({ ...req.body, userId });
    const savedUser = await user.save();

    // 4️⃣ Return saved user
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
