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

const DB_FILE = './data/db.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

const initDB = {
    products: [], doctors: [], orders: [], appointments: [], labTests: [], labBookings: [], users: [], audit: []
};

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(initDB, null, 2));

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

let db = readDB();
if (db.products.length === 0) {
    db.products = [
        { id: 1, name: "Baby Pampers", category: "baby", pricePerUnit: 850, totalStock: 100, unitType: "pack", imageUrl: "" },
        { id: 2, name: "Panadol", category: "medicine", pricePerUnit: 120, totalStock: 500, unitType: "strip", imageUrl: "" }
    ];
    db.doctors = [
        { id: 1, name: "Dr. Ahmed", specialty: "Cardiologist", fees: 1500 },
        { id: 2, name: "Dr. Fatima", specialty: "Dermatologist", fees: 1200 }
    ];
    db.labTests = [
        { id: 1, name: "CBC", price: 500 },
        { id: 2, name: "Blood Sugar", price: 200 }
    ];
    writeDB(db);
}

(async () => {
    let db = readDB();
    if (!db.users.find(u => u.role === 'admin')) {
        db.users.push({ id: Date.now(), name: 'Admin', email: 'admin@lifemed.com', password: await bcrypt.hash('admin123', 10), role: 'admin', status: 'active' });
        writeDB(db);
    }
})();

const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    try { req.user = jwt.verify(token, 'lifemed_secret'); next(); } catch { res.status(403).json({ success: false }); }
};

const adminAuth = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    next();
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    let db = readDB();
    const { name, email, password, phone } = req.body;
    if (db.users.find(u => u.email === email)) return res.status(400).json({ success: false });
    const user = { id: Date.now(), name, email, password: await bcrypt.hash(password, 10), phone, role: 'user', status: 'active' };
    db.users.push(user);
    writeDB(db);
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user });
});

app.post('/api/auth/login', async (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false });
    if (user.status === 'blocked') return res.status(401).json({ success: false, message: 'Account blocked' });
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user });
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

// Public Routes
app.get('/api/products', (req, res) => res.json({ success: true, products: readDB().products }));
app.get('/api/doctors', (req, res) => res.json({ success: true, doctors: readDB().doctors }));
app.get('/api/lab-tests', (req, res) => res.json({ success: true, labTests: readDB().labTests }));

app.post('/api/orders', (req, res) => {
    let db = readDB();
    const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: 'confirmed', createdBy: req.body.userName || 'Customer' };
    order.products?.forEach(item => { let p = db.products.find(p => p.id === item.id); if (p) p.totalStock -= item.qty; });
    db.orders = db.orders || [];
    db.orders.unshift(order);
    db.audit = db.audit || [];
    db.audit.unshift({ timestamp: new Date(), staff: order.userName || 'Customer', action: 'PLACE_ORDER', details: `Order #${order.id} - ₹${order.totalAmount}` });
    writeDB(db);
    res.json({ success: true, order });
});

app.get('/api/orders', (req, res) => res.json({ success: true, orders: (readDB().orders || []).reverse() }));
app.post('/api/appointments', (req, res) => { let db = readDB(); db.appointments = db.appointments || []; db.appointments.push({ id: Date.now(), ...req.body, status: 'pending' }); writeDB(db); res.json({ success: true }); });
app.get('/api/appointments', (req, res) => res.json({ success: true, appointments: readDB().appointments || [] }));
app.put('/api/appointments/:id/status', (req, res) => { let db = readDB(); const idx = (db.appointments || []).findIndex(a => a.id == req.params.id); if (idx !== -1) { db.appointments[idx].status = req.body.status; writeDB(db); } res.json({ success: true }); });
app.post('/api/lab-bookings', (req, res) => { let db = readDB(); db.labBookings = db.labBookings || []; db.labBookings.push({ id: Date.now(), ...req.body, status: 'pending' }); writeDB(db); res.json({ success: true }); });
app.get('/api/lab-bookings', (req, res) => res.json({ success: true, bookings: readDB().labBookings || [] }));

app.get('/api/stats', (req, res) => {
    const db = readDB();
    res.json({ success: true, stats: {
        totalProducts: db.products.length, totalDoctors: db.doctors.length, totalOrders: (db.orders || []).length,
        totalAppointments: (db.appointments || []).length, totalLabBookings: (db.labBookings || []).length,
        totalUsers: db.users.filter(u => u.role !== 'admin').length, lowStock: db.products.filter(p => p.totalStock < 10).length
    } });
});

app.get('/api/low-stock', (req, res) => res.json({ success: true, products: readDB().products.filter(p => p.totalStock < 10) }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Admin Routes
app.get('/api/admin/products', auth, adminAuth, (req, res) => res.json({ success: true, products: readDB().products }));
app.post('/api/admin/products', auth, adminAuth, (req, res) => {
    let db = readDB();
    const product = { id: Date.now(), ...req.body, createdBy: req.user.name || 'Admin', createdAt: new Date() };
    db.products.push(product);
    db.audit = db.audit || [];
    db.audit.unshift({ timestamp: new Date(), staff: req.user.name || 'Admin', action: 'ADD_PRODUCT', details: `Added product: ${product.name}` });
    writeDB(db);
    res.json({ success: true, product });
});
app.put('/api/admin/products/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    const idx = db.products.findIndex(p => p.id == req.params.id);
    if (idx !== -1) { db.products[idx] = { ...db.products[idx], ...req.body }; writeDB(db); res.json({ success: true }); }
    else res.status(404).json({ success: false });
});
app.delete('/api/admin/products/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.products = db.products.filter(p => p.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});
app.get('/api/admin/doctors', auth, adminAuth, (req, res) => res.json({ success: true, doctors: readDB().doctors }));
app.post('/api/admin/doctors', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.doctors.push({ id: Date.now(), ...req.body, createdBy: req.user.name || 'Admin' });
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/doctors/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.doctors = db.doctors.filter(d => d.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});
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

// User Management
app.get('/api/admin/users', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, users: db.users.filter(u => u.role !== 'admin') }); });
app.put('/api/admin/users/:id/status', auth, adminAuth, (req, res) => { let db = readDB(); const idx = db.users.findIndex(u => u.id == req.params.id); if (idx !== -1) { db.users[idx].status = req.body.status; writeDB(db); res.json({ success: true }); } else res.status(404).json({ success: false }); });
app.delete('/api/admin/users/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.users = db.users.filter(u => u.id != req.params.id); writeDB(db); res.json({ success: true }); });

// Worker Management
app.get('/api/admin/workers', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, workers: db.users.filter(u => u.role !== 'admin' && u.role !== 'user') }); });
app.post('/api/admin/workers', auth, adminAuth, async (req, res) => {
    let db = readDB();
    if (db.users.find(u => u.email === req.body.email)) return res.status(400).json({ success: false });
    db.users.push({ id: Date.now(), name: req.body.name, email: req.body.email, password: await bcrypt.hash(req.body.password, 10), role: req.body.role || 'staff', status: 'active' });
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/workers/:id', auth, adminAuth, (req, res) => { let db = readDB(); db.users = db.users.filter(u => u.id != req.params.id); writeDB(db); res.json({ success: true }); });

// Audit Log
app.get('/api/admin/audit', auth, adminAuth, (req, res) => { const db = readDB(); res.json({ success: true, audit: (db.audit || []).reverse() }); });

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));