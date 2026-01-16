const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('./emailService');

// Generate JWT token
const generateToken = (user) => {
  // Set token expiration to 1 month (30 days)
  // Only logout when token expires or user clicks logout button
  return jwt.sign(
    {
      id: user._id,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '30d' // 30 days = 1 month
    }
  );
};

// Generate reset password token
const generateResetToken = () => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  return { resetToken, hashedToken };
};

// Send password reset email using email service
const sendPasswordResetEmail = async (email, resetToken) => {
  return await emailService.sendPasswordResetEmail(email, resetToken);
};

// Send welcome email using email service
const sendWelcomeEmail = async (email, name) => {
  return await emailService.sendWelcomeEmail(email, name);
};

// Send password reset success email
const sendPasswordResetSuccessEmail = async (email) => {
  return await emailService.sendPasswordResetSuccessEmail(email);
};

// Send email verification email
const sendEmailVerificationEmail = async (email, verificationToken, name) => {
  return await emailService.sendEmailVerificationEmail(email, verificationToken, name);
};

module.exports = {
  generateToken,
  generateResetToken,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordResetSuccessEmail,
  sendEmailVerificationEmail
};
