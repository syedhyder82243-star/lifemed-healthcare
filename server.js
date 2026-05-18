const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create data folder
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

// Database file path
const DB_PATH = './data/db.json';

// Init database
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
        products: [],
        doctors: [],
        orders: [],
        appointments: [],
        labTests: [],
        labBookings: []
    }));
}

// Helper functions
const getDB = () => JSON.parse(fs.readFileSync(DB_PATH));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// Add sample data
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

// ========== API ROUTES ==========

// Products
app.get('/api/products', (req, res) => {
    const db = getDB();
    res.json({ success: true, products: db.products });
});

app.post('/api/products', (req, res) => {
    const db = getDB();
    const newProduct = { id: Date.now(), ...req.body };
    db.products.push(newProduct);
    saveDB(db);
    res.json({ success: true, product: newProduct });
});

app.delete('/api/products/:id', (req, res) => {
    const db = getDB();
    db.products = db.products.filter(p => p.id != req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// Doctors
app.get('/api/doctors', (req, res) => {
    const db = getDB();
    res.json({ success: true, doctors: db.doctors });
});

app.post('/api/doctors', (req, res) => {
    const db = getDB();
    const newDoctor = { id: Date.now(), ...req.body };
    db.doctors.push(newDoctor);
    saveDB(db);
    res.json({ success: true, doctor: newDoctor });
});

app.delete('/api/doctors/:id', (req, res) => {
    const db = getDB();
    db.doctors = db.doctors.filter(d => d.id != req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// Orders
app.get('/api/orders', (req, res) => {
    const db = getDB();
    res.json({ success: true, orders: db.orders.reverse() });
});

app.post('/api/orders', (req, res) => {
    const db = getDB();
    const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: "confirmed" };
    db.orders.unshift(order);
    saveDB(db);
    res.json({ success: true, order });
});

// Appointments
app.get('/api/appointments', (req, res) => {
    const db = getDB();
    res.json({ success: true, appointments: db.appointments });
});

app.post('/api/appointments', (req, res) => {
    const db = getDB();
    const apt = { id: Date.now(), ...req.body };
    db.appointments.push(apt);
    saveDB(db);
    res.json({ success: true, appointment: apt });
});

// Lab Tests
app.get('/api/lab-tests', (req, res) => {
    const db = getDB();
    res.json({ success: true, labTests: db.labTests });
});

app.post('/api/lab-tests', (req, res) => {
    const db = getDB();
    const test = { id: Date.now(), ...req.body };
    db.labTests.push(test);
    saveDB(db);
    res.json({ success: true, labTest: test });
});

// Lab Bookings
app.get('/api/lab-bookings', (req, res) => {
    const db = getDB();
    res.json({ success: true, bookings: db.labBookings });
});

app.post('/api/lab-bookings', (req, res) => {
    const db = getDB();
    const booking = { id: Date.now(), ...req.body };
    db.labBookings.push(booking);
    saveDB(db);
    res.json({ success: true, booking });
});

// Stats
app.get('/api/stats', (req, res) => {
    const db = getDB();
    res.json({
        success: true,
        stats: {
            totalProducts: db.products.length,
            totalDoctors: db.doctors.length,
            totalOrders: db.orders.length,
            totalAppointments: db.appointments.length,
            totalLabBookings: db.labBookings.length,
            lowStock: db.products.filter(p => p.totalStock < 10).length
        }
    });
});

// Low stock
app.get('/api/low-stock', (req, res) => {
    const db = getDB();
    res.json({ success: true, products: db.products.filter(p => p.totalStock < 10) });
});

// Upload
const upload = multer({ dest: 'uploads/' });
app.post('/api/upload', upload.single('image'), (req, res) => {
    res.json({ success: true, imageUrl: `/uploads/${req.file.filename}` });
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});