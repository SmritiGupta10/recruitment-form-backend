const crypto = require('crypto');
const Application = require('../models/applicationModel');
const User = require('../models/userModel'); // Import User model

exports.saveApplication = async (req, res) => {
  const { userId, department, answers } = req.body;

  // 1️⃣ Validate request body
  if (!userId || !department || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  // 2️⃣ Ensure each answer follows { questionId, answerText }
  const invalidAnswer = answers.find(
    ans => !ans.questionId || !ans.answerText
  );
  if (invalidAnswer) {
    return res.status(400).json({ error: 'Each answer must have questionId and answerText' });
  }

  try {
    // 3️⃣ Get user details from User model
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found for given userId' });
    }

    const answersString = JSON.stringify(answers);
    const currentHash = crypto.createHash("md5").update(answersString).digest("hex");

    // 4️⃣ Check if application exists
    const existing = await Application.findOne({ userId, department });

    if (existing) {
      // Skip saving if nothing changed
      if (existing.lastHash === currentHash) {
        return res.status(200).json({ message: "No changes detected" });
      }
      existing.answers = answers;
      existing.firstname = user.firstname; // update from user
      existing.lastname = user.lastname;
      existing.phone = user.phone;
      existing.lastUpdated = Date.now();
      existing.lastHash = currentHash;
      await existing.save();
      return res.json({ message: 'Application updated' });
    }

    // 5️⃣ Create new application with user details
    const application = new Application({
      userId,
      department,
      answers,
      firstname: user.firstname,
      lastname: user.lastname,
      phone: user.phone,
      lastHash: currentHash
    });
    await application.save();
    res.status(201).json({ message: 'Application saved' });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Application already exists for this department' });
    }
    console.error('Save application error:', err);
    res.status(500).json({ error: `Save failed ${err}` });
  }
};
