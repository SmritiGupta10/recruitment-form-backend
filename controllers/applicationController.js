const crypto = require('crypto');
const Application = require('../models/applicationModel');
const {sendMail} = require("../utils/sendMail.js")

exports.saveApplication = async (req, res) => {
  const { name, email, phone, registrationNumber, year, collegeName, department, answers } = req.body;

  // 1️⃣ Validate request body
  if (!name || !email || !phone || !registrationNumber || !year || !collegeName || !department || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  // 2️⃣ Ensure each answer follows { questionId, answerText }
  const invalidAnswer = answers.find(ans => !ans.questionId || !ans.answerText);
  if (invalidAnswer) {
    return res.status(400).json({ error: 'Each answer must have questionId and answerText' });
  }

  try {
    const answersString = JSON.stringify(answers);
    const currentHash = crypto.createHash("md5").update(answersString).digest("hex");

    // 3️⃣ Check if application exists (based on registrationNumber + department)
    const existing = await Application.findOne({ registrationNumber, department });

    if (existing) {
      // Skip saving if nothing changed
      if (existing.lastHash === currentHash) {
        return res.status(200).json({ message: "No changes detected" });
      }

      existing.name = name;
      existing.email = email;
      existing.phone = phone;
      existing.registrationNumber = registrationNumber;
      existing.year = year;
      existing.collegeName = collegeName;
      existing.answers = answers;
      existing.lastUpdated = Date.now();
      existing.lastHash = currentHash;

      await existing.save();
      return res.json({ message: 'Application updated' });
    }

    // 4️⃣ Create new application
    const application = new Application({
      name,
      email,
      phone,
      registrationNumber,
      year,
      collegeName,
      department,
      answers,
      lastHash: currentHash
    });

    await application.save();
    await sendMail(email, name);
    res.status(201).json({ message: 'Application saved' });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Application already exists for this department' });
    }
    console.error('Save application error:', err);
    res.status(500).json({ error: `Save failed ${err}` });
  }
};
