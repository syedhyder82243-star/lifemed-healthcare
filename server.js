const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ========== RAZORPAY SETUP ==========
// Go to https://razorpay.com → Signup → Dashboard → API Keys
// Copy Key ID and Key Secret
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YourKeyHere',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'YourSecretHere'
});

// ========== DATABASE SETUP ==========
const DB_PATH = './data/db.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
        products: [],
        doctors: [],
        orders: [],
        appointments: [],
        users: [],
        labTests: [],
        labBookings: []
    }));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_PATH));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// ========== SAMPLE DATA ==========
let db = getDB();
if (db.products.length === 0) {
    db.products = [
        { id: 1, name: "Baby Pampers", category: "baby", pricePerUnit: 850, totalStock: 100, unitType: "pack" },
        { id: 2, name: "Panadol", category: "medicine", pricePerUnit: 120, totalStock: 500, unitType: "strip" }
    ];
    db.doctors = [
        { id: 1, name: "Dr. Ahmed", specialty: "Cardiologist", fees: 1500 },
        { id: 2, name: "Dr. Fatima", specialty: "Dermatologist", fees: 1200 }
    ];
    saveDB(db);
    console.log("Sample data added");
}

// ========== CREATE ADMIN USER (First Time) ==========
const createAdmin = async () => {
    const db = getDB();
    const adminExists = db.users.find(u => u.role === 'admin');
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        db.users.push({
            id: Date.now(),
            name: 'Admin',
            email: 'admin@lifemed.com',
            password: hashedPassword,
            role: 'admin'
        });
        saveDB(db);
        console.log('Admin created: admin@lifemed.com / admin123');
    }
};
createAdmin();

// ========== AUTH MIDDLEWARE ==========
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Access denied' });
    try {
        const verified = jwt.verify(token, 'lifemed_secret_key');
        req.user = verified;
        next();
    } catch (error) {
        res.status(403).json({ success: false, message: 'Invalid token' });
    }
};

const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

// ========== AUTH APIs ==========
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.email === email);
    
    if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        'lifemed_secret_key',
        { expiresIn: '7d' }
    );
    
    res.json({ success: true, token, role: user.role, name: user.name });
});

// ========== PAYMENT APIs ==========
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount } = req.body;
        const options = {
            amount: amount * 100, // Convert to paise
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
            payment_capture: 1
        };
        const order = await razorpay.orders.create(options);
        res.json({ success: true, order });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/verify-payment', (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'YourSecretHere');
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');
    
    if (generatedSignature === razorpay_signature) {
        res.json({ success: true, message: 'Payment verified' });
    } else {
        res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
});

// ========== PROTECTED ADMIN APIs ==========
app.get('/api/admin/products', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    res.json({ success: true, products: db.products });
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    const product = { id: Date.now(), ...req.body };
    db.products.push(product);
    saveDB(db);
    res.json({ success: true, product });
});

app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    db.products = db.products.filter(p => p.id != req.params.id);
    saveDB(db);
    res.json({ success: true });
});

app.get('/api/admin/doctors', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    res.json({ success: true, doctors: db.doctors });
});

app.post('/api/admin/doctors', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    const doctor = { id: Date.now(), ...req.body };
    db.doctors.push(doctor);
    saveDB(db);
    res.json({ success: true, doctor });
});

app.delete('/api/admin/doctors/:id', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    db.doctors = db.doctors.filter(d => d.id != req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// ========== PUBLIC APIs ==========
app.get('/api/products', (req, res) => {
    res.json({ success: true, products: getDB().products });
});

app.get('/api/doctors', (req, res) => {
    res.json({ success: true, doctors: getDB().doctors });
});

app.post('/api/orders', (req, res) => {
    const db = getDB();
    const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: "confirmed" };
    db.orders.unshift(order);
    saveDB(db);
    res.json({ success: true, order });
});

app.get('/api/orders', (req, res) => {
    res.json({ success: true, orders: getDB().orders.reverse() });
});

app.post('/api/appointments', (req, res) => {
    const db = getDB();
    const apt = { id: Date.now(), ...req.body };
    db.appointments.push(apt);
    saveDB(db);
    res.json({ success: true, appointment: apt });
});

app.get('/api/appointments', (req, res) => {
    res.json({ success: true, appointments: getDB().appointments });
});

app.put('/api/appointments/:id/status', (req, res) => {
    const db = getDB();
    const index = db.appointments.findIndex(a => a.id == req.params.id);
    if (index !== -1) {
        db.appointments[index].status = req.body.status;
        saveDB(db);
    }
    res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
    const db = getDB();
    res.json({
        success: true,
        stats: {
            totalProducts: db.products.length,
            totalDoctors: db.doctors.length,
            totalOrders: db.orders.length,
            totalAppointments: db.appointments.length,
            lowStock: db.products.filter(p => p.totalStock < 10).length
        }
    });
});

app.get('/api/low-stock', (req, res) => {
    res.json({ success: true, products: getDB().products.filter(p => p.totalStock < 10) });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Admin Login: admin@lifemed.com / admin7410');
});