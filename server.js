const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const DB_PATH = './data/db.json';
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
        products: [{ id: 1, name: "Baby Pampers", pricePerUnit: 850, totalStock: 100, unitType: "pack" }],
        doctors: [{ id: 1, name: "Dr. Ahmed", specialty: "Cardiologist", fees: 1500 }],
        orders: [], appointments: [], labTests: [], labBookings: []
    }));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_PATH));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// Products API
app.get('/api/products', (req, res) => {
    res.json({ success: true, products: getDB().products });
});

app.post('/api/products', (req, res) => {
    const db = getDB();
    const product = { id: Date.now(), ...req.body };
    db.products.push(product);
    saveDB(db);
    res.json({ success: true, product });
});

app.delete('/api/products/:id', (req, res) => {
    const db = getDB();
    db.products = db.products.filter(p => p.id != req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// Doctors API
app.get('/api/doctors', (req, res) => {
    res.json({ success: true, doctors: getDB().doctors });
});

app.post('/api/doctors', (req, res) => {
    const db = getDB();
    const doctor = { id: Date.now(), ...req.body };
    db.doctors.push(doctor);
    saveDB(db);
    res.json({ success: true, doctor });
});

app.delete('/api/doctors/:id', (req, res) => {
    const db = getDB();
    db.doctors = db.doctors.filter(d => d.id != req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// Orders API
app.get('/api/orders', (req, res) => {
    res.json({ success: true, orders: getDB().orders.reverse() });
});

app.post('/api/orders', (req, res) => {
    const db = getDB();
    const order = { id: Date.now(), ...req.body, orderDate: new Date(), status: "confirmed" };
    db.orders.unshift(order);
    saveDB(db);
    res.json({ success: true, order });
});

// Appointments API
app.get('/api/appointments', (req, res) => {
    res.json({ success: true, appointments: getDB().appointments });
});

app.post('/api/appointments', (req, res) => {
    const db = getDB();
    const apt = { id: Date.now(), ...req.body };
    db.appointments.push(apt);
    saveDB(db);
    res.json({ success: true, appointment: apt });
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

app.get('/api/low-stock', (req, res) => {
    res.json({ success: true, products: getDB().products.filter(p => p.totalStock < 10) });
});

// Health check for Railway
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});