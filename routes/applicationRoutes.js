const express = require('express');
const router = express.Router();
const { saveApplication } = require('../controllers/applicationController');
const { sendMail } = require('../utils/sendMail');
router.post('/application', saveApplication);
router.post("/send-thankyou-mail", async (req, res) => {
    try {
      const { email, name } = req.body;
  
      if (!email || !name) {
        return res.status(400).json({ error: "Email and name are required" });
      }
  
      await sendMail(
        email,
        name,
        "email-template.html", 
        "We’ve received your application ✅"
      );
  
      return res.status(200).json({ message: "Mail sent successfully" });
    } catch (error) {
      console.error("❌ Error in /send-application-mail:", error);
      return res.status(500).json({ error: "Failed to send email" });
    }
  });
module.exports = router;