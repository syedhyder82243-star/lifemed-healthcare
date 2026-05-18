const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== DATABASE SETUP ==========
const DB_PATH = './data/db.json';
const DATA_DIR = './data';

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initialize database
if (!fs.existsSync(DB_PATH)) {
    const initialData = {
        products: [],
        doctors: [],
        orders: [],
        appointments: [],
        users: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    console.log('Database created');
}

const getDB = () => {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
};

const saveDB = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// ========== CREATE ADMIN USER ==========
const createAdmin = async () => {
    const db = getDB();
    if (!db.users) db.users = [];
    
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

// ========== SAMPLE DATA ==========
const addSampleData = () => {
    const db = getDB();
    if (!db.products) db.products = [];
    if (!db.doctors) db.doctors = [];
    
    if (db.products.length === 0) {
        db.products.push(
            { id: Date.now() + 1, name: "Baby Pampers", pricePerUnit: 850, totalStock: 100, unitType: "pack" },
            { id: Date.now() + 2, name: "Panadol", pricePerUnit: 120, totalStock: 500, unitType: "strip" }
        );
        db.doctors.push(
            { id: Date.now() + 1, name: "Dr. Ahmed", specialty: "Cardiologist", fees: 1500 },
            { id: Date.now() + 2, name: "Dr. Fatima", specialty: "Dermatologist", fees: 1200 }
        );
        saveDB(db);
        console.log('Sample data added');
    }
};
addSampleData();

// ========== AUTH MIDDLEWARE ==========
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Access denied' });
    try {
        const verified = jwt.verify(token, 'lifemed_secret');
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

// ========== LOGIN API ==========
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDB();
        if (!db.users) return res.status(401).json({ success: false, message: 'No users' });
        
        const user = db.users.find(u => u.email === email);
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, 'lifemed_secret', { expiresIn: '7d' });
        res.json({ success: true, token, role: user.role, name: user.name });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== PUBLIC APIs ==========
app.get('/api/products', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, products: db.products || [] });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/doctors', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, doctors: db.doctors || [] });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/orders', (req, res) => {
    try {
        const db = getDB();
        if (!db.orders) db.orders = [];
        const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: 'confirmed' };
        db.orders.unshift(order);
        saveDB(db);
        res.json({ success: true, order });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/orders', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, orders: (db.orders || []).reverse() });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/appointments', (req, res) => {
    try {
        const db = getDB();
        if (!db.appointments) db.appointments = [];
        const apt = { id: Date.now(), ...req.body };
        db.appointments.push(apt);
        saveDB(db);
        res.json({ success: true, appointment: apt });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/appointments', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, appointments: db.appointments || [] });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.put('/api/appointments/:id/status', (req, res) => {
    try {
        const db = getDB();
        const index = (db.appointments || []).findIndex(a => a.id == req.params.id);
        if (index !== -1) {
            db.appointments[index].status = req.body.status;
            saveDB(db);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/stats', (req, res) => {
    try {
        const db = getDB();
        res.json({
            success: true,
            stats: {
                totalProducts: (db.products || []).length,
                totalDoctors: (db.doctors || []).length,
                totalOrders: (db.orders || []).length,
                totalAppointments: (db.appointments || []).length,
                lowStock: (db.products || []).filter(p => p.totalStock < 10).length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/low-stock', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, products: (db.products || []).filter(p => p.totalStock < 10) });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// ========== ADMIN APIs ==========
app.get('/api/admin/products', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    res.json({ success: true, products: db.products || [] });
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    if (!db.products) db.products = [];
    const product = { id: Date.now(), ...req.body };
    db.products.push(product);
    saveDB(db);
    res.json({ success: true, product });
});

app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    db.products = (db.products || []).filter(p => p.id != req.params.id);
    saveDB(db);
    res.json({ success: true });
});

app.get('/api/admin/doctors', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    res.json({ success: true, doctors: db.doctors || [] });
});

app.post('/api/admin/doctors', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    if (!db.doctors) db.doctors = [];
    const doctor = { id: Date.now(), ...req.body };
    db.doctors.push(doctor);
    saveDB(db);
    res.json({ success: true, doctor });
});

app.delete('/api/admin/doctors/:id', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    db.doctors = (db.doctors || []).filter(d => d.id != req.params.id);
    saveDB(db);
    res.json({ success: true });
});

app.get('/api/auth/profile', authMiddleware, (req, res) => {
    const db = getDB();
    const user = (db.users || []).find(u => u.id === req.user.id);
    if (user) {
        const { password, ...rest } = user;
        res.json({ success: true, user: rest });
    } else {
        res.status(404).json({ success: false });
    }
});

app.put('/api/admin/profile', authMiddleware, adminMiddleware, async (req, res) => {
    const { name, email, password } = req.body;
    const db = getDB();
    const index = (db.users || []).findIndex(u => u.id === req.user.id);
    if (index !== -1) {
        if (name) db.users[index].name = name;
        if (email) db.users[index].email = email;
        if (password) db.users[index].password = await bcrypt.hash(password, 10);
        saveDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

app.get('/api/admin/workers', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    const workers = (db.users || []).filter(u => u.role !== 'admin');
    res.json({ success: true, workers });
});

app.post('/api/admin/workers', authMiddleware, adminMiddleware, async (req, res) => {
    const { name, email, password, role } = req.body;
    const db = getDB();
    if (!db.users) db.users = [];
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email exists' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const worker = { id: Date.now(), name, email, password: hashed, role: role || 'staff' };
    db.users.push(worker);
    saveDB(db);
    res.json({ success: true, worker });
});

app.delete('/api/admin/workers/:id', authMiddleware, adminMiddleware, (req, res) => {
    const db = getDB();
    db.users = (db.users || []).filter(u => u.id != req.params.id);
    saveDB(db);
    res.json({ success: true });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔗 https://lifemed-healthcare.onrender.com`);
    console.log(`🔑 Email: admin@lifemed.com | Password: admin123`);
});