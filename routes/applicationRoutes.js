const express = require('express');
const router = express.Router();
const { saveApplication } = require('../controllers/applicationController');
router.post('/application', saveApplication);
module.exports = router;