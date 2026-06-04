const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbHelpers } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve dashboard static files
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// Auth middleware
const authenticate = async (req, res, next) => {
  const token = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const isValid = await dbHelpers.validateToken(token);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Import routes
const generateRoute = require('./routes/generate');
const modelsRoute = require('./routes/models');
const settingsRoute = require('./routes/settings');
const templatesRoute = require('./routes/templates');
const historyRoute = require('./routes/history');
const authRoute = require('./routes/auth');

// Use routes - dashboard routes bypass auth for convenience
app.use('/api/generate', authenticate, generateRoute);
app.use('/api/models', modelsRoute);  // Allow dashboard to manage models without auth token
app.use('/api/settings', settingsRoute);  // Allow dashboard to manage settings
app.use('/api/templates', authenticate, templatesRoute);
app.use('/api/history', authenticate, historyRoute);
app.use('/api/auth', authRoute);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.8.0', timestamp: new Date().toISOString() });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Engage Pro Backend',
    version: '1.8.0',
    endpoints: [
      { path: '/api/generate', method: 'POST', description: 'Generate AI reply' },
      { path: '/api/models', method: 'GET', description: 'List AI models' },
      { path: '/api/settings/prompt', method: 'GET/POST', description: 'Manage system prompts' },
      { path: '/api/history', method: 'GET', description: 'View generation history' },
      { path: '/api/auth/tokens', method: 'GET/POST', description: 'Manage API tokens' }
    ]
  });
});

// Root redirect to dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`Engage Pro Backend running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`API: http://localhost:${PORT}/api`);
});

module.exports = app;