const User = require('../models/User');
const generateId = require('../utils/generateId');

exports.registerUser = async (req, res) => {
  try {
    const { email, phone, regNo } = req.body;

    // 1️⃣ Check if user already exists by any unique identifier
    const existingUser = await User.findOne({
      $or: [
        { email },
        { phone },
        { regNo }
      ]
    });

    if (existingUser) {
      // Return existing user instead of creating a duplicate
      return res.status(200).json({
        message: 'User already exists, returning existing data',
        data: existingUser
      });
    }

    // 2️⃣ Create a new user if not found
    const userId = generateId();
    const newUser = new User({ ...req.body, userId });
    const savedUser = await newUser.save();

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
