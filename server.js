const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== DATABASE SETUP ==========
const DB_PATH = './data/db.json';

if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
}

// Initialize database if not exists
if (!fs.existsSync(DB_PATH)) {
    const initialData = {
        products: [],
        doctors: [],
        orders: [],
        appointments: [],
        users: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
    console.log('✅ Database file created');
}

// Helper functions
const getDB = () => {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
};

const saveDB = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// ========== CREATE ADMIN USER ==========
const createAdmin = async () => {
    try {
        const db = getDB();
        
        // Ensure users array exists
        if (!db.users) {
            db.users = [];
        }
        
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
            console.log('✅ Admin created: admin@lifemed.com / admin123');
        }
    } catch (error) {
        console.error('Admin creation error:', error);
    }
};

// Call createAdmin
createAdmin();

// ========== AUTH MIDDLEWARE ==========
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied' });
    }
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

// ========== AUTH APIs ==========
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDB();
        
        if (!db.users) {
            return res.status(401).json({ success: false, message: 'No users found' });
        }
        
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
            'lifemed_secret',
            { expiresIn: '7d' }
        );
        
        res.json({ success: true, token, role: user.role, name: user.name });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/auth/profile', authMiddleware, (req, res) => {
    try {
        const db = getDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (user) {
            const { password, ...userWithoutPassword } = user;
            res.json({ success: true, user: userWithoutPassword });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/admin/profile', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const db = getDB();
        const userIndex = db.users.findIndex(u => u.id === req.user.id);
        
        if (userIndex !== -1) {
            if (name) db.users[userIndex].name = name;
            if (email) db.users[userIndex].email = email;
            if (password) {
                db.users[userIndex].password = await bcrypt.hash(password, 10);
            }
            saveDB(db);
            res.json({ success: true, message: 'Profile updated' });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== WORKER APIs ==========
app.get('/api/admin/workers', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const db = getDB();
        const workers = (db.users || []).filter(u => u.role !== 'admin');
        res.json({ success: true, workers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/workers', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, email, password, role, permissions } = req.body;
        const db = getDB();
        
        if (!db.users) db.users = [];
        
        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newWorker = {
            id: Date.now(),
            name,
            email,
            password: hashedPassword,
            role: role || 'staff',
            permissions: permissions || ['view_products'],
            createdBy: req.user.id
        };
        db.users.push(newWorker);
        saveDB(db);
        res.json({ success: true, worker: newWorker });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/workers/:id', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const db = getDB();
        db.users = (db.users || []).filter(u => u.id != req.params.id);
        saveDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== SAMPLE DATA ==========
let db = getDB();

if (!db.products) db.products = [];
if (!db.doctors) db.doctors = [];
if (!db.orders) db.orders = [];
if (!db.appointments) db.appointments = [];

if (db.products.length === 0) {
    db.products = [
        { id: 1, name: "Baby Pampers", pricePerUnit: 850, totalStock: 100, unitType: "pack" },
        { id: 2, name: "Panadol", pricePerUnit: 120, totalStock: 500, unitType: "strip" }
    ];
    db.doctors = [
        { id: 1, name: "Dr. Ahmed", specialty: "Cardiologist", fees: 1500 },
        { id: 2, name: "Dr. Fatima", specialty: "Dermatologist", fees: 1200 }
    ];
    saveDB(db);
    console.log("✅ Sample data added");
}

// ========== PUBLIC APIs ==========
app.get('/api/products', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, products: db.products || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/doctors', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, doctors: db.doctors || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/orders', (req, res) => {
    try {
        const db = getDB();
        const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: "confirmed" };
        if (!db.orders) db.orders = [];
        db.orders.unshift(order);
        saveDB(db);
        res.json({ success: true, order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/orders', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, orders: (db.orders || []).reverse() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/appointments', (req, res) => {
    try {
        const db = getDB();
        const apt = { id: Date.now(), ...req.body };
        if (!db.appointments) db.appointments = [];
        db.appointments.push(apt);
        saveDB(db);
        res.json({ success: true, appointment: apt });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/appointments', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, appointments: db.appointments || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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
        res.status(500).json({ success: false, message: error.message });
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
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/low-stock', (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, products: (db.products || []).filter(p => p.totalStock < 10) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== ADMIN PROTECTED APIs ==========
app.get('/api/admin/products', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, products: db.products || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const db = getDB();
        const product = { id: Date.now(), ...req.body };
        if (!db.products) db.products = [];
        db.products.push(product);
        saveDB(db);
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const db = getDB();
        db.products = (db.products || []).filter(p => p.id != req.params.id);
        saveDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/admin/doctors', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const db = getDB();
        res.json({ success: true, doctors: db.doctors || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/doctors', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const db = getDB();
        const doctor = { id: Date.now(), ...req.body };
        if (!db.doctors) db.doctors = [];
        db.doctors.push(doctor);
        saveDB(db);
        res.json({ success: true, doctor });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/doctors/:id', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const db = getDB();
        db.doctors = (db.doctors || []).filter(d => d.id != req.params.id);
        saveDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔗 Admin Login: https://lifemed-healthcare.onrender.com/login.html`);
    console.log(`🔑 Email: admin@lifemed.com | Password: admin123`);
});