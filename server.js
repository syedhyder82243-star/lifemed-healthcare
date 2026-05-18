const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DB_PATH = './data/db.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
        products: [{ id: 1, name: "Baby Pampers", pricePerUnit: 850, totalStock: 100, unitType: "pack" }],
        doctors: [{ id: 1, name: "Dr. Ahmed", specialty: "Cardiologist", fees: 1500 }],
        orders: [], appointments: [], users: []
    }));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_PATH));
const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

const createAdmin = async () => {
    let db = readDB();
    if (!db.users.find(u => u.role === 'admin')) {
        db.users.push({ id: Date.now(), name: 'Admin', email: 'admin@lifemed.com', password: await bcrypt.hash('admin123', 10), role: 'admin' });
        writeDB(db);
        console.log('Admin created');
    }
};
createAdmin();

const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    try { req.user = jwt.verify(token, 'secret'); next(); } catch { res.status(403).json({ success: false }); }
};

// Register API
app.post('/api/auth/register', async (req, res) => {
    let db = readDB();
    const { name, email, password, phone } = req.body;
    if (db.users.find(u => u.email === email)) return res.status(400).json({ success: false, message: 'Email already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now(), name, email, password: hashedPassword, phone, role: 'user' };
    db.users.push(newUser);
    writeDB(db);
    const token = jwt.sign({ id: newUser.id, role: newUser.role }, 'secret');
    res.json({ success: true, token, user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } });
});

// Login API
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = readDB().users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ success: false });
    res.json({ success: true, token: jwt.sign({ id: user.id, role: user.role }, 'secret'), role: user.role, name: user.name });
});

// Public APIs
app.get('/api/products', (req, res) => res.json({ success: true, products: readDB().products }));
app.get('/api/doctors', (req, res) => res.json({ success: true, doctors: readDB().doctors }));

// Order with stock deduction
app.post('/api/orders', (req, res) => {
    let db = readDB();
    const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: 'confirmed' };
    order.products.forEach(item => { let p = db.products.find(p => p.id === item.id); if (p) p.totalStock -= item.qty; });
    db.orders.unshift(order);
    writeDB(db);
    res.json({ success: true, order });
});

app.get('/api/orders', (req, res) => res.json({ success: true, orders: readDB().orders.reverse() }));
app.post('/api/appointments', (req, res) => {
    let db = readDB();
    db.appointments.push({ id: Date.now(), ...req.body });
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
    let db = readDB();
    res.json({ success: true, stats: { totalProducts: db.products.length, totalDoctors: db.doctors.length, totalOrders: db.orders.length, totalAppointments: db.appointments.length, lowStock: db.products.filter(p => p.totalStock < 10).length } });
});

// Admin APIs
app.get('/api/admin/products', auth, (req, res) => res.json({ success: true, products: readDB().products }));
app.post('/api/admin/products', auth, (req, res) => {
    let db = readDB();
    db.products.push({ id: Date.now(), ...req.body });
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/products/:id', auth, (req, res) => {
    let db = readDB();
    db.products = db.products.filter(p => p.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/admin/doctors', auth, (req, res) => res.json({ success: true, doctors: readDB().doctors }));
app.post('/api/admin/doctors', auth, (req, res) => {
    let db = readDB();
    db.doctors.push({ id: Date.now(), ...req.body });
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/admin/doctors/:id', auth, (req, res) => {
    let db = readDB();
    db.doctors = db.doctors.filter(d => d.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server on port ${PORT}`));