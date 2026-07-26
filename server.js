require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');

const app = express();

// Ensure upload folders exist
['uploads/images', 'uploads/videos'].forEach((dir) => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Generic error handler (e.g. multer file errors)
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ message: err.message || 'Something went wrong.' });
  }
  next();
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/marketplace';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
