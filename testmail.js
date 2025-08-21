const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

dotenv.config(); // loads EMAIL_USER and EMAIL_PASS from .env

// Setup Zoho transporter
const transporter = nodemailer.createTransport({
  host: "smtp.zoho.in", // for zoho.com accounts
  port: 465,             // SSL port
  secure: true,          // true = use SSL
  auth: {
    user: process.env.EMAIL_USER, // e.g. yourname@yourdomain.org
    pass: process.env.EMAIL_PASS, // Zoho app password (NOT normal password)
  },
});

// Test function
(async () => {
  try {
    const info = await transporter.sendMail({
      from: `"MTTN Team" <${process.env.EMAIL_USER}>`, // sender
      to: "gotomail.cc@gmail.com",               // change to your test email
      subject: "🔔 Test Email from Zoho",
      text: "Hello! This is a plain text test email from Zoho + Nodemailer.",
      html: "<p>Hello! 👋<br>This is a <b>test email</b> from <u>Zoho + Nodemailer</u>.</p>",
    });

    console.log("✅ Email sent successfully:", info.messageId);
  } catch (err) {
    console.error("❌ Error sending email:", err);
  }
})();
