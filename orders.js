const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/orders  - create an order from cart items
// body: { items: [{ productId, quantity }], shippingAddress }
router.post('/', requireAuth, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ message: 'Your cart is empty.' });
    }

    const orderItems = [];
    let total = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || product.status !== 'active') continue;

      const quantity = Math.max(1, Number(item.quantity) || 1);
      orderItems.push({
        product: product._id,
        title: product.title,
        price: product.price,
        quantity,
        seller: product.seller,
      });
      total += product.price * quantity;
    }

    if (!orderItems.length) {
      return res.status(400).json({ message: 'None of the items in your cart are available.' });
    }

    const order = await Order.create({
      buyer: req.user.id,
      items: orderItems,
      total,
      shippingAddress: shippingAddress || '',
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: 'Checkout failed.', error: err.message });
  }
});

// GET /api/orders/mine  - buyer's order history
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders.', error: err.message });
  }
});

// GET /api/orders/selling  - seller's incoming orders (orders containing their products)
router.get('/selling', requireAuth, async (req, res) => {
  try {
    const orders = await Order.find({ 'items.seller': req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch sales.', error: err.message });
  }
});

module.exports = router;
