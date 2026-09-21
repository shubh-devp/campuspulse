const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const db = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

const SALT_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The token only carries the identity the app needs on every request
function createToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

// POST /api/auth/register
// Admin only: creates a new user account with the specified role
router.post('/register', roleMiddleware('admin'), async (req, res) => {
  try {
    const { name, email, password, department, phone, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(cleanEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    // Default role to student if not specified or not valid
    let userRole = 'student';
    const validRoles = ['student', 'staff', 'admin'];
    if (role && validRoles.includes(role)) {
      userRole = role;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role, department, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, department, phone`,
      [name.trim(), cleanEmail, passwordHash, userRole, department || null, phone || null]
    );

    res.status(201).json({
      message: 'Registration successful',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ message: 'Could not create the account, please try again' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const result = await db.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
      [cleanEmail]
    );

    // Same message for unknown email and wrong password, so we never reveal which emails exist
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({
      message: 'Login successful',
      token: createToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Could not log in, please try again' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role, department, phone FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Current user error:', error.message);
    res.status(500).json({ message: 'Could not load the user, please try again' });
  }
});

// POST /api/auth/register-student
// Public registration for students only. Always creates role = student.
router.post('/register-student', async (req, res) => {
  try {
    const { name, email, password, department, phone } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!EMAIL_PATTERN.test(cleanEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address' })
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' })
    }

    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [cleanEmail])
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists' })
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role, department, phone)
       VALUES ($1, $2, $3, 'student', $4, $5)
       RETURNING id, name, email, role, department, phone`,
      [name.trim(), cleanEmail, passwordHash, department || null, phone || null]
    )

    res.status(201).json({
      message: 'Student registration successful',
      user: result.rows[0],
    })
  } catch (error) {
    console.error('Student register error:', error.message)
    res.status(500).json({ message: 'Could not create student account, please try again' })
  }
})

module.exports = router;
