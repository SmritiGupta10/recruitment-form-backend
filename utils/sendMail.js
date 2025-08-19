const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendMail = async (receiverEmail, receiverName) => {
  try {
    let emailHtml = fs.readFileSync(
      path.join(__dirname, "email-template.html"), 
      "utf-8"
    );
    emailHtml = emailHtml.replace("{{receiverName}}", receiverName);
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: receiverEmail,
      subject: "MTTN application sent successfully",
      html: emailHtml, 
    });

    console.log("✅ Email sent successfully");
  } catch (error) {
    console.error("❌ Error with sendMail function:", error);
  }
};

module.exports = { sendMail }; 
