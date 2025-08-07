const mongoose = require('mongoose');
const applicationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  department: { type: String, required: true },
  answers: [
    {
      questionId: String,
      answerText: String
    }
  ],
  lastUpdated: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Application', applicationSchema);