const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Rate limiting (simple)
const rateLimit = new Map();
app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxRequests = 100;
    if (rateLimit.has(ip)) {
        const { count, firstRequest } = rateLimit.get(ip);
        if (now - firstRequest < windowMs) {
            if (count >= maxRequests) {
                return res.status(429).json({ success: false, message: 'Too many requests' });
            }
            rateLimit.set(ip, { count: count + 1, firstRequest });
        } else {
            rateLimit.set(ip, { count: 1, firstRequest: now });
        }
    } else {
        rateLimit.set(ip, { count: 1, firstRequest: now });
    }
    next();
});

// ========== FILE UPLOAD ==========
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
if (!fs.existsSync('./prescriptions')) fs.mkdirSync('./prescriptions');
if (!fs.existsSync('./invoices')) fs.mkdirSync('./invoices');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'prescription') cb(null, 'prescriptions/');
        else cb(null, 'uploads/');
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, imageUrl: `/uploads/${req.file.filename}` });
});

app.post('/api/upload-prescription', upload.single('prescription'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, prescriptionUrl: `/prescriptions/${req.file.filename}` });
});

// ========== EMAIL DISABLED (Configure Later) ==========
const sendEmail = async (to, subject, html) => {
    console.log(`📧 Email to: ${to}, Subject: ${subject}`);
    return true;
};

// ========== DATABASE ==========
const DB_FILE = './data/db.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

const initDB = {
    products: [],
    doctors: [],
    orders: [],
    appointments: [],
    labTests: [],
    labBookings: [],
    users: [],
    categories: [],
    banner: { title: "Up to 30% OFF", subtitle: "On selected health products", buttonText: "Shop Now", imageUrl: "" },
    subscribers: [],
    stores: [],
    audit: [],
    coupons: [],
    wallets: [],
    refunds: [],
    reviews: [],
    wishlists: [],
    resetTokens: [],
    settings: {
        lowStockThreshold: 10,
        cartTimeoutMinutes: 15,
        orderCancelMinutes: 5
    }
};

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initDB, null, 2));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// ========== SAMPLE DATA ==========
let db = readDB();
if (db.products.length === 0) {
    db.products = [
        { id: 1, name: "Baby Pampers", category: "baby", pricePerUnit: 850, totalStock: 100, unitType: "pack", discount: 0, discountedPrice: 850, imageUrl: "https://placehold.co/200x150", description: "Soft baby diapers", ratings: [], avgRating: 0, isActive: true },
        { id: 2, name: "Panadol 500mg", category: "medicine", pricePerUnit: 120, totalStock: 500, unitType: "strip", discount: 0, discountedPrice: 120, imageUrl: "https://placehold.co/200x150", description: "Fever relief", ratings: [], avgRating: 0, isActive: true }
    ];
    db.coupons = [
        { id: 1, code: "WELCOME10", discount: 10, type: "percentage", minOrder: 500, validUntil: "2026-12-31", maxUses: 100, usedCount: 0, perUserLimit: 1 }
    ];
    writeDB(db);
}

// ========== CREATE ADMIN ==========
(async () => {
    let db = readDB();
    if (!db.users.find(u => u.role === 'admin')) {
        db.users.push({
            id: Date.now(),
            name: 'Admin',
            email: 'admin@lifemed.com',
            password: await bcrypt.hash('admin123', 10),
            phone: '8214514503',
            role: 'admin',
            status: 'active',
            wallet: 0,
            addresses: [],
            createdAt: new Date()
        });
        writeDB(db);
        console.log('✅ Admin created');
    }
})();

// ========== AUTH MIDDLEWARE ==========
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    try {
        req.user = jwt.verify(token, 'lifemed_secret');
        const db = readDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (user) { req.user.name = user.name; req.user.role = user.role; req.user.wallet = user.wallet || 0; }
        next();
    } catch { res.status(403).json({ success: false, message: 'Invalid token' }); }
};

const adminAuth = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    next();
};

// ========== FORGOT PASSWORD ==========
app.post('/api/auth/forgot-password', async (req, res) => {
    let db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user) return res.json({ success: true, message: 'If email exists, reset link sent' });
    
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    db.resetTokens = db.resetTokens || [];
    db.resetTokens.push({ email: user.email, token, expires });
    writeDB(db);
    
    await sendEmail(user.email, 'Password Reset', `<a href="https://lifemed-healthcare.onrender.com/reset-password?token=${token}">Reset Password</a>`);
    res.json({ success: true });
});

app.post('/api/auth/reset-password', async (req, res) => {
    let db = readDB();
    const { token, newPassword } = req.body;
    const resetEntry = (db.resetTokens || []).find(t => t.token === token && new Date(t.expires) > new Date());
    if (!resetEntry) return res.status(400).json({ success: false });
    
    const user = db.users.find(u => u.email === resetEntry.email);
    if (user) {
        user.password = await bcrypt.hash(newPassword, 10);
        db.resetTokens = db.resetTokens.filter(t => t.token !== token);
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

// ========== AUTH ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
    let db = readDB();
    const { name, email, password, phone } = req.body;
    
    // Validation
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: 'Invalid email' });
    if (db.users.find(u => u.email === email)) return res.status(400).json({ success: false, message: 'Email already exists' });
    
    const user = { id: Date.now(), name, email, password: await bcrypt.hash(password, 10), phone, role: 'user', status: 'active', wallet: 0, addresses: [], createdAt: new Date() };
    db.users.push(user);
    writeDB(db);
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name, email, role: 'user', wallet: 0 } });
});

app.post('/api/auth/login', async (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.status === 'blocked') return res.status(401).json({ success: false, message: 'Account blocked' });
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role, wallet: user.wallet || 0 } });
});

// ========== ADDRESS MANAGEMENT ==========
app.get('/api/addresses', auth, (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    res.json({ success: true, addresses: user.addresses || [] });
});

app.post('/api/addresses', auth, (req, res) => {
    let db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user.addresses) user.addresses = [];
    const address = { id: Date.now(), ...req.body, isDefault: user.addresses.length === 0 };
    user.addresses.push(address);
    writeDB(db);
    res.json({ success: true, address });
});

app.put('/api/addresses/:id/default', auth, (req, res) => {
    let db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    user.addresses.forEach(a => a.isDefault = false);
    const addr = user.addresses.find(a => a.id == req.params.id);
    if (addr) addr.isDefault = true;
    writeDB(db);
    res.json({ success: true });
});

app.delete('/api/addresses/:id', auth, (req, res) => {
    let db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    user.addresses = user.addresses.filter(a => a.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== WISHLIST ==========
app.get('/api/wishlist', auth, (req, res) => {
    const db = readDB();
    const wishlist = (db.wishlists || []).filter(w => w.userId === req.user.id);
    const products = wishlist.map(w => db.products.find(p => p.id === w.productId)).filter(p => p);
    res.json({ success: true, products });
});

app.post('/api/wishlist', auth, (req, res) => {
    let db = readDB();
    if (!db.wishlists) db.wishlists = [];
    const exists = db.wishlists.find(w => w.userId === req.user.id && w.productId === req.body.productId);
    if (!exists) {
        db.wishlists.push({ userId: req.user.id, productId: req.body.productId, addedAt: new Date() });
        writeDB(db);
    }
    res.json({ success: true });
});

app.delete('/api/wishlist/:productId', auth, (req, res) => {
    let db = readDB();
    db.wishlists = db.wishlists.filter(w => !(w.userId === req.user.id && w.productId == req.params.productId));
    writeDB(db);
    res.json({ success: true });
});

// ========== COUPON VALIDATION WITH LIMITS ==========
app.post('/api/validate-coupon', auth, (req, res) => {
    const db = readDB();
    const { code, orderTotal } = req.body;
    const coupon = db.coupons.find(c => c.code === code.toUpperCase());
    
    if (!coupon) return res.json({ success: false, message: 'Invalid coupon' });
    if (new Date(coupon.validUntil) < new Date()) return res.json({ success: false, message: 'Coupon expired' });
    if (orderTotal < coupon.minOrder) return res.json({ success: false, message: `Min order ₹${coupon.minOrder}` });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.json({ success: false, message: 'Coupon fully used' });
    
    // Check per user limit
    const userUsedCoupons = db.orders.filter(o => o.userId === req.user.id && o.couponCode === coupon.code).length;
    if (coupon.perUserLimit && userUsedCoupons >= coupon.perUserLimit) return res.json({ success: false, message: 'You have already used this coupon' });
    
    let discount = coupon.type === 'percentage' ? (orderTotal * coupon.discount / 100) : coupon.discount;
    discount = Math.min(discount, orderTotal);
    res.json({ success: true, discount, message: `₹${discount} off applied` });
});

// ========== ORDER WITH ALL VALIDATIONS ==========
const orderLocks = new Set();
app.post('/api/orders', auth, async (req, res) => {
    // Prevent duplicate submission
    const lockKey = `${req.user.id}_${Date.now()}`;
    if (orderLocks.has(lockKey)) return res.status(429).json({ success: false, message: 'Order already processing' });
    orderLocks.add(lockKey);
    setTimeout(() => orderLocks.delete(lockKey), 5000);
    
    let db = readDB();
    if (!db.orders) db.orders = [];
    if (!db.audit) db.audit = [];
    
    const { items, totalAmount, address, prescription, couponCode, couponDiscount, useWallet, paymentMethod } = req.body;
    const user = db.users.find(u => u.id === req.user.id);
    
    // Validate stock before proceeding
    for (const item of items) {
        const product = db.products.find(p => p.id === item.id);
        if (!product || !product.isActive) return res.status(400).json({ success: false, message: `${item.name} is not available` });
        if (product.totalStock < item.quantity) return res.status(400).json({ success: false, message: `${product.name} only ${product.totalStock} left` });
        if (item.quantity < 1) return res.status(400).json({ success: false, message: `Invalid quantity for ${product.name}` });
    }
    
    let finalAmount = totalAmount;
    let walletUsed = 0;
    let couponApplied = false;
    
    if (couponDiscount && couponDiscount > 0) {
        finalAmount -= couponDiscount;
        couponApplied = true;
    }
    if (useWallet && user.wallet > 0) {
        walletUsed = Math.min(user.wallet, finalAmount);
        finalAmount -= walletUsed;
    }
    
    // Use default address if not provided
    const finalAddress = address || (user.addresses || []).find(a => a.isDefault);
    
    const order = {
        id: Date.now(),
        userId: req.user.id,
        userName: user.name,
        items,
        totalAmount,
        couponCode: couponApplied ? couponCode : null,
        couponDiscount: couponDiscount || 0,
        walletUsed,
        finalAmount,
        address: finalAddress,
        prescription: prescription || null,
        orderDate: new Date(),
        status: 'pending',
        cancelDeadline: new Date(Date.now() + (db.settings?.orderCancelMinutes || 5) * 60 * 1000),
        tracking: { status: 'confirmed', updates: [{ timestamp: new Date(), message: 'Order confirmed' }] }
    };
    
    // Deduct stock and update coupon usage
    for (const item of items) {
        const p = db.products.find(p => p.id === item.id);
        if (p) p.totalStock -= item.quantity;
    }
    
    if (couponApplied && couponCode) {
        const coupon = db.coupons.find(c => c.code === couponCode);
        if (coupon) coupon.usedCount = (coupon.usedCount || 0) + 1;
    }
    
    if (walletUsed > 0) user.wallet -= walletUsed;
    
    db.orders.unshift(order);
    db.audit.unshift({ timestamp: new Date(), staff: user.name, action: 'PLACE_ORDER', details: `Order #${order.id} - ₹${order.finalAmount}` });
    writeDB(db);
    
    await sendEmail(user.email, `Order Confirmed #${order.id}`, `<h2>Order Confirmed!</h2><p>Order ID: ${order.id}</p><p>Total: ₹${order.finalAmount}</p>`);
    
    res.json({ success: true, order, walletBalance: user.wallet });
});

// ========== ORDER CANCELLATION ==========
app.post('/api/orders/:id/cancel', auth, (req, res) => {
    let db = readDB();
    const order = db.orders.find(o => o.id == req.params.id);
    
    if (!order) return res.status(404).json({ success: false });
    if (order.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false });
    if (order.status !== 'pending') return res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
    if (new Date() > new Date(order.cancelDeadline) && req.user.role !== 'admin') return res.status(400).json({ success: false, message: 'Cancel window expired' });
    
    order.status = 'cancelled';
    order.tracking.status = 'cancelled';
    order.tracking.updates.unshift({ timestamp: new Date(), message: 'Order cancelled' });
    
    // Restore stock
    for (const item of order.items) {
        const p = db.products.find(p => p.id === item.id);
        if (p) p.totalStock += item.quantity;
    }
    
    // Refund wallet if used
    if (order.walletUsed > 0) {
        const user = db.users.find(u => u.id === order.userId);
        if (user) user.wallet += order.walletUsed;
    }
    
    writeDB(db);
    res.json({ success: true });
});

// ========== ORDER TRACKING ==========
app.get('/api/orders/:id/track', auth, (req, res) => {
    const db = readDB();
    const order = db.orders.find(o => o.id == req.params.id);
    if (!order || (order.userId !== req.user.id && req.user.role !== 'admin')) return res.status(404).json({ success: false });
    res.json({ success: true, tracking: order.tracking });
});

app.put('/api/admin/orders/:id/status', auth, adminAuth, (req, res) => {
    let db = readDB();
    const order = db.orders.find(o => o.id == req.params.id);
    if (order) {
        order.status = req.body.status;
        order.tracking.status = req.body.status;
        order.tracking.updates.unshift({ timestamp: new Date(), message: `Order ${req.body.status}` });
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

// ========== REFUND REQUEST ==========
app.post('/api/refund-request', auth, (req, res) => {
    let db = readDB();
    if (!db.refunds) db.refunds = [];
    
    // Check if refund already requested
    const existing = db.refunds.find(r => r.orderId === req.body.orderId);
    if (existing) return res.status(400).json({ success: false, message: 'Refund already requested' });
    
    const refund = { id: Date.now(), userId: req.user.id, orderId: req.body.orderId, reason: req.body.reason, amount: req.body.amount, status: 'pending', createdAt: new Date() };
    db.refunds.push(refund);
    writeDB(db);
    res.json({ success: true });
});

// ========== REVIEWS (Prevent duplicate) ==========
app.post('/api/reviews', auth, (req, res) => {
    let db = readDB();
    if (!db.reviews) db.reviews = [];
    
    // Check if user already reviewed this product
    const existing = db.reviews.find(r => r.userId === req.user.id && r.productId === req.body.productId);
    if (existing) {
        existing.rating = req.body.rating;
        existing.comment = req.body.comment;
        existing.editedAt = new Date();
    } else {
        db.reviews.push({ id: Date.now(), userId: req.user.id, userName: req.user.name, productId: req.body.productId, rating: req.body.rating, comment: req.body.comment, createdAt: new Date() });
    }
    
    const product = db.products.find(p => p.id == req.body.productId);
    if (product) {
        const productReviews = db.reviews.filter(r => r.productId == req.body.productId);
        product.avgRating = productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length;
    }
    writeDB(db);
    res.json({ success: true });
});

app.delete('/api/reviews/:reviewId', auth, (req, res) => {
    let db = readDB();
    const review = db.reviews.find(r => r.id == req.params.reviewId);
    if (review && review.userId === req.user.id) {
        db.reviews = db.reviews.filter(r => r.id != req.params.reviewId);
        writeDB(db);
        res.json({ success: true });
    } else res.status(403).json({ success: false });
});

// ========== WALLET ==========
app.get('/api/wallet', auth, (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    res.json({ success: true, balance: user.wallet || 0 });
});

app.post('/api/wallet/add', auth, (req, res) => {
    let db = readDB();
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });
    
    const user = db.users.find(u => u.id === req.user.id);
    if (user) {
        user.wallet = (user.wallet || 0) + amount;
        writeDB(db);
        res.json({ success: true, balance: user.wallet });
    } else res.status(404).json({ success: false });
});

// ========== STOCK ALERT ==========
app.post('/api/stock-alert', auth, (req, res) => {
    let db = readDB();
    if (!db.stockAlerts) db.stockAlerts = [];
    const exists = db.stockAlerts.find(a => a.userId === req.user.id && a.productId === req.body.productId);
    if (!exists) {
        db.stockAlerts.push({ userId: req.user.id, productId: req.body.productId, createdAt: new Date() });
        writeDB(db);
    }
    res.json({ success: true });
});

// ========== SEARCH ==========
app.get('/api/search', (req, res) => {
    const db = readDB();
    const { q, category, minPrice, maxPrice, page = 1, limit = 20 } = req.query;
    let products = [...db.products];
    
    if (q) {
        products = products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.description?.toLowerCase().includes(q.toLowerCase()));
    }
    if (category && category !== 'all') {
        products = products.filter(p => p.category === category);
    }
    if (minPrice) {
        products = products.filter(p => p.pricePerUnit >= parseFloat(minPrice));
    }
    if (maxPrice) {
        products = products.filter(p => p.pricePerUnit <= parseFloat(maxPrice));
    }
    
    const total = products.length;
    const paginated = products.slice((page - 1) * limit, page * limit);
    res.json({ success: true, products: paginated, total, page, totalPages: Math.ceil(total / limit) });
});

// ========== INVOICE GENERATION ==========
app.get('/api/orders/:id/invoice', auth, (req, res) => {
    const db = readDB();
    const order = db.orders.find(o => o.id == req.params.id);
    if (!order || (order.userId !== req.user.id && req.user.role !== 'admin')) return res.status(404).json({ success: false });
    
    const invoice = {
        invoiceNo: `INV-${order.id}`,
        date: order.orderDate,
        customer: order.userName,
        items: order.items,
        subtotal: order.totalAmount,
        discount: order.couponDiscount,
        walletUsed: order.walletUsed,
        total: order.finalAmount,
        status: order.status
    };
    res.json({ success: true, invoice });
});

// ========== RELATED PRODUCTS ==========
app.get('/api/products/:id/related', (req, res) => {
    const db = readDB();
    const product = db.products.find(p => p.id == req.params.id);
    if (!product) return res.json({ success: true, products: [] });
    
    const related = db.products.filter(p => p.id != product.id && p.category === product.category && p.isActive !== false).slice(0, 6);
    res.json({ success: true, products: related });
});

// ========== ADMIN SETTINGS ==========
app.get('/api/admin/settings', auth, adminAuth, (req, res) => {
    const db = readDB();
    res.json({ success: true, settings: db.settings });
});

app.put('/api/admin/settings', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.settings = { ...db.settings, ...req.body };
    writeDB(db);
    res.json({ success: true });
});

// ========== BULK PRODUCT IMPORT ==========
app.post('/api/admin/products/bulk', auth, adminAuth, (req, res) => {
    let db = readDB();
    const { products } = req.body;
    for (const p of products) {
        db.products.push({ id: Date.now() + Math.random(), ...p, createdAt: new Date(), ratings: [], avgRating: 0 });
    }
    writeDB(db);
    res.json({ success: true });
});

// ========== SOFT DELETE PRODUCT ==========
app.delete('/api/admin/products/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    const product = db.products.find(p => p.id == req.params.id);
    if (product) {
        product.isActive = false;
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

// ========== ALL PUBLIC ROUTES ==========
app.get('/api/products', (req, res) => { const db = readDB(); res.json({ success: true, products: db.products.filter(p => p.isActive !== false) }); });
app.get('/api/products/:id', (req, res) => { const db = readDB(); const p = db.products.find(p => p.id == req.params.id); res.json({ success: true, product: p }); });
app.get('/api/categories', (req, res) => { const db = readDB(); res.json({ success: true, categories: db.categories }); });
app.get('/api/banner', (req, res) => { const db = readDB(); res.json({ success: true, banner: db.banner }); });
app.get('/api/stores', (req, res) => { const db = readDB(); res.json({ success: true, stores: db.stores }); });
app.get('/api/coupons', (req, res) => { const db = readDB(); res.json({ success: true, coupons: db.coupons }); });
app.get('/api/orders', auth, (req, res) => { const db = readDB(); res.json({ success: true, orders: db.orders.filter(o => o.userId === req.user.id) }); });
app.get('/api/admin/orders', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, orders: db.orders || [] }); });
app.post('/api/subscribe', (req, res) => { let db = readDB(); const { email } = req.body; if (!db.subscribers) db.subscribers = []; if (db.subscribers.find(s => s.email === email)) return res.status(400).json({ success: false }); db.subscribers.push({ id: Date.now(), email, subscribedAt: new Date() }); writeDB(db); res.json({ success: true }); });

// ========== STATS ==========
app.get('/api/stats', (req, res) => {
    const db = readDB();
    res.json({
        success: true,
        stats: {
            totalProducts: db.products.filter(p => p.isActive !== false).length,
            totalOrders: (db.orders || []).length,
            totalUsers: db.users.filter(u => u.role !== 'admin').length,
            totalSales: (db.orders || []).reduce((s, o) => s + (o.finalAmount || 0), 0),
            lowStock: db.products.filter(p => p.totalStock < (db.settings?.lowStockThreshold || 10)).length
        }
    });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ========== ADMIN ROUTES (CRUD) ==========
app.get('/api/admin/products', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, products: db.products }); });
app.post('/api/admin/products', auth, adminAuth, (req, res) => { let db = readDB(); const product = { id: Date.now(), ...req.body, createdAt: new Date(), ratings: [], avgRating: 0, isActive: true }; db.products.push(product); writeDB(db); res.json({ success: true }); });
app.put('/api/admin/products/:id', auth, adminAuth, (req, res) => { let db = readDB(); const idx = db.products.findIndex(p => p.id == req.params.id); if (idx !== -1) { db.products[idx] = { ...db.products[idx], ...req.body }; writeDB(db); res.json({ success: true }); } else res.status(404).json({ success: false }); });

app.get('/api/admin/doctors', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, doctors: db.doctors }); });
app.post('/api/admin/doctors', auth, adminAuth, (req, res) => { let db = readDB(); db.doctors.push({ id: Date.now(), ...req.body }); writeDB(db); res.json({ success: true }); });
app.delete('/api/admin/doctors/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.doctors = db.doctors.filter(d => d.id != req.params.id); writeDB(db); res.json({ success: true }); });

app.get('/api/admin/categories', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, categories: db.categories }); });
app.post('/api/admin/categories', auth, adminAuth, (req, res) => { let db = readDB(); db.categories.push({ id: Date.now(), ...req.body }); writeDB(db); res.json({ success: true }); });
app.delete('/api/admin/categories/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.categories = db.categories.filter(c => c.id != req.params.id); writeDB(db); res.json({ success: true }); });

app.put('/api/admin/banner', auth, adminAuth, (req, res) => { let db = readDB(); db.banner = { ...db.banner, ...req.body }; writeDB(db); res.json({ success: true }); });

app.post('/api/admin/coupons', auth, adminAuth, (req, res) => { let db = readDB(); db.coupons.push({ id: Date.now(), ...req.body, usedCount: 0 }); writeDB(db); res.json({ success: true }); });
app.delete('/api/admin/coupons/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.coupons = db.coupons.filter(c => c.id != req.params.id); writeDB(db); res.json({ success: true }); });

app.get('/api/admin/users', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, users: db.users.filter(u => u.role !== 'admin') }); });
app.put('/api/admin/users/:id/status', auth, adminAuth, (req, res) => { let db = readDB(); const idx = db.users.findIndex(u => u.id == req.params.id); if (idx !== -1) { db.users[idx].status = req.body.status; writeDB(db); res.json({ success: true }); } else res.status(404).json({ success: false }); });

app.get('/api/admin/audit', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, audit: (db.audit || []).reverse() }); });

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));