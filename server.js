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
app.use('/invoices', express.static('invoices'));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Rate limiting
const rateLimit = new Map();
app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    if (rateLimit.has(ip)) {
        const { count, firstRequest } = rateLimit.get(ip);
        if (now - firstRequest < 60000 && count >= 100) {
            return res.status(429).json({ success: false, message: 'Too many requests' });
        }
        rateLimit.set(ip, { count: count + 1, firstRequest });
    } else {
        rateLimit.set(ip, { count: 1, firstRequest: now });
    }
    next();
});

// ========== FILE UPLOAD ==========
['uploads', 'prescriptions', 'invoices', 'returns'].forEach(dir => {
    if (!fs.existsSync(`./${dir}`)) fs.mkdirSync(`./${dir}`);
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'prescription') cb(null, 'prescriptions/');
        else if (file.fieldname === 'returnImage') cb(null, 'returns/');
        else if (file.fieldname === 'invoice') cb(null, 'invoices/');
        else cb(null, 'uploads/');
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, imageUrl: `/uploads/${req.file.filename}` });
});

app.post('/api/upload-prescription', upload.single('prescription'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, prescriptionUrl: `/prescriptions/${req.file.filename}` });
});

app.post('/api/upload-return-image', upload.array('returnImages', 5), (req, res) => {
    if (!req.files || req.files.length === 0) return res.json({ success: true, images: [] });
    const urls = req.files.map(f => `/returns/${f.filename}`);
    res.json({ success: true, images: urls });
});

// ========== EMAIL DISABLED ==========
const sendEmail = async (to, subject, html) => {
    console.log(`📧 [EMAIL] To: ${to}, Subject: ${subject}`);
    return true;
};

// ========== DATABASE ==========
const DB_FILE = './data/db.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

const initDB = {
    products: [], doctors: [], orders: [], appointments: [], labTests: [], labBookings: [],
    users: [], categories: [], banner: { title: "Up to 30% OFF", subtitle: "On selected health products", buttonText: "Shop Now", imageUrl: "" },
    subscribers: [], stores: [], audit: [], coupons: [], wallets: [], refunds: [], reviews: [],
    wishlists: [], resetTokens: [], stockAlerts: [], communicationLogs: [], staffPerformance: [],
    inventoryLogs: [], variants: [], batches: [], returnRequests: [],
    settings: {
        lowStockThreshold: 10, cartTimeoutMinutes: 15, orderCancelMinutes: 5,
        maxCODOrder: 5000, allowDiscountStacking: false, maxDiscountPercent: 50,
        returnShippingPaidBy: 'customer', defaultGST: 5, autoReorderStock: 20,
        deliverySlots: ['9AM-12PM', '12PM-3PM', '3PM-6PM', '6PM-9PM']
    }
};

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(initDB, null, 2));

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// ========== SAMPLE DATA ==========
let db = readDB();
if (db.products.length === 0) {
    db.products = [
        { id: 1, name: "Baby Pampers", category: "baby", pricePerUnit: 850, totalStock: 100, unitType: "pack", discount: 0, discountedPrice: 850, imageUrl: "https://placehold.co/200x150", description: "Soft baby diapers", ratings: [], avgRating: 0, isActive: true, minOrderQty: 1, expiryDate: "2026-12-31", batchNo: "BATCH001", storeId: 1, variantOf: null },
        { id: 2, name: "Panadol 500mg", category: "medicine", pricePerUnit: 120, totalStock: 500, unitType: "strip", discount: 0, discountedPrice: 120, imageUrl: "https://placehold.co/200x150", description: "Fever relief", ratings: [], avgRating: 0, isActive: true, minOrderQty: 1, expiryDate: "2025-12-31", batchNo: "BATCH002", storeId: 1, variantOf: null }
    ];
    db.categories = [
        { id: 1, name: "Medicine", icon: "fas fa-capsules", tax: 5, status: "active" },
        { id: 2, name: "Baby", icon: "fas fa-baby-carriage", tax: 0, status: "active" }
    ];
    db.stores = [
        { id: 1, name: "LifeMed Mysore", address: "#123 Rajivnagar", city: "Mysore", pincode: "570019", phone: "8214514503", inventory: {} }
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
            id: Date.now(), name: 'Super Admin', email: 'admin@lifemed.com',
            password: await bcrypt.hash('admin123', 10), phone: '8214514503',
            role: 'admin', status: 'active', wallet: 0, addresses: [],
            creditLimit: 0, creditUsed: 0, gstin: '', createdAt: new Date()
        });
        writeDB(db);
        console.log('✅ Super Admin created');
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
        if (user) { req.user.name = user.name; req.user.role = user.role; req.user.wallet = user.wallet || 0; req.user.creditLimit = user.creditLimit || 0; }
        next();
    } catch { res.status(403).json({ success: false, message: 'Invalid token' }); }
};

const adminAuth = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    next();
};

// ========== AUTH ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
    let db = readDB();
    const { name, email, password, phone, gstin, role = 'user' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be 6+ characters' });
    if (db.users.find(u => u.email === email)) return res.status(400).json({ success: false, message: 'Email exists' });
    
    const user = { id: Date.now(), name, email, password: await bcrypt.hash(password, 10), phone, role, gstin, status: 'active', wallet: 0, addresses: [], creditLimit: role === 'wholesale' ? 50000 : 0, creditUsed: 0, createdAt: new Date() };
    db.users.push(user);
    writeDB(db);
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name, email, role, wallet: 0 } });
});

app.post('/api/auth/login', async (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.status === 'blocked') return res.status(401).json({ success: false, message: 'Account blocked' });
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role, wallet: user.wallet || 0, creditLimit: user.creditLimit, creditUsed: user.creditUsed, gstin: user.gstin } });
});

// ========== FORGOT PASSWORD ==========
app.post('/api/auth/forgot-password', async (req, res) => {
    let db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user) return res.json({ success: true, message: 'If email exists, reset link sent' });
    const token = crypto.randomBytes(32).toString('hex');
    db.resetTokens = db.resetTokens || [];
    db.resetTokens.push({ email: user.email, token, expires: new Date(Date.now() + 3600000) });
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
    const products = wishlist.map(w => db.products.find(p => p.id === w.productId)).filter(p => p && p.isActive);
    res.json({ success: true, products });
});

app.post('/api/wishlist', auth, (req, res) => {
    let db = readDB();
    if (!db.wishlists) db.wishlists = [];
    const exists = db.wishlists.find(w => w.userId === req.user.id && w.productId === req.body.productId);
    if (!exists) db.wishlists.push({ userId: req.user.id, productId: req.body.productId, addedAt: new Date() });
    writeDB(db);
    res.json({ success: true });
});

app.delete('/api/wishlist/:productId', auth, (req, res) => {
    let db = readDB();
    db.wishlists = db.wishlists.filter(w => !(w.userId === req.user.id && w.productId == req.params.productId));
    writeDB(db);
    res.json({ success: true });
});

// ========== STOCK ALERT ==========
app.post('/api/stock-alert', auth, (req, res) => {
    let db = readDB();
    if (!db.stockAlerts) db.stockAlerts = [];
    const exists = db.stockAlerts.find(a => a.userId === req.user.id && a.productId === req.body.productId);
    if (!exists) db.stockAlerts.push({ userId: req.user.id, productId: req.body.productId, createdAt: new Date() });
    writeDB(db);
    res.json({ success: true });
});

// ========== COUPON VALIDATION ==========
app.post('/api/validate-coupon', auth, (req, res) => {
    const db = readDB();
    const { code, orderTotal } = req.body;
    const coupon = db.coupons.find(c => c.code === code.toUpperCase());
    if (!coupon) return res.json({ success: false, message: 'Invalid coupon' });
    if (new Date(coupon.validUntil) < new Date()) return res.json({ success: false, message: 'Coupon expired' });
    if (orderTotal < coupon.minOrder) return res.json({ success: false, message: `Min order ₹${coupon.minOrder}` });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.json({ success: false, message: 'Coupon fully used' });
    const userUsedCoupons = db.orders.filter(o => o.userId === req.user.id && o.couponCode === coupon.code).length;
    if (coupon.perUserLimit && userUsedCoupons >= coupon.perUserLimit) return res.json({ success: false, message: 'You have already used this coupon' });
    let discount = coupon.type === 'percentage' ? (orderTotal * coupon.discount / 100) : coupon.discount;
    discount = Math.min(discount, orderTotal);
    res.json({ success: true, discount, message: `₹${discount} off applied` });
});

// ========== ORDER PLACEMENT ==========
const orderLocks = new Set();
app.post('/api/orders', auth, async (req, res) => {
    const lockKey = `${req.user.id}_${Date.now()}`;
    if (orderLocks.has(lockKey)) return res.status(429).json({ success: false, message: 'Order already processing' });
    orderLocks.add(lockKey);
    setTimeout(() => orderLocks.delete(lockKey), 5000);
    
    let db = readDB();
    const { items, totalAmount, address, prescription, couponCode, couponDiscount, useWallet, useCredit, paymentMethod, deliverySlot, expectedDate } = req.body;
    const user = db.users.find(u => u.id === req.user.id);
    const settings = db.settings;
    
    if (paymentMethod === 'cod' && totalAmount > settings.maxCODOrder) {
        return res.status(400).json({ success: false, message: `COD not available for orders above ₹${settings.maxCODOrder}` });
    }
    
    for (const item of items) {
        const product = db.products.find(p => p.id === item.id);
        if (!product || !product.isActive) return res.status(400).json({ success: false, message: `${item.name} not available` });
        if (product.totalStock < item.quantity) return res.status(400).json({ success: false, message: `${product.name} only ${product.totalStock} left` });
        if (item.quantity < product.minOrderQty) return res.status(400).json({ success: false, message: `${product.name} minimum order ${product.minOrderQty}` });
        if (product.expiryDate && new Date(product.expiryDate) < new Date()) return res.status(400).json({ success: false, message: `${product.name} is expired` });
    }
    
    let finalAmount = totalAmount;
    let discountApplied = 0;
    let walletUsed = 0;
    let creditUsed = 0;
    
    if (couponDiscount && settings.allowDiscountStacking !== false) {
        finalAmount -= couponDiscount;
        discountApplied = couponDiscount;
    }
    if (useWallet && user.wallet > 0) {
        walletUsed = Math.min(user.wallet, finalAmount);
        finalAmount -= walletUsed;
    }
    if (useCredit && user.creditLimit && user.creditLimit - user.creditUsed >= finalAmount) {
        creditUsed = finalAmount;
        finalAmount = 0;
        user.creditUsed = (user.creditUsed || 0) + creditUsed;
    }
    
    const itemsWithTax = items.map(item => {
        const product = db.products.find(p => p.id === item.id);
        const category = db.categories.find(c => c.name === product.category);
        const taxRate = category?.tax || settings.defaultGST;
        const taxAmount = (item.price * item.quantity * taxRate) / 100;
        return { ...item, taxRate, taxAmount, total: item.price * item.quantity + taxAmount };
    });
    
    const order = {
        id: Date.now(), userId: req.user.id, userName: user.name, items: itemsWithTax,
        totalAmount, couponDiscount: discountApplied, walletUsed, creditUsed, finalAmount,
        paymentMethod, address: address || (user.addresses || []).find(a => a.isDefault),
        prescription, deliverySlot, expectedDeliveryDate: expectedDate,
        orderDate: new Date(), status: 'confirmed',
        statusHistory: [{ status: 'confirmed', timestamp: new Date(), note: 'Order confirmed' }],
        cancelDeadline: new Date(Date.now() + settings.orderCancelMinutes * 60 * 1000),
        batchNumbers: items.map(item => ({ productId: item.id, batchNo: db.products.find(p => p.id === item.id)?.batchNo }))
    };
    
    // Deduct stock and log inventory
    for (const item of items) {
        const p = db.products.find(p => p.id === item.id);
        if (p) {
            p.totalStock -= item.quantity;
            if (!db.inventoryLogs) db.inventoryLogs = [];
            db.inventoryLogs.unshift({ productId: item.id, change: -item.quantity, newStock: p.totalStock, staff: req.user.name, timestamp: new Date() });
            
            // Auto reorder alert
            if (p.totalStock <= settings.autoReorderStock) {
                await sendEmail('admin@lifemed.com', `Low Stock Alert: ${p.name}`, `Stock is now ${p.totalStock}. Please reorder.`);
            }
        }
    }
    
    if (couponCode) {
        const coupon = db.coupons.find(c => c.code === couponCode);
        if (coupon) coupon.usedCount = (coupon.usedCount || 0) + 1;
    }
    if (walletUsed > 0) user.wallet -= walletUsed;
    
    db.orders.unshift(order);
    if (!db.audit) db.audit = [];
    db.audit.unshift({ timestamp: new Date(), staff: user.name, action: 'PLACE_ORDER', details: `Order #${order.id} - ₹${order.finalAmount}` });
    writeDB(db);
    
    await sendEmail(user.email, `Order Confirmed #${order.id}`, `<h2>Order Confirmed!</h2><p>Order ID: ${order.id}</p><p>Total: ₹${order.finalAmount}</p><p>Delivery Slot: ${deliverySlot || 'Standard'}</p>`);
    
    res.json({ success: true, order, walletBalance: user.wallet, creditBalance: user.creditLimit - user.creditUsed });
});

// ========== ORDER STATUS WORKFLOW ==========
const orderStatusFlow = ['confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
app.put('/api/admin/orders/:id/status', auth, adminAuth, (req, res) => {
    let db = readDB();
    const order = db.orders.find(o => o.id == req.params.id);
    if (order) {
        const currentIndex = orderStatusFlow.indexOf(order.status);
        const newIndex = orderStatusFlow.indexOf(req.body.status);
        if (newIndex < currentIndex && req.body.status !== 'cancelled') {
            return res.status(400).json({ success: false, message: 'Cannot move backward in status' });
        }
        order.status = req.body.status;
        if (!order.statusHistory) order.statusHistory = [];
        order.statusHistory.unshift({ status: req.body.status, timestamp: new Date(), note: req.body.note || '' });
        
        if (!db.staffPerformance) db.staffPerformance = [];
        db.staffPerformance.unshift({ staff: req.user.name, action: `ORDER_STATUS_${req.body.status}`, orderId: order.id, timestamp: new Date() });
        
        // Send email on status change
        const user = db.users.find(u => u.id === order.userId);
        if (user) {
            sendEmail(user.email, `Order #${order.id} Status Update`, `<h2>Order Status: ${req.body.status}</h2><p>Your order is now ${req.body.status}</p>`);
        }
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

// ========== BULK ORDER STATUS UPDATE ==========
app.post('/api/admin/orders/bulk-status', auth, adminAuth, (req, res) => {
    let db = readDB();
    const { orderIds, status } = req.body;
    let count = 0;
    for (const id of orderIds) {
        const order = db.orders.find(o => o.id == id);
        if (order && order.status !== 'delivered' && order.status !== 'cancelled') {
            order.status = status;
            if (!order.statusHistory) order.statusHistory = [];
            order.statusHistory.unshift({ status, timestamp: new Date(), note: 'Bulk update' });
            count++;
        }
    }
    writeDB(db);
    res.json({ success: true, updatedCount: count });
});

// ========== ORDER CANCELLATION ==========
app.post('/api/orders/:id/cancel', auth, (req, res) => {
    let db = readDB();
    const order = db.orders.find(o => o.id == req.params.id);
    if (!order) return res.status(404).json({ success: false });
    if (order.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false });
    if (order.status !== 'confirmed') return res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
    if (new Date() > new Date(order.cancelDeadline) && req.user.role !== 'admin') return res.status(400).json({ success: false, message: 'Cancel window expired' });
    
    order.status = 'cancelled';
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.unshift({ status: 'cancelled', timestamp: new Date(), note: 'Order cancelled by ' + (req.user.role === 'admin' ? 'admin' : 'customer') });
    
    for (const item of order.items) {
        const p = db.products.find(p => p.id === item.id);
        if (p) p.totalStock += item.quantity;
    }
    if (order.walletUsed > 0) {
        const user = db.users.find(u => u.id === order.userId);
        if (user) user.wallet += order.walletUsed;
    }
    if (order.creditUsed > 0) {
        const user = db.users.find(u => u.id === order.userId);
        if (user) user.creditUsed = Math.max(0, (user.creditUsed || 0) - order.creditUsed);
    }
    writeDB(db);
    res.json({ success: true });
});

// ========== ORDER TRACKING ==========
app.get('/api/orders/:id/track', auth, (req, res) => {
    const db = readDB();
    const order = db.orders.find(o => o.id == req.params.id);
    if (!order || (order.userId !== req.user.id && req.user.role !== 'admin')) return res.status(404).json({ success: false });
    res.json({ success: true, tracking: { status: order.status, history: order.statusHistory || [], estimatedDelivery: order.expectedDeliveryDate } });
});

// ========== RETURN REQUEST WITH IMAGES ==========
app.post('/api/return-request', auth, (req, res) => {
    let db = readDB();
    if (!db.returnRequests) db.returnRequests = [];
    const existing = db.returnRequests.find(r => r.orderId === req.body.orderId);
    if (existing && existing.status === 'approved') return res.status(400).json({ success: false, message: 'Return already approved' });
    if (existing && existing.status === 'pending') return res.status(400).json({ success: false, message: 'Return already requested' });
    
    const returnReq = {
        id: Date.now(), userId: req.user.id, orderId: req.body.orderId,
        items: req.body.items, reason: req.body.reason, reasonDetail: req.body.reasonDetail,
        images: req.body.images || [], amount: req.body.amount,
        status: 'pending', createdAt: new Date()
    };
    db.returnRequests.push(returnReq);
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/admin/returns', auth, adminAuth, (req, res) => {
    const db = readDB();
    res.json({ success: true, returns: db.returnRequests || [] });
});

app.put('/api/admin/returns/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    const returnReq = db.returnRequests.find(r => r.id == req.params.id);
    if (!returnReq) return res.status(404).json({ success: false });
    if (returnReq.status === 'approved') return res.status(400).json({ success: false, message: 'Already approved' });
    
    returnReq.status = req.body.status;
    returnReq.adminNotes = req.body.notes;
    returnReq.resolvedAt = new Date();
    
    if (req.body.status === 'approved') {
        const user = db.users.find(u => u.id === returnReq.userId);
        if (user) user.wallet = (user.wallet || 0) + returnReq.amount;
        const order = db.orders.find(o => o.id === returnReq.orderId);
        if (order) order.status = 'returned';
    }
    writeDB(db);
    res.json({ success: true });
});

// ========== REVIEWS ==========
app.post('/api/reviews', auth, (req, res) => {
    let db = readDB();
    if (!db.reviews) db.reviews = [];
    const existing = db.reviews.find(r => r.userId === req.user.id && r.productId === req.body.productId);
    if (existing) {
        existing.rating = req.body.rating;
        existing.comment = req.body.comment;
        existing.images = req.body.images || [];
        existing.editedAt = new Date();
    } else {
        db.reviews.push({ id: Date.now(), userId: req.user.id, userName: req.user.name, productId: req.body.productId, rating: req.body.rating, comment: req.body.comment, images: req.body.images || [], createdAt: new Date() });
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
    if (review && (review.userId === req.user.id || req.user.role === 'admin')) {
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

// ========== SEARCH WITH PAGINATION ==========
app.get('/api/search', (req, res) => {
    const db = readDB();
    const { q, category, minPrice, maxPrice, page = 1, limit = 20 } = req.query;
    let products = db.products.filter(p => p.isActive !== false);
    if (q) products = products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.description?.toLowerCase().includes(q.toLowerCase()));
    if (category && category !== 'all') products = products.filter(p => p.category === category);
    if (minPrice) products = products.filter(p => p.pricePerUnit >= parseFloat(minPrice));
    if (maxPrice) products = products.filter(p => p.pricePerUnit <= parseFloat(maxPrice));
    const total = products.length;
    const paginated = products.slice((page - 1) * limit, page * limit);
    res.json({ success: true, products: paginated, total, page, totalPages: Math.ceil(total / limit), limit });
});

// ========== INVOICE WITH GST ==========
app.get('/api/orders/:id/invoice', auth, (req, res) => {
    const db = readDB();
    const order = db.orders.find(o => o.id == req.params.id);
    if (!order || (order.userId !== req.user.id && req.user.role !== 'admin')) return res.status(404).json({ success: false });
    const user = db.users.find(u => u.id === order.userId);
    const invoice = {
        invoiceNo: `INV-${order.id}`, date: order.orderDate,
        customer: { name: order.userName, gstin: user?.gstin, address: order.address },
        items: order.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, taxRate: i.taxRate, taxAmount: i.taxAmount, total: i.total })),
        subtotal: order.totalAmount, discount: order.couponDiscount, walletUsed: order.walletUsed, total: order.finalAmount, status: order.status
    };
    res.json({ success: true, invoice });
});

// ========== CSV EXPORT ORDERS ==========
app.get('/api/admin/export-orders', auth, adminAuth, (req, res) => {
    const db = readDB();
    const orders = db.orders || [];
    const csv = ['Order ID,Date,Customer,Email,Total,Status,Payment Method'];
    orders.forEach(o => {
        const user = db.users.find(u => u.id === o.userId);
        csv.push(`${o.id},${new Date(o.orderDate).toLocaleDateString()},${o.userName},${user?.email || ''},${o.finalAmount},${o.status},${o.paymentMethod}`);
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
    res.send(csv.join('\n'));
});

// ========== STAFF PERFORMANCE ==========
app.get('/api/admin/staff-performance', auth, adminAuth, (req, res) => {
    const db = readDB();
    const performance = db.staffPerformance || [];
    const summary = {};
    for (const p of performance) {
        if (!summary[p.staff]) summary[p.staff] = { orders: 0, statusChanges: 0 };
        summary[p.staff].statusChanges++;
        if (p.action.includes('ORDER_STATUS')) summary[p.staff].orders++;
    }
    res.json({ success: true, performance: Object.entries(summary).map(([staff, data]) => ({ staff, ...data })), logs: performance.slice(0, 100) });
});

// ========== PRODUCT VARIANTS ==========
app.get('/api/products/:id/variants', (req, res) => {
    const db = readDB();
    const product = db.products.find(p => p.id == req.params.id);
    if (!product) return res.json({ success: true, variants: [] });
    const variants = db.products.filter(p => p.variantOf === product.id || (product.variantOf && p.variantOf === product.variantOf));
    res.json({ success: true, variants });
});

app.post('/api/admin/products/:id/variants', auth, adminAuth, (req, res) => {
    let db = readDB();
    const parentId = parseInt(req.params.id);
    const variant = { id: Date.now(), ...req.body, variantOf: parentId, createdAt: new Date(), ratings: [], avgRating: 0, isActive: true };
    db.products.push(variant);
    writeDB(db);
    res.json({ success: true, variant });
});

// ========== COMMUNICATION LOG ==========
app.post('/api/admin/communication-log', auth, adminAuth, (req, res) => {
    let db = readDB();
    if (!db.communicationLogs) db.communicationLogs = [];
    db.communicationLogs.push({ ...req.body, staff: req.user.name, timestamp: new Date() });
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/admin/communication-log/:userId', auth, adminAuth, (req, res) => {
    const db = readDB();
    const logs = (db.communicationLogs || []).filter(l => l.userId == req.params.userId);
    res.json({ success: true, logs });
});

// ========== EXPIRED PRODUCTS ==========
app.get('/api/admin/expired-products', auth, adminAuth, (req, res) => {
    const db = readDB();
    const expired = db.products.filter(p => p.expiryDate && new Date(p.expiryDate) < new Date());
    res.json({ success: true, products: expired });
});

// ========== INVENTORY LOGS ==========
app.get('/api/admin/inventory-logs', auth, adminAuth, (req, res) => {
    const db = readDB();
    res.json({ success: true, logs: db.inventoryLogs || [] });
});

// ========== BULK PRODUCT IMPORT ==========
app.post('/api/admin/products/bulk', auth, adminAuth, (req, res) => {
    let db = readDB();
    const { products } = req.body;
    for (const p of products) {
        db.products.push({ id: Date.now() + Math.random(), ...p, createdAt: new Date(), ratings: [], avgRating: 0, isActive: true });
    }
    writeDB(db);
    res.json({ success: true, count: products.length });
});

// ========== PUBLIC ROUTES ==========
app.get('/api/products', (req, res) => { const db = readDB(); res.json({ success: true, products: db.products.filter(p => p.isActive !== false) }); });
app.get('/api/products/:id', (req, res) => { const db = readDB(); const p = db.products.find(p => p.id == req.params.id); res.json({ success: true, product: p }); });
app.get('/api/products/:id/related', (req, res) => {
    const db = readDB();
    const product = db.products.find(p => p.id == req.params.id);
    if (!product) return res.json({ success: true, products: [] });
    const related = db.products.filter(p => p.id != product.id && p.category === product.category && p.isActive !== false).slice(0, 6);
    res.json({ success: true, products: related });
});
app.get('/api/categories', (req, res) => { const db = readDB(); res.json({ success: true, categories: db.categories }); });
app.get('/api/banner', (req, res) => { const db = readDB(); res.json({ success: true, banner: db.banner }); });
app.get('/api/stores', (req, res) => { const db = readDB(); res.json({ success: true, stores: db.stores }); });
app.get('/api/coupons', (req, res) => { const db = readDB(); res.json({ success: true, coupons: db.coupons }); });
app.get('/api/orders', auth, (req, res) => { const db = readDB(); res.json({ success: true, orders: db.orders.filter(o => o.userId === req.user.id) }); });
app.get('/api/admin/orders', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, orders: db.orders || [] }); });
app.post('/api/subscribe', (req, res) => { let db = readDB(); const { email } = req.body; if (!db.subscribers) db.subscribers = []; if (db.subscribers.find(s => s.email === email)) return res.status(400).json({ success: false }); db.subscribers.push({ id: Date.now(), email, subscribedAt: new Date() }); writeDB(db); res.json({ success: true }); });
app.get('/api/admin/settings', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, settings: db.settings }); });
app.put('/api/admin/settings', auth, adminAuth, (req, res) => { let db = readDB(); db.settings = { ...db.settings, ...req.body }; writeDB(db); res.json({ success: true }); });

// ========== STATS ==========
app.get('/api/stats', (req, res) => {
    const db = readDB();
    res.json({
        success: true, stats: {
            totalProducts: db.products.filter(p => p.isActive !== false).length,
            totalOrders: (db.orders || []).length,
            totalUsers: db.users.filter(u => u.role !== 'admin').length,
            totalSales: (db.orders || []).reduce((s, o) => s + (o.finalAmount || 0), 0),
            lowStock: db.products.filter(p => p.totalStock < (db.settings?.lowStockThreshold || 10)).length,
            expiredProducts: db.products.filter(p => p.expiryDate && new Date(p.expiryDate) < new Date()).length,
            pendingReturns: (db.returnRequests || []).filter(r => r.status === 'pending').length
        }
    });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ========== ADMIN CRUD ROUTES ==========
app.get('/api/admin/products', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, products: db.products }); });
app.post('/api/admin/products', auth, adminAuth, (req, res) => { let db = readDB(); db.products.push({ id: Date.now(), ...req.body, createdAt: new Date(), ratings: [], avgRating: 0, isActive: true }); writeDB(db); res.json({ success: true }); });
app.put('/api/admin/products/:id', auth, adminAuth, (req, res) => { let db = readDB(); const idx = db.products.findIndex(p => p.id == req.params.id); if (idx !== -1) { db.products[idx] = { ...db.products[idx], ...req.body }; writeDB(db); res.json({ success: true }); } else res.status(404).json({ success: false }); });
app.delete('/api/admin/products/:id', auth, adminAuth, (req, res) => { let db = readDB(); const idx = db.products.findIndex(p => p.id == req.params.id); if (idx !== -1) { db.products[idx].isActive = false; writeDB(db); res.json({ success: true }); } else res.status(404).json({ success: false }); });

app.get('/api/admin/doctors', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, doctors: db.doctors }); });
app.post('/api/admin/doctors', auth, adminAuth, (req, res) => { let db = readDB(); db.doctors.push({ id: Date.now(), ...req.body }); writeDB(db); res.json({ success: true }); });
app.delete('/api/admin/doctors/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.doctors = db.doctors.filter(d => d.id != req.params.id); writeDB(db); res.json({ success: true }); });

app.get('/api/admin/categories', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, categories: db.categories }); });
app.post('/api/admin/categories', auth, adminAuth, (req, res) => { let db = readDB(); db.categories.push({ id: Date.now(), ...req.body, status: 'active' }); writeDB(db); res.json({ success: true }); });
app.delete('/api/admin/categories/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.categories = db.categories.filter(c => c.id != req.params.id); writeDB(db); res.json({ success: true }); });

app.put('/api/admin/banner', auth, adminAuth, (req, res) => { let db = readDB(); db.banner = { ...db.banner, ...req.body }; writeDB(db); res.json({ success: true }); });

app.post('/api/admin/coupons', auth, adminAuth, (req, res) => { let db = readDB(); db.coupons.push({ id: Date.now(), ...req.body, usedCount: 0 }); writeDB(db); res.json({ success: true }); });
app.delete('/api/admin/coupons/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.coupons = db.coupons.filter(c => c.id != req.params.id); writeDB(db); res.json({ success: true }); });

app.get('/api/admin/users', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, users: db.users.filter(u => u.role !== 'admin') }); });
app.put('/api/admin/users/:id/status', auth, adminAuth, (req, res) => { let db = readDB(); const idx = db.users.findIndex(u => u.id == req.params.id); if (idx !== -1) { db.users[idx].status = req.body.status; writeDB(db); res.json({ success: true }); } else res.status(404).json({ success: false }); });
app.put('/api/admin/users/:id/credit', auth, adminAuth, (req, res) => { let db = readDB(); const idx = db.users.findIndex(u => u.id == req.params.id); if (idx !== -1) { db.users[idx].creditLimit = req.body.creditLimit; writeDB(db); res.json({ success: true }); } else res.status(404).json({ success: false }); });

app.get('/api/admin/audit', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, audit: (db.audit || []).reverse() }); });
app.get('/api/admin/subscribers', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, subscribers: db.subscribers || [] }); });
app.post('/api/admin/stores', auth, adminAuth, (req, res) => { let db = readDB(); db.stores.push({ id: Date.now(), ...req.body }); writeDB(db); res.json({ success: true }); });
app.delete('/api/admin/stores/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.stores = db.stores.filter(s => s.id != req.params.id); writeDB(db); res.json({ success: true }); });

app.post('/api/admin/workers', auth, adminAuth, async (req, res) => { let db = readDB(); if (db.users.find(u => u.email === req.body.email)) return res.status(400).json({ success: false }); db.users.push({ id: Date.now(), name: req.body.name, email: req.body.email, password: await bcrypt.hash(req.body.password, 10), role: req.body.role || 'staff', status: 'active', wallet: 0, addresses: [], createdAt: new Date() }); writeDB(db); res.json({ success: true }); });
app.delete('/api/admin/workers/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.users = db.users.filter(u => u.id != req.params.id); writeDB(db); res.json({ success: true }); });

// ========== STOCK INCREMENT (NOT OVERWRITE) ==========
app.post('/api/admin/products/:id/stock', auth, adminAuth, (req, res) => {
    let db = readDB();
    const { quantity, note } = req.body;
    const product = db.products.find(p => p.id == req.params.id);
    if (product) {
        const oldStock = product.totalStock;
        product.totalStock += quantity;
        if (!db.inventoryLogs) db.inventoryLogs = [];
        db.inventoryLogs.unshift({ productId: product.id, change: quantity, oldStock, newStock: product.totalStock, staff: req.user.name, note, timestamp: new Date() });
        writeDB(db);
        res.json({ success: true, newStock: product.totalStock });
    } else res.status(404).json({ success: false });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Ultimate server running on port ${PORT}`));