const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ========== IMAGE UPLOAD ==========
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
if (!fs.existsSync('./prescriptions')) fs.mkdirSync('./prescriptions');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'prescription') cb(null, 'prescriptions/');
        else cb(null, 'uploads/');
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, imageUrl: `/uploads/${req.file.filename}` });
});

app.post('/api/upload-prescription', upload.single('prescription'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, prescriptionUrl: `/prescriptions/${req.file.filename}` });
});

// ========== EMAIL DISABLED (Configure Later for Paid) ==========
const sendEmail = async (to, subject, html) => {
    console.log(`📧 Email would send to: ${to}, Subject: ${subject}`);
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
    reviews: []
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
        { id: 1, name: "Baby Pampers", category: "baby", pricePerUnit: 850, totalStock: 100, unitType: "pack", discount: 0, discountedPrice: 850, imageUrl: "https://placehold.co/200x150?text=Baby+Pampers", description: "Soft baby diapers", ratings: [], avgRating: 0 },
        { id: 2, name: "Panadol 500mg", category: "medicine", pricePerUnit: 120, totalStock: 500, unitType: "strip", discount: 0, discountedPrice: 120, imageUrl: "https://placehold.co/200x150?text=Panadol", description: "Fever and pain relief", ratings: [], avgRating: 0 },
        { id: 3, name: "Vitamin C", category: "medicine", pricePerUnit: 299, totalStock: 200, unitType: "bottle", discount: 25, discountedPrice: 224, imageUrl: "https://placehold.co/200x150?text=Vitamin+C", description: "Immunity booster", ratings: [], avgRating: 0 }
    ];
    db.doctors = [
        { id: 1, name: "Dr. Ahmed Raza", specialty: "Cardiologist", fees: 1500, availableDays: "Mon, Wed, Fri", availableTime: "10AM-6PM" },
        { id: 2, name: "Dr. Fatima Khan", specialty: "Dermatologist", fees: 1200, availableDays: "Tue, Thu, Sat", availableTime: "11AM-7PM" }
    ];
    db.labTests = [
        { id: 1, name: "Complete Blood Count (CBC)", category: "Blood", price: 500, discount: 0, discountedPrice: 500 },
        { id: 2, name: "Blood Sugar (Fasting)", category: "Blood", price: 200, discount: 0, discountedPrice: 200 }
    ];
    db.categories = [
        { id: 1, name: "Medicine", icon: "fas fa-capsules", imageUrl: "", status: "active" },
        { id: 2, name: "Baby", icon: "fas fa-baby-carriage", imageUrl: "", status: "active" },
        { id: 3, name: "Skincare", icon: "fas fa-spa", imageUrl: "", status: "active" },
        { id: 4, name: "Daily", icon: "fas fa-hand-sparkles", imageUrl: "", status: "active" }
    ];
    db.coupons = [
        { id: 1, code: "WELCOME10", discount: 10, type: "percentage", minOrder: 500, validUntil: "2026-12-31" },
        { id: 2, code: "SAVE50", discount: 50, type: "fixed", minOrder: 1000, validUntil: "2026-12-31" }
    ];
    db.stores = [
        { id: 1, name: "LifeMed Main Store", address: "#123, Rajivnagar", city: "Mysore", phone: "+91 8214514503", timings: "9AM-9PM" }
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
            wallet: 0
        });
        writeDB(db);
        console.log('✅ Admin created: admin@lifemed.com / admin123');
    }
})();

// ========== AUTH MIDDLEWARE ==========
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
    try {
        req.user = jwt.verify(token, 'lifemed_secret');
        const db = readDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (user) { req.user.name = user.name; req.user.role = user.role; req.user.wallet = user.wallet || 0; }
        next();
    } catch (err) {
        res.status(403).json({ success: false, message: 'Invalid token' });
    }
};

const adminAuth = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    next();
};

// ========== AUTH ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
    let db = readDB();
    const { name, email, password, phone } = req.body;
    if (db.users.find(u => u.email === email)) return res.status(400).json({ success: false, message: 'Email already exists' });
    const user = { id: Date.now(), name, email, password: await bcrypt.hash(password, 10), phone, role: 'user', status: 'active', wallet: 0 };
    db.users.push(user);
    writeDB(db);
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role, wallet: user.wallet } });
});

app.post('/api/auth/login', async (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.status === 'blocked') return res.status(401).json({ success: false, message: 'Account blocked' });
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role, wallet: user.wallet || 0 } });
});

// ========== COUPON VALIDATION ==========
app.post('/api/validate-coupon', auth, (req, res) => {
    const db = readDB();
    const { code, orderTotal } = req.body;
    const coupon = db.coupons.find(c => c.code === code.toUpperCase());
    if (!coupon) return res.json({ success: false, message: 'Invalid coupon' });
    if (new Date(coupon.validUntil) < new Date()) return res.json({ success: false, message: 'Coupon expired' });
    if (orderTotal < coupon.minOrder) return res.json({ success: false, message: `Minimum order ₹${coupon.minOrder} required` });
    let discount = coupon.type === 'percentage' ? (orderTotal * coupon.discount / 100) : coupon.discount;
    discount = Math.min(discount, orderTotal);
    res.json({ success: true, discount, message: `Coupon applied! ₹${discount} off` });
});

// ========== ORDER WITH WALLET & COUPON ==========
app.post('/api/orders', auth, async (req, res) => {
    let db = readDB();
    if (!db.orders) db.orders = [];
    if (!db.audit) db.audit = [];
    
    const { items, totalAmount, address, prescription, couponDiscount, useWallet } = req.body;
    const user = db.users.find(u => u.id === req.user.id);
    
    let finalAmount = totalAmount;
    let walletUsed = 0;
    
    if (couponDiscount) finalAmount -= couponDiscount;
    if (useWallet && user.wallet > 0) {
        walletUsed = Math.min(user.wallet, finalAmount);
        finalAmount -= walletUsed;
        user.wallet -= walletUsed;
    }
    
    const order = {
        id: Date.now(),
        userId: req.user.id,
        userName: user.name,
        items,
        totalAmount,
        couponDiscount: couponDiscount || 0,
        walletUsed,
        finalAmount,
        address,
        prescription: prescription || null,
        orderDate: new Date(),
        status: 'pending',
        tracking: { status: 'confirmed', updates: [{ timestamp: new Date(), message: 'Order confirmed' }] }
    };
    
    // Deduct stock
    items.forEach(item => {
        const p = db.products.find(p => p.id === item.id);
        if (p) p.totalStock -= item.quantity;
    });
    
    db.orders.unshift(order);
    db.audit.unshift({ timestamp: new Date(), staff: user.name, action: 'PLACE_ORDER', details: `Order #${order.id} - ₹${order.finalAmount}` });
    writeDB(db);
    
    // Email disabled for now
    await sendEmail(user.email, `Order Confirmed #${order.id}`, `<h2>Thank you for your order!</h2><p>Order ID: ${order.id}</p><p>Total: ₹${order.finalAmount}</p>`);
    
    res.json({ success: true, order, walletBalance: user.wallet });
});

// ========== ORDER TRACKING ==========
app.get('/api/orders/:id/track', auth, (req, res) => {
    const db = readDB();
    const order = db.orders.find(o => o.id == req.params.id);
    if (!order || order.userId !== req.user.id) return res.status(404).json({ success: false });
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
    const refund = { id: Date.now(), userId: req.user.id, orderId: req.body.orderId, reason: req.body.reason, amount: req.body.amount, status: 'pending', createdAt: new Date() };
    db.refunds.push(refund);
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/admin/refunds', auth, adminAuth, (req, res) => {
    const db = readDB();
    res.json({ success: true, refunds: db.refunds || [] });
});

app.put('/api/admin/refunds/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    const refund = db.refunds.find(r => r.id == req.params.id);
    if (refund) {
        refund.status = req.body.status;
        if (req.body.status === 'approved') {
            const user = db.users.find(u => u.id === refund.userId);
            if (user) user.wallet = (user.wallet || 0) + refund.amount;
        }
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

// ========== RATINGS & REVIEWS ==========
app.post('/api/reviews', auth, (req, res) => {
    let db = readDB();
    if (!db.reviews) db.reviews = [];
    const review = { id: Date.now(), userId: req.user.id, userName: req.user.name, productId: req.body.productId, rating: req.body.rating, comment: req.body.comment, createdAt: new Date() };
    db.reviews.push(review);
    
    const product = db.products.find(p => p.id == req.body.productId);
    if (product) {
        const productReviews = db.reviews.filter(r => r.productId == req.body.productId);
        product.avgRating = productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length;
        writeDB(db);
    }
    res.json({ success: true });
});

app.get('/api/reviews/:productId', (req, res) => {
    const db = readDB();
    const reviews = (db.reviews || []).filter(r => r.productId == req.params.productId);
    res.json({ success: true, reviews });
});

// ========== WALLET ==========
app.get('/api/wallet', auth, (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    res.json({ success: true, balance: user.wallet || 0 });
});

app.post('/api/wallet/add', auth, (req, res) => {
    let db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (user) {
        user.wallet = (user.wallet || 0) + req.body.amount;
        writeDB(db);
        res.json({ success: true, balance: user.wallet });
    } else res.status(404).json({ success: false });
});

// ========== SALES REPORTS ==========
app.get('/api/admin/sales-report', auth, adminAuth, (req, res) => {
    const db = readDB();
    let orders = [...(db.orders || [])];
    const totalSales = orders.reduce((s, o) => s + (o.finalAmount || o.totalAmount || 0), 0);
    const totalOrders = orders.length;
    
    res.json({ success: true, report: { totalSales, totalOrders, orders } });
});

// ========== ADMIN PRODUCT ROUTES ==========
app.get('/api/admin/products', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, products: db.products }); });
app.post('/api/admin/products', auth, adminAuth, (req, res) => {
    let db = readDB();
    const product = { id: Date.now(), ...req.body, createdAt: new Date(), ratings: [], avgRating: 0 };
    db.products.push(product);
    db.audit.unshift({ timestamp: new Date(), staff: req.user.name, action: 'ADD_PRODUCT', details: `Added product: ${product.name}` });
    writeDB(db);
    res.json({ success: true, product });
});
app.put('/api/admin/products/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    const idx = db.products.findIndex(p => p.id == req.params.id);
    if (idx !== -1) {
        db.products[idx] = { ...db.products[idx], ...req.body };
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});
app.delete('/api/admin/products/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.products = db.products.filter(p => p.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== ADMIN DOCTOR ROUTES ==========
app.get('/api/admin/doctors', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, doctors: db.doctors }); });
app.post('/api/admin/doctors', auth, adminAuth, (req, res) => {
    let db = readDB();
    const doctor = { id: Date.now(), ...req.body };
    db.doctors.push(doctor);
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/doctors/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.doctors = db.doctors.filter(d => d.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== ADMIN CATEGORY ROUTES ==========
app.get('/api/admin/categories', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, categories: db.categories }); });
app.post('/api/admin/categories', auth, adminAuth, (req, res) => {
    let db = readDB();
    const cat = { id: Date.now(), ...req.body, status: 'active' };
    db.categories.push(cat);
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/categories/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.categories = db.categories.filter(c => c.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== ADMIN BANNER ==========
app.put('/api/admin/banner', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.banner = { ...db.banner, ...req.body };
    writeDB(db);
    res.json({ success: true });
});

// ========== ADMIN SUBSCRIBERS ==========
app.get('/api/admin/subscribers', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, subscribers: db.subscribers || [] }); });
app.delete('/api/admin/subscribers/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.subscribers = (db.subscribers || []).filter(s => s.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== ADMIN STORES ==========
app.post('/api/admin/stores', auth, adminAuth, (req, res) => {
    let db = readDB();
    const store = { id: Date.now(), ...req.body };
    db.stores.push(store);
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/stores/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.stores = (db.stores || []).filter(s => s.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== ADMIN USERS ==========
app.get('/api/admin/users', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, users: db.users.filter(u => u.role !== 'admin') }); });
app.put('/api/admin/users/:id/status', auth, adminAuth, (req, res) => {
    let db = readDB();
    const idx = db.users.findIndex(u => u.id == req.params.id);
    if (idx !== -1) {
        db.users[idx].status = req.body.status;
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});
app.delete('/api/admin/users/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.users = db.users.filter(u => u.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== ADMIN WORKERS ==========
app.get('/api/admin/workers', auth, adminAuth, (req, res) => {
    const db = readDB();
    res.json({ success: true, workers: db.users.filter(u => u.role !== 'admin' && u.role !== 'user') });
});
app.post('/api/admin/workers', auth, adminAuth, async (req, res) => {
    let db = readDB();
    if (db.users.find(u => u.email === req.body.email)) return res.status(400).json({ success: false });
    db.users.push({
        id: Date.now(),
        name: req.body.name,
        email: req.body.email,
        password: await bcrypt.hash(req.body.password, 10),
        role: req.body.role || 'staff',
        status: 'active',
        wallet: 0
    });
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/workers/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.users = db.users.filter(u => u.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== ADMIN AUDIT ==========
app.get('/api/admin/audit', auth, adminAuth, (req, res) => {
    const db = readDB();
    res.json({ success: true, audit: (db.audit || []).reverse() });
});

// ========== ADMIN COUPONS ==========
app.post('/api/admin/coupons', auth, adminAuth, (req, res) => {
    let db = readDB();
    const coupon = { id: Date.now(), ...req.body };
    db.coupons.push(coupon);
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/coupons/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.coupons = db.coupons.filter(c => c.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== PUBLIC ROUTES ==========
app.get('/api/products', (req, res) => { const db = readDB(); res.json({ success: true, products: db.products }); });
app.get('/api/doctors', (req, res) => { const db = readDB(); res.json({ success: true, doctors: db.doctors }); });
app.get('/api/lab-tests', (req, res) => { const db = readDB(); res.json({ success: true, labTests: db.labTests }); });
app.get('/api/categories', (req, res) => { const db = readDB(); res.json({ success: true, categories: db.categories }); });
app.get('/api/banner', (req, res) => { const db = readDB(); res.json({ success: true, banner: db.banner }); });
app.get('/api/stores', (req, res) => { const db = readDB(); res.json({ success: true, stores: db.stores }); });
app.get('/api/coupons', (req, res) => { const db = readDB(); res.json({ success: true, coupons: db.coupons }); });
app.get('/api/orders', auth, (req, res) => { const db = readDB(); res.json({ success: true, orders: db.orders.filter(o => o.userId === req.user.id) }); });
app.get('/api/admin/orders', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, orders: db.orders || [] }); });
app.post('/api/subscribe', (req, res) => {
    let db = readDB();
    const { email } = req.body;
    if (!db.subscribers) db.subscribers = [];
    if (db.subscribers.find(s => s.email === email)) return res.status(400).json({ success: false });
    db.subscribers.push({ id: Date.now(), email, subscribedAt: new Date() });
    writeDB(db);
    res.json({ success: true });
});

// ========== STATS ==========
app.get('/api/stats', (req, res) => {
    const db = readDB();
    res.json({
        success: true,
        stats: {
            totalProducts: db.products.length,
            totalDoctors: db.doctors.length,
            totalOrders: (db.orders || []).length,
            totalAppointments: (db.appointments || []).length,
            totalLabBookings: (db.labBookings || []).length,
            totalUsers: db.users.filter(u => u.role !== 'admin').length,
            totalCategories: (db.categories || []).length,
            totalSubscribers: (db.subscribers || []).length,
            totalStores: (db.stores || []).length,
            lowStock: db.products.filter(p => p.totalStock < 10).length,
            totalSales: (db.orders || []).reduce((s, o) => s + (o.finalAmount || o.totalAmount || 0), 0)
        }
    });
});

app.get('/api/low-stock', (req, res) => { const db = readDB(); res.json({ success: true, products: db.products.filter(p => p.totalStock < 10) }); });
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));