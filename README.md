# Backend API with Authentication

This is a Node.js backend API with user authentication using MongoDB, JWT tokens, and email functionality.

## Features

- User registration and login
- Password reset via email
- JWT authentication
- Input validation
- Password hashing with bcrypt
- Email notifications

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/apex_auth

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here_change_this_in_production
JWT_EXPIRE=30d

# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Email From Configuration
FROM_NAME=Apex
FROM_EMAIL=noreply@apex.com

# Client URL (for password reset links)
CLIENT_URL=http://localhost:3000
```

3. Make sure MongoDB is running on your system.

4. Start the server:
```bash
npm run dev
```

## API Endpoints

### Authentication

#### Register User
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123"
}
```

#### Login User
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123"
}
```

#### Forgot Password
```
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Reset Password
```
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "reset_token_from_email",
  "password": "NewPassword123"
}
```

#### Get Profile (Protected)
```
GET /api/auth/profile
Authorization: Bearer <jwt_token>
```

#### Update Profile (Protected)
```
PUT /api/auth/profile
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "email": "newemail@example.com"
}
```

### Health Check
```
GET /api/health
```

## Project Structure

```
backend/
├── config/
│   └── database.js          # MongoDB connection
├── controllers/
│   └── authController.js    # Authentication logic
├── middleware/
│   └── auth.js             # JWT authentication middleware
├── models/
│   └── User.js             # User model
├── routes/
│   └── auth.js             # Authentication routes
├── utils/
│   └── auth.js             # Authentication utilities
├── index.js                # Main server file
├── package.json
└── README.md
```

## Password Requirements

Passwords must:
- Be at least 6 characters long
- Contain at least one uppercase letter
- Contain at least one lowercase letter
- Contain at least one number

## Email Setup

For password reset emails to work, configure your SMTP settings in the `.env` file. For Gmail:
1. Enable 2-factor authentication
2. Generate an app password
3. Use the app password in `SMTP_PASSWORD`

## Security Features

- Password hashing with bcrypt (12 salt rounds)
- JWT token authentication
- Password reset tokens expire in 10 minutes
- Input validation and sanitization
- CORS enabled
- Error handling middleware
