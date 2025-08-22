const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

// Transporter setup for Zoho
const transporter = nodemailer.createTransport({
  host: "smtp.zeptomail.in",       // Zoho SMTP
  port: 465,                   // Use 465 for SSL
  secure: true,                // SSL required
  auth: {
    user: process.env.EMAIL_USER, // Your Zoho email
    pass: process.env.EMAIL_PASS, // App password from Zoho
  },
});

// Send mail function
const sendMail = async (receiverEmail, receiverName,templateFile,subject) => {
  try {
    // Load HTML template
    let emailHtml = fs.readFileSync(
      path.join(__dirname, templateFile),
      "utf-8"
    );

    // Replace placeholder with receiver’s name
    emailHtml = emailHtml.replace("{{receiverName}}", receiverName);

    await transporter.sendMail({
      from: `"MTTN" <${process.env.EMAIL_USER}>`,
      to: receiverEmail,
      subject: subject,
      html: emailHtml,
    });

    console.log("✅ Email sent successfully");
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
};

module.exports = { sendMail };
