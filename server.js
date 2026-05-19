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
        { id: 1, name: "Baby Pampers", category: "baby", subCategory: "Diapers", unitType: "pack", packSize: "10 pcs", pricePerUnit: 850, discount: 0, totalStock: 100, batchNumber: "BATCH001", expiryDate: "2026-12-31", manufacturer: "P&G", prescriptionRequired: false, imageUrl: "https://placehold.co/200x150?text=Baby+Pampers", createdBy: "Admin", createdAt: new Date() },
        { id: 2, name: "Panadol 500mg", category: "medicine", subCategory: "Painkiller", unitType: "strip", packSize: "10 tablets", pricePerUnit: 120, discount: 0, totalStock: 500, batchNumber: "BATCH002", expiryDate: "2027-06-30", manufacturer: "GSK", prescriptionRequired: false, imageUrl: "https://placehold.co/200x150?text=Panadol", createdBy: "Admin", createdAt: new Date() }
    ];
    db.doctors = [
        { id: 1, name: "Dr. Ahmed Raza", specialty: "Cardiologist", qualification: "MBBS, FCPS", experience: "10+ years", fees: 1500, availableDays: "Mon, Wed, Fri", availableTime: "10AM-6PM", contactNumber: "9876543210", imageUrl: "https://placehold.co/100x100?text=👨‍⚕️", createdBy: "Admin" },
        { id: 2, name: "Dr. Fatima Khan", specialty: "Dermatologist", qualification: "MBBS, MD", experience: "8+ years", fees: 1200, availableDays: "Tue, Thu, Sat", availableTime: "11AM-7PM", contactNumber: "9876543211", imageUrl: "https://placehold.co/100x100?text=👩‍⚕️", createdBy: "Admin" }
    ];
    db.labTests = [
        { id: 1, name: "Complete Blood Count (CBC)", category: "Blood", price: 500, discount: 0, discountedPrice: 500, preparationInstructions: "No fasting required", reportTime: "6 hours" },
        { id: 2, name: "Blood Sugar (Fasting)", category: "Blood", price: 200, discount: 0, discountedPrice: 200, preparationInstructions: "8 hours fasting required", reportTime: "4 hours" },
        { id: 3, name: "Lipid Profile", category: "Blood", price: 800, discount: 10, discountedPrice: 720, preparationInstructions: "12 hours fasting required", reportTime: "8 hours" }
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
    if (!token) return res.status(401).json({ success: false });
    try {
        req.user = jwt.verify(token, 'lifemed_secret');
        next();
    } catch {
        res.status(403).json({ success: false });
    }
};

const adminAuth = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });
    next();
};

// ========== AUTH ROUTES ==========
app.post('/api/auth/register', async (req, res) => {
    let db = readDB();
    const { name, email, password, phone } = req.body;
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = { id: Date.now(), name, email, password: hashed, phone, role: 'user', status: 'active' };
    db.users.push(user);
    writeDB(db);
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/login', async (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.email === req.body.email);
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (user.status === 'blocked') {
        return res.status(401).json({ success: false, message: 'Account blocked' });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, 'lifemed_secret');
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// ========== CHANGE PASSWORD ==========
app.put('/api/auth/change-password', auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    let db = readDB();
    const userIndex = db.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ success: false });
    
    const isValid = await bcrypt.compare(currentPassword, db.users[userIndex].password);
    if (!isValid) return res.status(401).json({ success: false, message: 'Current password incorrect' });
    
    db.users[userIndex].password = await bcrypt.hash(newPassword, 10);
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/auth/profile', auth, (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (user) {
        const { password, ...userData } = user;
        res.json({ success: true, user: userData });
    } else {
        res.status(404).json({ success: false });
    }
});

app.put('/api/auth/profile', auth, async (req, res) => {
    let db = readDB();
    const index = db.users.findIndex(u => u.id === req.user.id);
    if (index !== -1) {
        if (req.body.name) db.users[index].name = req.body.name;
        if (req.body.email) db.users[index].email = req.body.email;
        if (req.body.phone) db.users[index].phone = req.body.phone;
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// ========== PUBLIC ROUTES ==========
app.get('/api/products', (req, res) => res.json({ success: true, products: readDB().products }));
app.get('/api/doctors', (req, res) => res.json({ success: true, doctors: readDB().doctors }));
app.get('/api/lab-tests', (req, res) => res.json({ success: true, labTests: readDB().labTests }));

// ========== ORDER WITH STOCK DEDUCT & AUDIT ==========
app.post('/api/orders', (req, res) => {
    let db = readDB();
    const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: 'confirmed', createdBy: req.body.userName || 'Customer' };
    if (order.products) {
        order.products.forEach(item => {
            const product = db.products.find(p => p.id === item.id);
            if (product) product.totalStock -= item.qty;
        });
    }
    db.orders = db.orders || [];
    db.orders.unshift(order);
    
    // Add audit log
    db.audit = db.audit || [];
    db.audit.unshift({ timestamp: new Date(), staff: order.userName || 'Customer', action: 'PLACE_ORDER', details: `Order #${order.id} - ₹${order.totalAmount}` });
    
    writeDB(db);
    res.json({ success: true, order });
});

app.get('/api/orders', (req, res) => res.json({ success: true, orders: (readDB().orders || []).reverse() }));

// ========== APPOINTMENTS WITH AUDIT ==========
app.post('/api/appointments', (req, res) => {
    let db = readDB();
    const apt = { id: Date.now(), ...req.body, createdAt: new Date(), status: 'pending' };
    db.appointments = db.appointments || [];
    db.appointments.push(apt);
    writeDB(db);
    res.json({ success: true, appointment: apt });
});

app.get('/api/appointments', (req, res) => res.json({ success: true, appointments: readDB().appointments || [] }));

app.put('/api/appointments/:id/status', async (req, res) => {
    let db = readDB();
    const index = (db.appointments || []).findIndex(a => a.id == req.params.id);
    if (index !== -1) {
        db.appointments[index].status = req.body.status;
        db.appointments[index].confirmedBy = req.body.confirmedBy || 'Admin';
        
        // Add audit log
        db.audit = db.audit || [];
        db.audit.unshift({ timestamp: new Date(), staff: req.body.confirmedBy || 'Admin', action: 'CONFIRM_APPOINTMENT', details: `Appointment with Dr. ${db.appointments[index].doctorName} on ${db.appointments[index].date}` });
        
        writeDB(db);
    }
    res.json({ success: true });
});

// ========== LAB BOOKINGS ==========
app.post('/api/lab-bookings', (req, res) => {
    let db = readDB();
    const booking = { id: Date.now(), ...req.body, createdAt: new Date(), status: 'pending' };
    db.labBookings = db.labBookings || [];
    db.labBookings.push(booking);
    writeDB(db);
    res.json({ success: true, booking });
});

app.get('/api/lab-bookings', (req, res) => res.json({ success: true, bookings: readDB().labBookings || [] }));

app.put('/api/lab-bookings/:id/status', (req, res) => {
    let db = readDB();
    const index = (db.labBookings || []).findIndex(b => b.id == req.params.id);
    if (index !== -1) {
        db.labBookings[index].status = req.body.status;
        writeDB(db);
    }
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
            lowStock: db.products.filter(p => p.totalStock < 10).length
        }
    });
});

// ========== LOW STOCK ==========
app.get('/api/low-stock', (req, res) => res.json({ success: true, products: readDB().products.filter(p => p.totalStock < 10) }));

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ========== ADMIN ROUTES (Protected) ==========
app.get('/api/admin/products', auth, adminAuth, (req, res) => res.json({ success: true, products: readDB().products }));

app.post('/api/admin/products', auth, adminAuth, (req, res) => {
    let db = readDB();
    const product = { id: Date.now(), ...req.body, createdBy: req.user.name || 'Admin', createdAt: new Date() };
    db.products.push(product);
    
    // Add audit log
    db.audit = db.audit || [];
    db.audit.unshift({ timestamp: new Date(), staff: req.user.name || 'Admin', action: 'ADD_PRODUCT', details: `Added product: ${product.name}` });
    
    writeDB(db);
    res.json({ success: true, product });
});

app.put('/api/admin/products/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    const index = db.products.findIndex(p => p.id == req.params.id);
    if (index !== -1) {
        db.products[index] = { ...db.products[index], ...req.body };
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
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
    const doctor = { id: Date.now(), ...req.body, createdBy: req.user.name || 'Admin' };
    db.doctors.push(doctor);
    writeDB(db);
    res.json({ success: true, doctor });
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
    res.json({ success: true, labTest: test });
});

app.delete('/api/admin/lab-tests/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.labTests = db.labTests.filter(t => t.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== USER MANAGEMENT (Admin Only) ==========
app.get('/api/admin/users', auth, adminAuth, (req, res) => {
    const db = readDB();
    const users = db.users.filter(u => u.role !== 'admin');
    res.json({ success: true, users });
});

app.put('/api/admin/users/:id/status', auth, adminAuth, (req, res) => {
    let db = readDB();
    const index = db.users.findIndex(u => u.id == req.params.id);
    if (index !== -1) {
        db.users[index].status = req.body.status;
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

app.delete('/api/admin/users/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.users = db.users.filter(u => u.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== WORKER MANAGEMENT ==========
app.get('/api/admin/workers', auth, adminAuth, (req, res) => {
    const db = readDB();
    const workers = db.users.filter(u => u.role !== 'admin' && u.role !== 'user');
    res.json({ success: true, workers });
});

app.post('/api/admin/workers', auth, adminAuth, async (req, res) => {
    let db = readDB();
    const { name, email, password, role } = req.body;
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const worker = { id: Date.now(), name, email, password: hashed, role: role || 'staff', status: 'active' };
    db.users.push(worker);
    writeDB(db);
    res.json({ success: true, worker });
});

app.delete('/api/admin/workers/:id', auth, adminAuth, (req, res) => {
    let db = readDB();
    db.users = db.users.filter(u => u.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// ========== AUDIT LOG ==========
app.get('/api/admin/audit', auth, adminAuth, (req, res) => {
    const db = readDB();
    res.json({ success: true, audit: (db.audit || []).reverse() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔑 Admin: admin@lifemed.com / admin123`);
});
