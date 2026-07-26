const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const { requireAuth, requireSeller } = require('../middleware/auth');

const router = express.Router();

// --- Multer storage setup ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.mimetype.startsWith('video')
      ? path.join(__dirname, '..', 'uploads', 'videos')
      : path.join(__dirname, '..', 'uploads', 'images');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|mp4|mov|webm/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = file.mimetype.startsWith('image') || file.mimetype.startsWith('video');
  if (ext && mime) return cb(null, true);
  cb(new Error('Only image (jpg, png, webp) and video (mp4, mov, webm) files are allowed.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
});

// POST /api/products  (seller only) - up to 5 images + 1 video
router.post(
  '/',
  requireAuth,
  requireSeller,
  upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'video', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        title,
        description,
        price,
        livestockType,
        breed,
        age,
        weight,
        healthStatus,
        location,
        quantity,
      } = req.body;

      if (!title || !description || !price || !livestockType || !location) {
        return res.status(400).json({
          message: 'Title, description, price, livestock type, and location are required.',
        });
      }

      const images = (req.files?.images || []).map(
        (f) => `/uploads/images/${f.filename}`
      );
      const video = req.files?.video?.[0]
        ? `/uploads/videos/${req.files.video[0].filename}`
        : undefined;

      const product = await Product.create({
        title,
        description,
        price: Number(price),
        livestockType,
        breed,
        age,
        weight,
        healthStatus,
        location,
        quantity: quantity ? Number(quantity) : 1,
        images,
        video,
        seller: req.user.id,
      });

      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ message: 'Failed to create listing.', error: err.message });
    }
  }
);

// GET /api/products  (public, with optional search/type filters)
router.get('/', async (req, res) => {
  try {
    const { q, livestockType } = req.query;
    const filter = { status: 'active' };
    if (livestockType) filter.livestockType = livestockType;
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { breed: { $regex: q, $options: 'i' } },
        { location: { $regex: q, $options: 'i' } },
      ];
    }

    const products = await Product.find(filter)
      .populate('seller', 'name email phone')
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch listings.', error: err.message });
  }
});

// GET /api/products/mine  (seller's own listings)
router.get('/mine', requireAuth, requireSeller, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user.id }).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch your listings.', error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('seller', 'name email phone');
    if (!product) return res.status(404).json({ message: 'Listing not found.' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch listing.', error: err.message });
  }
});

// PUT /api/products/:id  (owner only)
router.put('/:id', requireAuth, requireSeller, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Listing not found.' });
    if (String(product.seller) !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit your own listings.' });
    }

    const fields = [
      'title',
      'description',
      'price',
      'livestockType',
      'breed',
      'age',
      'weight',
      'healthStatus',
      'location',
      'quantity',
      'status',
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined && req.body[f] !== '') {
        product[f] = f === 'price' || f === 'quantity' ? Number(req.body[f]) : req.body[f];
      }
    });

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update listing.', error: err.message });
  }
});

// DELETE /api/products/:id  (owner only)
router.delete('/:id', requireAuth, requireSeller, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Listing not found.' });
    if (String(product.seller) !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own listings.' });
    }

    [...product.images, product.video].filter(Boolean).forEach((relPath) => {
      const filePath = path.join(__dirname, '..', relPath);
      fs.unlink(filePath, () => {});
    });

    await product.deleteOne();
    res.json({ message: 'Listing deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete listing.', error: err.message });
  }
});

module.exports = router;
