const Application = require('../models/Application');
exports.saveApplication = async (req, res) => {
  const { userId, department, answers } = req.body;
  if (!userId || !department || !answers) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const existing = await Application.findOne({ userId, department });
    if (existing) {
      existing.answers = answers;
      existing.lastUpdated = Date.now();
      await existing.save();
      return res.json({ message: 'Application updated' });
    }
    const application = new Application({ userId, department, answers });
    await application.save();
    res.status(201).json({ message: 'Application saved' });
  } catch (err) {
    res.status(500).json({ error: 'Save failed' });
  }
};