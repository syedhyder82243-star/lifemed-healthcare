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

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, imageUrl: `/uploads/${req.file.filename}` });
});

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
    audit: []
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
        { id: 1, name: "Baby Pampers", category: "baby", pricePerUnit: 850, totalStock: 100, unitType: "pack", discount: 0, discountedPrice: 850, imageUrl: "https://placehold.co/200x150?text=Baby+Pampers", description: "Soft baby diapers" },
        { id: 2, name: "Panadol 500mg", category: "medicine", pricePerUnit: 120, totalStock: 500, unitType: "strip", discount: 0, discountedPrice: 120, imageUrl: "https://placehold.co/200x150?text=Panadol", description: "Fever and pain relief" },
        { id: 3, name: "Vitamin C", category: "medicine", pricePerUnit: 299, totalStock: 200, unitType: "bottle", discount: 25, discountedPrice: 224, imageUrl: "https://placehold.co/200x150?text=Vitamin+C", description: "Immunity booster" }
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
    db.stores = [
        { id: 1, name: "LifeMed Main Store", address: "#123, Rajivnagar", city: "Mysore", phone: "+91 8214514503", timings: "9AM-9PM" }
    ];
    writeDB(db);
}

// ========== CREATE ADMIN ==========
(async () => {
    let db = readDB();
    const adminExists = db.users.find(u => u.role === 'admin');
    if (!adminExists) {
        db.users.push({
            id: Date.now(),
            name: 'Admin',
            email: 'admin@lifemed.com',
            password: await bcrypt.hash('admin123', 10),
            phone: '8214514503',
            role: 'admin',
            status: 'active'
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
        // Get full user details including name
        const db = readDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (user) {
            req.user.name = user.name;
            req.user.role = user.role;
        }
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
    const user = { id: Date.now(), name, email, password: await bcrypt.hash(password, 10), phone, role: 'user', status: 'active' };
    db.users.push(user);
    writeDB(db);
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/login', async (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.status === 'blocked') return res.status(401).json({ success: false, message: 'Account blocked' });
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.put('/api/auth/change-password', auth, async (req, res) => {
    let db = readDB();
    const idx = db.users.findIndex(u => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ success: false });
    const valid = await bcrypt.compare(req.body.currentPassword, db.users[idx].password);
    if (!valid) return res.status(401).json({ success: false });
    db.users[idx].password = await bcrypt.hash(req.body.newPassword, 10);
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/auth/profile', auth, (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (user) { const { password, ...rest } = user; res.json({ success: true, user: rest }); }
    else res.status(404).json({ success: false });
});

app.put('/api/auth/profile', auth, (req, res) => {
    let db = readDB();
    const idx = db.users.findIndex(u => u.id === req.user.id);
    if (idx !== -1) {
        if (req.body.name) db.users[idx].name = req.body.name;
        if (req.body.email) db.users[idx].email = req.body.email;
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

// ========== PUBLIC ROUTES ==========
app.get('/api/products', (req, res) => { const db = readDB(); res.json({ success: true, products: db.products }); });
app.get('/api/doctors', (req, res) => { const db = readDB(); res.json({ success: true, doctors: db.doctors }); });
app.get('/api/lab-tests', (req, res) => { const db = readDB(); res.json({ success: true, labTests: db.labTests }); });
app.get('/api/categories', (req, res) => { const db = readDB(); res.json({ success: true, categories: db.categories }); });
app.get('/api/banner', (req, res) => { const db = readDB(); res.json({ success: true, banner: db.banner }); });
app.get('/api/stores', (req, res) => { const db = readDB(); res.json({ success: true, stores: db.stores }); });

// ========== ORDER WITH STOCK DEDUCT ==========
app.post('/api/orders', (req, res) => {
    let db = readDB();
    if (!db.orders) db.orders = [];
    if (!db.audit) db.audit = [];
    
    const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: 'confirmed', createdBy: req.body.userName || 'Customer' };
    if (order.products) {
        order.products.forEach(item => {
            const p = db.products.find(p => p.id === item.id);
            if (p && p.totalStock) p.totalStock -= (item.qty || 1);
        });
    }
    db.orders.unshift(order);
    db.audit.unshift({ timestamp: new Date(), staff: order.createdBy, action: 'PLACE_ORDER', details: `Order #${order.id} - ₹${order.totalAmount}` });
    writeDB(db);
    res.json({ success: true, order });
});

app.get('/api/orders', (req, res) => { const db = readDB(); res.json({ success: true, orders: (db.orders || []).reverse() }); });

app.post('/api/appointments', (req, res) => {
    let db = readDB();
    if (!db.appointments) db.appointments = [];
    db.appointments.push({ id: Date.now(), ...req.body, status: 'pending' });
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/appointments', (req, res) => { const db = readDB(); res.json({ success: true, appointments: db.appointments || [] }); });

app.put('/api/appointments/:id/status', (req, res) => {
    let db = readDB();
    const idx = (db.appointments || []).findIndex(a => a.id == req.params.id);
    if (idx !== -1) {
        db.appointments[idx].status = req.body.status;
        writeDB(db);
    }
    res.json({ success: true });
});

app.post('/api/lab-bookings', (req, res) => {
    let db = readDB();
    if (!db.labBookings) db.labBookings = [];
    db.labBookings.push({ id: Date.now(), ...req.body, status: 'pending' });
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/lab-bookings', (req, res) => { const db = readDB(); res.json({ success: true, bookings: db.labBookings || [] }); });

app.put('/api/lab-bookings/:id/status', (req, res) => {
    let db = readDB();
    const idx = (db.labBookings || []).findIndex(b => b.id == req.params.id);
    if (idx !== -1) {
        db.labBookings[idx].status = req.body.status;
        writeDB(db);
    }
    res.json({ success: true });
});

app.post('/api/subscribe', (req, res) => {
    let db = readDB();
    const { email } = req.body;
    if (!db.subscribers) db.subscribers = [];
    if (db.subscribers.find(s => s.email === email)) return res.status(400).json({ success: false, message: 'Already subscribed' });
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
            lowStock: db.products.filter(p => p.totalStock < 10).length
        }
    });
});

app.get('/api/low-stock', (req, res) => { const db = readDB(); res.json({ success: true, products: db.products.filter(p => p.totalStock < 10) }); });
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ========== ADMIN ROUTES ==========
app.get('/api/admin/products', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, products: db.products }); });
app.post('/api/admin/products', auth, adminAuth, (req, res) => {
    let db = readDB();
    if (!db.audit) db.audit = [];
    const product = { id: Date.now(), ...req.body, createdAt: new Date() };
    db.products.push(product);
    db.audit.unshift({ timestamp: new Date(), staff: req.user.name || 'Admin', action: 'ADD_PRODUCT', details: `Added product: ${product.name}` });
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

app.get('/api/admin/lab-tests', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, labTests: db.labTests }); });
app.post('/api/admin/lab-tests', auth, adminAuth, (req, res) => {
    let db = readDB();
    const test = { id: Date.now(), ...req.body, discountedPrice: req.body.price - (req.body.price * (req.body.discount || 0) / 100) };
    db.labTests.push(test);
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/lab-tests/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.labTests = db.labTests.filter(t => t.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// Categories Management
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

// Banner Management
app.put('/api/admin/banner', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.banner = { ...db.banner, ...req.body };
    writeDB(db);
    res.json({ success: true });
});

// Subscribers Management
app.get('/api/admin/subscribers', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, subscribers: db.subscribers || [] }); });
app.delete('/api/admin/subscribers/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.subscribers = (db.subscribers || []).filter(s => s.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// Stores Management
app.post('/api/admin/stores', auth, adminAuth, (req, res) => {
    let db = readDB();
    if (!db.stores) db.stores = [];
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

// User Management
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

// Worker Management
app.get('/api/admin/workers', auth, adminAuth, (req, res) => { 
    const db = readDB(); 
    res.json({ success: true, workers: db.users.filter(u => u.role !== 'admin' && u.role !== 'user') }); 
});
app.post('/api/admin/workers', auth, adminAuth, async (req, res) => {
    let db = readDB();
    if (db.users.find(u => u.email === req.body.email)) return res.status(400).json({ success: false, message: 'Email exists' });
    db.users.push({ 
        id: Date.now(), 
        name: req.body.name, 
        email: req.body.email, 
        password: await bcrypt.hash(req.body.password, 10), 
        role: req.body.role || 'staff', 
        status: 'active' 
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

// Audit Log
app.get('/api/admin/audit', auth, adminAuth, (req, res) => { 
    const db = readDB(); 
    res.json({ success: true, audit: (db.audit || []).reverse() }); 
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));