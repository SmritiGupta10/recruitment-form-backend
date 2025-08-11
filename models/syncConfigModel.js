const mongoose = require('mongoose');
const syncConfigSchema = new mongoose.Schema({
  key: String,
  value: mongoose.Schema.Types.Mixed
});
module.exports = mongoose.model('SyncConfig', syncConfigSchema);
