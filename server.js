const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== SMS SETUP ==========
const TEXT_LOCAL_API_KEY = process.env.TEXT_LOCAL_API_KEY || 'YOUR_API_KEY_HERE';
const SMS_SENDER = 'LIFEMD';

async function sendSMS(phoneNumber, message) {
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://api.textlocal.in/send/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apikey: TEXT_LOCAL_API_KEY,
                numbers: phoneNumber,
                sender: SMS_SENDER,
                message: message
            })
        });
        const data = await response.json();
        if (data.status === 'success') {
            console.log('✅ SMS sent to:', phoneNumber);
            return true;
        } else {
            console.log('❌ SMS failed:', data.errors);
            return false;
        }
    } catch (error) {
        console.log('SMS error:', error.message);
        return false;
    }
}

async function sendOrderSMS(phone, name, orderId, total) {
    const message = `Hi ${name}, your order #${orderId} of ₹${total} is confirmed at LifeMed Health Care. Delivery in 3-5 days. Thank you! - LifeMed`;
    return await sendSMS(phone, message);
}

async function sendAppointmentSMS(phone, name, doctorName, date, time) {
    const message = `Hi ${name}, your appointment with Dr. ${doctorName} on ${date} at ${time} is confirmed. - LifeMed Health Care`;
    return await sendSMS(phone, message);
}

// ========== DATABASE ==========
const DB_FILE = './data/db.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        products: [],
        doctors: [],
        orders: [],
        appointments: [],
        labTests: [],
        labBookings: [],
        users: []
    }));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// ========== SAMPLE DATA ==========
let db = readDB();
if (db.products.length === 0) {
    db.products = [
        { id: 1, name: "Baby Pampers", pricePerUnit: 850, totalStock: 100, unitType: "pack" },
        { id: 2, name: "Panadol", pricePerUnit: 120, totalStock: 500, unitType: "strip" },
        { id: 3, name: "Sunscreen SPF 50", pricePerUnit: 1200, totalStock: 75, unitType: "bottle" }
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

// ========== CREATE ADMIN ==========
(async () => {
    let db = readDB();
    if (!db.users.find(u => u.role === 'admin')) {
        db.users.push({
            id: Date.now(),
            name: 'Admin',
            email: 'admin@lifemed.com',
            password: await bcrypt.hash('admin123', 10),
            role: 'admin'
        });
        writeDB(db);
        console.log('✅ Admin created: admin@lifemed.com / admin123');
    }
})();

// ========== AUTH ==========
const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    try {
        req.user = jwt.verify(token, 'secret');
        next();
    } catch {
        res.status(403).json({ success: false });
    }
};

// Register
app.post('/api/auth/register', async (req, res) => {
    let db = readDB();
    const { name, email, password, phone } = req.body;
    if (db.users.find(u => u.email === email))
        return res.status(400).json({ success: false });
    const hashed = await bcrypt.hash(password, 10);
    const user = { id: Date.now(), name, email, password: hashed, phone, role: 'user' };
    db.users.push(user);
    writeDB(db);
    const token = jwt.sign({ id: user.id, role: user.role }, 'secret');
    res.json({ success: true, token, user });
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password)))
        return res.status(401).json({ success: false });
    const token = jwt.sign({ id: user.id, role: user.role }, 'secret');
    res.json({ success: true, token, name: user.name });
});

// ========== PUBLIC APIs ==========
app.get('/api/products', (req, res) => res.json({ success: true, products: readDB().products }));
app.get('/api/doctors', (req, res) => res.json({ success: true, doctors: readDB().doctors }));
app.get('/api/lab-tests', (req, res) => res.json({ success: true, labTests: readDB().labTests }));

// Order with SMS
app.post('/api/orders', async (req, res) => {
    let db = readDB();
    const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: 'confirmed' };
    order.products?.forEach(item => {
        const p = db.products.find(p => p.id === item.id);
        if (p) p.totalStock -= item.qty;
    });
    db.orders = db.orders || [];
    db.orders.unshift(order);
    writeDB(db);
    
    // Send SMS notification
    if (order.phoneNumber) {
        await sendOrderSMS(order.phoneNumber, order.userName || 'Customer', order.id, order.totalAmount);
    }
    
    res.json({ success: true, order });
});

app.get('/api/orders', (req, res) => res.json({ success: true, orders: (readDB().orders || []).reverse() }));

// Appointment with SMS
app.post('/api/appointments', async (req, res) => {
    let db = readDB();
    db.appointments = db.appointments || [];
    db.appointments.push({ id: Date.now(), ...req.body });
    writeDB(db);
    
    // Send SMS notification
    if (req.body.phone) {
        await sendAppointmentSMS(req.body.phone, req.body.patientName, req.body.doctorName, req.body.date, req.body.time);
    }
    
    res.json({ success: true });
});

app.get('/api/appointments', (req, res) => res.json({ success: true, appointments: readDB().appointments || [] }));

app.post('/api/lab-bookings', (req, res) => {
    let db = readDB();
    db.labBookings = db.labBookings || [];
    db.labBookings.push({ id: Date.now(), ...req.body });
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/lab-bookings', (req, res) => res.json({ success: true, bookings: readDB().labBookings || [] }));

app.get('/api/stats', (req, res) => {
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
});

// ========== ADMIN APIs ==========
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ SMS Notifications: Active`);
});