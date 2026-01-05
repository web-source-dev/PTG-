const fs = require('fs').promises;
const path = require('path');
const { createTransporter, emailDefaults } = require('../config/email');

class EmailService {
  constructor() {
    this.transporter = createTransporter();
    this.templatesDir = path.join(__dirname, '..', 'templates', 'emails');
    this.brand = process.env.BRAND_NAME || 'Apex';
  }

  // Read and process template
  async loadTemplate(templateName, data = {}) {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);
      let template = await fs.readFile(templatePath, 'utf-8');

      // Replace placeholders
      template = this.processTemplate(template, data);

      return template;
    } catch (error) {
      console.error(`Error loading template ${templateName}:`, error);
      throw new Error(`Template ${templateName} not found`);
    }
  }

  // Process template with data
  processTemplate(template, data) {
    let processed = template;

    // Add default data
    const defaultData = {
      brand: this.brand,
      year: new Date().getFullYear(),
      loginUrl: `${emailDefaults.clientUrl}/login`,
      ...data
    };

    // Replace all placeholders
    Object.keys(defaultData).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, defaultData[key]);
    });

    return processed;
  }

  // Send email with template
  async sendTemplatedEmail(templateName, recipientEmail, subject, data = {}) {
    try {
      const htmlContent = await this.loadTemplate(templateName, data);

      const mailOptions = {
        from: `"${emailDefaults.from.name}" <${emailDefaults.from.address}>`,
        to: recipientEmail,
        subject: subject,
        html: htmlContent
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`Email sent successfully: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        envelope: info.envelope
      };
    } catch (error) {
      console.error('Error sending templated email:', error);
      throw error;
    }
  }

  // Send plain HTML email (without template)
  async sendHtmlEmail(recipientEmail, subject, htmlContent) {
    try {
      const mailOptions = {
        from: `"${emailDefaults.from.name}" <${emailDefaults.from.address}>`,
        to: recipientEmail,
        subject: subject,
        html: htmlContent
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`HTML email sent successfully: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        envelope: info.envelope
      };
    } catch (error) {
      console.error('Error sending HTML email:', error);
      throw error;
    }
  }

  // Send plain text email
  async sendTextEmail(recipientEmail, subject, textContent) {
    try {
      const mailOptions = {
        from: `"${emailDefaults.from.name}" <${emailDefaults.from.address}>`,
        to: recipientEmail,
        subject: subject,
        text: textContent
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`Text email sent successfully: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        envelope: info.envelope
      };
    } catch (error) {
      console.error('Error sending text email:', error);
      throw error;
    }
  }

  // Welcome email
  async sendWelcomeEmail(email, name) {
    const subject = `Welcome to ${this.brand}!`;
    const data = {
      name: name || 'there',
      loginUrl: `${emailDefaults.clientUrl}/login`
    };

    return await this.sendTemplatedEmail('welcome', email, subject, data);
  }

  // Password reset email
  async sendPasswordResetEmail(email, resetToken) {
    const subject = 'Password Reset Request';
    const data = {
      resetUrl: `${emailDefaults.clientUrl}/reset-password/${resetToken}`
    };

    return await this.sendTemplatedEmail('password-reset', email, subject, data);
  }

  // Password reset success email
  async sendPasswordResetSuccessEmail(email) {
    const subject = 'Password Reset Successful';
    const data = {
      loginUrl: `${emailDefaults.clientUrl}/login`
    };

    return await this.sendTemplatedEmail('password-reset-success', email, subject, data);
  }

  // Email verification email
  async sendEmailVerificationEmail(email, verificationToken, name) {
    const subject = 'Verify Your Email Address';
    const data = {
      name: name || 'there',
      verificationUrl: `${emailDefaults.clientUrl}/verify-email/${verificationToken}`
    };

    return await this.sendTemplatedEmail('email-verification', email, subject, data);
  }

  // Generic notification email
  async sendNotificationEmail(email, subject, message, data = {}) {
    const templateData = {
      message: message,
      ...data
    };

    return await this.sendTemplatedEmail('notification', email, subject, templateData);
  }

  // Test email functionality
  async sendTestEmail(email) {
    const subject = `${this.brand} - Email Test`;
    const data = {
      message: 'This is a test email to verify your email configuration is working correctly.',
      testTime: new Date().toLocaleString()
    };

    return await this.sendTemplatedEmail('test', email, subject, data);
  }
}

// Export singleton instance
const emailService = new EmailService();

module.exports = emailService;
