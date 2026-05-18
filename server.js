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
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
    res.json({ success: true, imageUrl: `/uploads/${req.file.filename}` });
});

// ========== DATABASE ==========
const DB_FILE = './data/db.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        products: [], doctors: [], orders: [], appointments: [], labTests: [], labBookings: [], users: []
    }));
}
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// ========== SAMPLE DATA ==========
let db = readDB();
if (db.products.length === 0) {
    db.products = [
        { id: 1, name: "Baby Pampers", pricePerUnit: 850, totalStock: 100, unitType: "pack", imageUrl: "" },
        { id: 2, name: "Panadol", pricePerUnit: 120, totalStock: 500, unitType: "strip", imageUrl: "" }
    ];
    db.doctors = [
        { id: 1, name: "Dr. Ahmed", specialty: "Cardiologist", fees: 1500, imageUrl: "" },
        { id: 2, name: "Dr. Fatima", specialty: "Dermatologist", fees: 1200, imageUrl: "" }
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
        console.log('✅ Admin created');
    }
})();

// ========== AUTH MIDDLEWARE ==========
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

// ========== AUTH ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
    let db = readDB();
    const { name, email, password, phone } = req.body;
    if (db.users.find(u => u.email === email)) return res.status(400).json({ success: false });
    const user = { id: Date.now(), name, email, password: await bcrypt.hash(password, 10), phone, role: 'user' };
    db.users.push(user);
    writeDB(db);
    const token = jwt.sign({ id: user.id, role: user.role }, 'secret');
    res.json({ success: true, token, user });
});

app.post('/api/auth/login', async (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
        return res.status(401).json({ success: false });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, 'secret');
    res.json({ success: true, token, name: user.name });
});

// ========== PUBLIC ROUTES ==========
app.get('/api/products', (req, res) => res.json({ success: true, products: readDB().products }));
app.get('/api/doctors', (req, res) => res.json({ success: true, doctors: readDB().doctors }));
app.get('/api/lab-tests', (req, res) => res.json({ success: true, labTests: readDB().labTests }));

app.post('/api/orders', (req, res) => {
    let db = readDB();
    const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: 'confirmed' };
    order.products?.forEach(item => {
        const p = db.products.find(p => p.id === item.id);
        if (p) p.totalStock -= item.qty;
    });
    db.orders = db.orders || [];
    db.orders.unshift(order);
    writeDB(db);
    res.json({ success: true, order });
});

app.get('/api/orders', (req, res) => res.json({ success: true, orders: (readDB().orders || []).reverse() }));

app.post('/api/appointments', (req, res) => {
    let db = readDB();
    db.appointments = db.appointments || [];
    db.appointments.push({ id: Date.now(), ...req.body });
    writeDB(db);
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

// ========== ADMIN ROUTES (Protected) ==========
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
    console.log(`✅ Server on port ${PORT}`);
    console.log(`✅ Image Upload: Active`);
});