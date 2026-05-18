const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== DATABASE SETUP (safe) ==========
const DATA_DIR = './data';
const DB_FILE = './data/db.json';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        products: [],
        doctors: [],
        orders: [],
        appointments: [],
        labTests: [],
        labBookings: [],
        users: []
    }, null, 2));
}

const readDB = () => {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) {
        return { products: [], doctors: [], orders: [], appointments: [], labTests: [], labBookings: [], users: [] };
    }
};

const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// ========== SAMPLE DATA (only if empty) ==========
const initData = () => {
    let db = readDB();
    let changed = false;

    if (db.products.length === 0) {
        db.products = [
            { id: 1, name: "Baby Pampers", pricePerUnit: 850, totalStock: 100, unitType: "pack" },
            { id: 2, name: "Panadol", pricePerUnit: 120, totalStock: 500, unitType: "strip" },
            { id: 3, name: "Sunscreen SPF 50", pricePerUnit: 1200, totalStock: 75, unitType: "bottle" }
        ];
        changed = true;
    }
    if (db.doctors.length === 0) {
        db.doctors = [
            { id: 1, name: "Dr. Ahmed", specialty: "Cardiologist", fees: 1500 },
            { id: 2, name: "Dr. Fatima", specialty: "Dermatologist", fees: 1200 }
        ];
        changed = true;
    }
    if (db.labTests.length === 0) {
        db.labTests = [
            { id: 1, name: "CBC", price: 500 },
            { id: 2, name: "Blood Sugar", price: 200 }
        ];
        changed = true;
    }
    if (changed) writeDB(db);
};
initData();

// ========== CREATE ADMIN USER ==========
const createAdmin = async () => {
    let db = readDB();
    const adminExists = db.users.find(u => u.role === 'admin');
    if (!adminExists) {
        const hashed = await bcrypt.hash('admin123', 10);
        db.users.push({
            id: Date.now(),
            name: 'Admin',
            email: 'admin@lifemed.com',
            password: hashed,
            role: 'admin'
        });
        writeDB(db);
        console.log("✅ Admin created: admin@lifemed.com / admin123");
    }
};
createAdmin();

// ========== AUTH MIDDLEWARE ==========
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    try {
        req.user = jwt.verify(token, 'lifemed_secret');
        next();
    } catch (err) {
        res.status(403).json({ success: false, message: 'Invalid token' });
    }
};

// ========== AUTH APIS ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        let db = readDB();
        const { name, email, password, phone } = req.body;
        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        const hashed = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now(),
            name,
            email,
            password: hashed,
            phone,
            role: 'user'
        };
        db.users.push(newUser);
        writeDB(db);
        const token = jwt.sign({ id: newUser.id, role: newUser.role }, 'lifemed_secret');
        res.json({ success: true, token, user: newUser });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = readDB();
        const user = db.users.find(u => u.email === email);
        if (!user) return res.status(401).json({ success: false });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false });
        const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
        res.json({ success: true, token, name: user.name });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ========== PUBLIC APIS ==========
app.get('/api/products', (req, res) => {
    try {
        res.json({ success: true, products: readDB().products });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/doctors', (req, res) => {
    try {
        res.json({ success: true, doctors: readDB().doctors });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/lab-tests', (req, res) => {
    try {
        res.json({ success: true, labTests: readDB().labTests });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/orders', (req, res) => {
    try {
        let db = readDB();
        const order = {
            id: Date.now(),
            ...req.body,
            orderDate: new Date(),
            status: 'confirmed'
        };
        if (order.products) {
            order.products.forEach(item => {
                const prod = db.products.find(p => p.id === item.id);
                if (prod) prod.totalStock -= item.qty;
            });
        }
        db.orders = db.orders || [];
        db.orders.unshift(order);
        writeDB(db);
        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/orders', (req, res) => {
    try {
        const db = readDB();
        res.json({ success: true, orders: (db.orders || []).reverse() });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/appointments', (req, res) => {
    try {
        let db = readDB();
        db.appointments = db.appointments || [];
        db.appointments.push({ id: Date.now(), ...req.body, status: 'pending' });
        writeDB(db);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/appointments', (req, res) => {
    try {
        res.json({ success: true, appointments: readDB().appointments || [] });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/lab-bookings', (req, res) => {
    try {
        let db = readDB();
        db.labBookings = db.labBookings || [];
        db.labBookings.push({ id: Date.now(), ...req.body, status: 'pending' });
        writeDB(db);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/lab-bookings', (req, res) => {
    try {
        res.json({ success: true, bookings: readDB().labBookings || [] });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/stats', (req, res) => {
    try {
        const db = readDB();
        res.json({
            success: true,
            stats: {
                totalProducts: db.products.length,
                totalDoctors: db.doctors.length,
                totalOrders: (db.orders || []).length,
                totalAppointments: (db.appointments || []).length,
                lowStock: db.products.filter(p => p.totalStock < 10).length
            }
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ========== ADMIN PROTECTED APIS ==========
app.get('/api/admin/products', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    res.json({ success: true, products: readDB().products });
});

app.post('/api/admin/products', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    let db = readDB();
    db.products.push({ id: Date.now(), ...req.body });
    writeDB(db);
    res.json({ success: true });
});

app.delete('/api/admin/products/:id', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    let db = readDB();
    db.products = db.products.filter(p => p.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/admin/doctors', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    res.json({ success: true, doctors: readDB().doctors });
});

app.post('/api/admin/doctors', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    let db = readDB();
    db.doctors.push({ id: Date.now(), ...req.body });
    writeDB(db);
    res.json({ success: true });
});

app.delete('/api/admin/doctors/:id', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    let db = readDB();
    db.doctors = db.doctors.filter(d => d.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔗 https://lifemed-healthcare.onrender.com`);
    console.log(`🔑 Admin: admin@lifemed.com / admin123`);
});