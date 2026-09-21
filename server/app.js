const path = require('path');
const express = require('express');
const cors = require('cors');

const healthRoute = require('./routes/health');
const authRoute = require('./routes/auth');
const complaintsRoute = require('./routes/complaints');
const usersRoute = require('./routes/users');

const app = express();

// Behind a load balancer (Render, Railway, Fly, nginx) the forwarded headers are
// what carry the real client address and protocol. One hop is the usual setup.
app.set('trust proxy', 1);

// CORS_ORIGIN is a comma-separated list of the browser origins allowed to call
// this API, for example "https://campuspulse.example.edu". When it is not set the
// default stays open, which is what local development needs. Set it in production
// so only your own frontend can call the API.
function corsOptions() {
  const allowed = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return allowed.length > 0 ? { origin: allowed } : {};
}

app.use(cors(corsOptions()));
app.use(express.json());

// Uploaded complaint images are served straight from disk
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/health', healthRoute);
app.use('/api/auth', authRoute);
app.use('/api/complaints', complaintsRoute);
app.use('/api/users', usersRoute);

// Last resort handler, so errors are always sent as JSON instead of an HTML page
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({ message: 'Something went wrong' });
});

module.exports = app;
