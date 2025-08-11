const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  answerText: { type: String, required: true }
}, { _id: false });

const applicationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  department: {
    type: String,
    required: true,
    enum: ["writing", "dev","ang", "bdpr", "photo", "video"], 
  },
  answers: {
    type: [answerSchema],
    validate: [arrayLimit, 'Answers array is empty']
  },
  lastHash: { type: String },
  lastUpdated: { type: Date, default: Date.now }
});

// Ensure a user can apply only once to each department
applicationSchema.index({ userId: 1, department: 1 }, { unique: true });

function arrayLimit(val) {
  return Array.isArray(val) && val.length > 0;
}

module.exports = mongoose.model('Application', applicationSchema);
