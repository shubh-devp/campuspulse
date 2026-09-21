const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// GET /api/users/staff  (admin only)
// Staff accounts with workload information
router.get('/staff', roleMiddleware('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.department, u.phone,
              COUNT(DISTINCT a.complaint_id) AS total_assigned,
              COUNT(DISTINCT CASE WHEN c.status IN ('assigned', 'in_progress') THEN a.complaint_id END) AS active,
              COUNT(DISTINCT CASE WHEN c.status IN ('resolved', 'closed') THEN a.complaint_id END) AS resolved
       FROM users u
       LEFT JOIN assignments a ON u.id = a.staff_id
       LEFT JOIN complaints c ON c.id = a.complaint_id
       WHERE u.role IN ('staff', 'admin')
       GROUP BY u.id, u.name, u.email, u.role, u.department, u.phone
       ORDER BY u.name ASC`
    );
    res.json({ staff: result.rows });
  } catch (error) {
    console.error('List staff error:', error.message);
    res.status(500).json({ message: 'Could not load the staff list, please try again' });
  }
});

// POST /api/users/staff  (admin only)
// Create a new staff account
router.post('/staff', roleMiddleware('admin'), async (req, res) => {
  try {
    const { name, email, password, department, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role, department, phone)
       VALUES ($1, $2, $3, 'staff', $4, $5)
       RETURNING id, name, email, role, department, phone`,
      [name.trim(), cleanEmail, passwordHash, department || null, phone || null]
    );
    res.status(201).json({ message: 'Staff account created successfully', user: result.rows[0] });
  } catch (error) {
    console.error('Create staff error:', error.message);
    res.status(500).json({ message: 'Could not create staff account, please try again' });
  }
});

// GET /api/users/me  (all authenticated)
// Get the current user's profile
router.get('/me', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, role, department, phone, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error.message);
    res.status(500).json({ message: 'Could not load profile' });
  }
});

// PATCH /api/users/profile  (all authenticated)
router.patch('/profile', async (req, res) => {
  const { name, department, phone } = req.body;
  try {
    const result = await db.query(
      `UPDATE users SET name = COALESCE($1, name), department = COALESCE($2, department), phone = COALESCE($3, phone), updated_at = LOCALTIMESTAMP WHERE id = $4 RETURNING id, name, email, role, department, phone, created_at, updated_at`,
      [name || null, department || null, phone || null, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({ message: 'Could not update profile' });
  }
});

// PATCH /api/users/change-password  (all authenticated)
router.patch('/change-password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters long' });
  }
  try {
    const userResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const match = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!match) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = $1, updated_at = LOCALTIMESTAMP WHERE id = $2', [newHash, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error.message);
    res.status(500).json({ message: 'Could not change password' });
  }
});

module.exports = router;
