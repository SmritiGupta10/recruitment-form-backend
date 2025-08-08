const crypto = require('crypto');

const Application = require('../models/Application');

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
    const answersString = JSON.stringify(answers);
    const currentHash = crypto.createHash("md5").update(answersString).digest("hex");

    // 3️⃣ Try to find existing application for this user & department
    const existing = await Application.findOne({ userId, department });

    if (existing) {
      // Skip saving if nothing changed
      if (existing.lastHash === currentHash) {
        return res.status(200).json({ message: "No changes detected" });
      }
      existing.answers = answers; // overwrite with new answers
      existing.lastUpdated = Date.now();
      await existing.save();
      return res.json({ message: 'Application updated' });
    }

    // 4️⃣ Create new application
    const application = new Application({ userId, department, answers ,lastHash: currentHash });
    await application.save();
    res.status(201).json({ message: 'Application saved' });

  } catch (err) {
    // 5️⃣ Handle unique index violation (duplicate application)
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Application already exists for this department' });
    }

    console.error('Save application error:', err);
    res.status(500).json({ error: `Save failed ${err}` });
  }
};
