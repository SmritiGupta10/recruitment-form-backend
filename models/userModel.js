const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, default: uuidv4 },
  firstname: { type: String, required: true, trim: true },
  lastname: { type: String, required: true, trim: true },
  regNo: { type: String, required: true, unique: true, trim: true },
  college: { type: String, required: true, trim: true },
  year: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  createdAt: { type: Date, default: Date.now },
  lastModified: { type: Date, default: Date.now },
  emailStatus: { type: String, enum: ['pending', 'success', 'error', null], default: null },
  lastEmailSentAt: { type: Date, default: null }
  
});
module.exports = mongoose.model('User', userSchema);