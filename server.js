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
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
        products: [],
        doctors: [],
        orders: [],
        appointments: [],
        labTests: [],
        labBookings: [],
        users: []
    }, null, 2));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_PATH));
const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// ========== SAMPLE DATA (First Time) ==========
let db = readDB();
if (db.products.length === 0) {
    db.products = [
        { id: 1, name: "Baby Pampers", category: "baby", pricePerUnit: 850, totalStock: 100, unitType: "pack", description: "Soft baby diapers" },
        { id: 2, name: "Panadol 500mg", category: "medicine", pricePerUnit: 120, totalStock: 500, unitType: "strip", description: "Fever and pain relief" },
        { id: 3, name: "Sunscreen SPF 50", category: "skincare", pricePerUnit: 1200, discount: 10, totalStock: 75, unitType: "bottle", description: "UV protection" },
        { id: 4, name: "Toothbrush Soft", category: "daily", pricePerUnit: 95, totalStock: 200, unitType: "piece", description: "Soft bristles" }
    ];
    db.doctors = [
        { id: 1, name: "Dr. Ahmed Raza", specialty: "Cardiologist", qualification: "MBBS, FCPS", experience: "10+ years", fees: 1500, availableTime: "10AM-6PM" },
        { id: 2, name: "Dr. Fatima Khan", specialty: "Dermatologist", qualification: "MBBS, MD", experience: "8+ years", fees: 1200, availableTime: "11AM-7PM" },
        { id: 3, name: "Dr. Syed Hyder", specialty: "General Physician", qualification: "MBBS", experience: "5+ years", fees: 800, availableTime: "9AM-5PM" }
    ];
    db.labTests = [
        { id: 1, name: "Complete Blood Count (CBC)", category: "blood", price: 500, preparationInstructions: "Fasting not required", reportTime: "6 hours" },
        { id: 2, name: "Blood Sugar (Fasting)", category: "blood", price: 200, preparationInstructions: "8 hours fasting required", reportTime: "4 hours" },
        { id: 3, name: "Lipid Profile", category: "blood", price: 800, preparationInstructions: "12 hours fasting required", reportTime: "8 hours" },
        { id: 4, name: "Urine Complete Analysis", category: "urine", price: 300, preparationInstructions: "Morning sample preferred", reportTime: "6 hours" }
    ];
    writeDB(db);
    console.log("✅ Sample data added");
}

// ========== CREATE ADMIN USER ==========
const createAdmin = async () => {
    let db = readDB();
    if (!db.users.find(u => u.role === 'admin')) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        db.users.push({
            id: Date.now(),
            name: 'Admin',
            email: 'admin@lifemed.com',
            password: hashedPassword,
            phone: '8214514503',
            role: 'admin'
        });
        writeDB(db);
        console.log("✅ Admin created: admin@lifemed.com / admin123");
    }
};
createAdmin();

// ========== AUTH MIDDLEWARE ==========
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    try {
        const verified = jwt.verify(token, 'lifemed_secret');
        req.user = verified;
        next();
    } catch (error) {
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
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now(),
            name,
            email,
            password: hashedPassword,
            phone,
            role: 'user'
        };
        db.users.push(newUser);
        writeDB(db);
        const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, 'lifemed_secret', { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = readDB();
        const user = db.users.find(u => u.email === email);
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, 'lifemed_secret', { expiresIn: '7d' });
        res.json({ success: true, token, role: user.role, name: user.name, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/auth/profile', authMiddleware, (req, res) => {
    try {
        const db = readDB();
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

// ========== PRODUCT APIS ==========
app.get('/api/products', (req, res) => {
    try {
        const db = readDB();
        const products = db.products.map(p => ({
            ...p,
            discountedPrice: p.discount ? p.pricePerUnit - (p.pricePerUnit * p.discount / 100) : p.pricePerUnit
        }));
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/products', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
        const db = readDB();
        const product = { id: Date.now(), ...req.body };
        db.products.push(product);
        writeDB(db);
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/products/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
        const db = readDB();
        db.products = db.products.filter(p => p.id != req.params.id);
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== DOCTOR APIS ==========
app.get('/api/doctors', (req, res) => {
    try {
        const db = readDB();
        res.json({ success: true, doctors: db.doctors });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/doctors', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
        const db = readDB();
        const doctor = { id: Date.now(), ...req.body };
        db.doctors.push(doctor);
        writeDB(db);
        res.json({ success: true, doctor });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/doctors/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
        const db = readDB();
        db.doctors = db.doctors.filter(d => d.id != req.params.id);
        writeDB(db);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== ORDER APIS ==========
app.post('/api/orders', async (req, res) => {
    try {
        const db = readDB();
        const order = {
            id: Date.now(),
            ...req.body,
            orderDate: new Date(),
            status: 'confirmed'
        };
        // Deduct stock
        if (order.products) {
            order.products.forEach(item => {
                const product = db.products.find(p => p.id === item.id);
                if (product) product.totalStock -= item.qty;
            });
        }
        db.orders.unshift(order);
        writeDB(db);
        res.json({ success: true, order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/orders', (req, res) => {
    try {
        const db = readDB();
        res.json({ success: true, orders: (db.orders || []).reverse() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== APPOINTMENT APIS ==========
app.post('/api/appointments', async (req, res) => {
    try {
        const db = readDB();
        const appointment = { id: Date.now(), ...req.body, createdAt: new Date() };
        if (!db.appointments) db.appointments = [];
        db.appointments.push(appointment);
        writeDB(db);
        res.json({ success: true, appointment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/appointments', (req, res) => {
    try {
        const db = readDB();
        res.json({ success: true, appointments: db.appointments || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/appointments/:id/status', async (req, res) => {
    try {
        const db = readDB();
        const index = (db.appointments || []).findIndex(a => a.id == req.params.id);
        if (index !== -1) {
            db.appointments[index].status = req.body.status;
            writeDB(db);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== LAB TEST APIS ==========
app.get('/api/lab-tests', (req, res) => {
    try {
        const db = readDB();
        res.json({ success: true, labTests: db.labTests || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/lab-tests', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
        const db = readDB();
        const test = { id: Date.now(), ...req.body };
        if (!db.labTests) db.labTests = [];
        db.labTests.push(test);
        writeDB(db);
        res.json({ success: true, labTest: test });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== LAB BOOKING APIS ==========
app.post('/api/lab-bookings', async (req, res) => {
    try {
        const db = readDB();
        const booking = { id: Date.now(), ...req.body, bookingDate: new Date(), status: 'pending' };
        if (!db.labBookings) db.labBookings = [];
        db.labBookings.push(booking);
        writeDB(db);
        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/lab-bookings', (req, res) => {
    try {
        const db = readDB();
        res.json({ success: true, bookings: db.labBookings || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/lab-bookings/:id/status', async (req, res) => {
    try {
        const db = readDB();
        const index = (db.labBookings || []).findIndex(b => b.id == req.params.id);
        if (index !== -1) {
            db.labBookings[index].status = req.body.status;
            writeDB(db);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== STATS API ==========
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
                totalLabBookings: (db.labBookings || []).length,
                lowStock: db.products.filter(p => p.totalStock < 10).length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ========== ADMIN APIS ==========
app.get('/api/admin/products', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    const db = readDB();
    res.json({ success: true, products: db.products });
});

app.get('/api/admin/doctors', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    const db = readDB();
    res.json({ success: true, doctors: db.doctors });
});

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 LifeMed Server running on port ${PORT}`);
    console.log(`🔗 https://lifemed-healthcare.onrender.com`);
    console.log(`🔑 Admin: admin@lifemed.com / admin123`);
});