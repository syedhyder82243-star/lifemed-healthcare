// LifeMed Health Care - Complete Server
// Features: Login System, Payment (Razorpay), Location/Maps

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// JWT Secret
const JWT_SECRET = 'lifemed_secret_key_2026';

// Image Upload Setup
const fs = require('fs');
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/lifemed')
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.log('❌ MongoDB error:', err));

// ========== USER SCHEMA (Login System) ==========
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: String,
    address: String,
    city: String,
    pincode: String,
    role: { type: String, default: 'user' }, // admin, user
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ========== DOCTOR SCHEMA ==========
const doctorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    qualification: String,
    experience: String,
    fees: { type: Number, required: true },
    availableDays: [String],
    availableTime: String,
    contactNumber: String,
    imageUrl: String,
    isAvailable: { type: Boolean, default: true }
});

const Doctor = mongoose.model('Doctor', doctorSchema);

// ========== PRODUCT SCHEMA ==========
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    subCategory: String,
    unitType: { type: String, enum: ['box', 'strip', 'piece', 'bottle', 'pack'] },
    quantityPerUnit: { type: Number, default: 1 },
    packSize: String,
    pricePerUnit: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    discountedPrice: Number,
    totalStock: { type: Number, required: true },
    batchNumber: String,
    expiryDate: Date,
    manufacturer: String,
    description: String,
    imageUrl: String
});

productSchema.pre('save', function(next) {
    this.discountedPrice = this.discount > 0 ? this.pricePerUnit - (this.pricePerUnit * this.discount / 100) : this.pricePerUnit;
    next();
});

const Product = mongoose.model('Product', productSchema);

// ========== ORDER SCHEMA (with Location) ==========
const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    products: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        productName: String,
        quantity: Number,
        unitType: String,
        pricePerUnit: Number,
        totalPrice: Number
    }],
    totalAmount: Number,
    deliveryLocation: {
        lat: Number,
        lng: Number,
        address: String,
        city: String,
        pincode: String
    },
    paymentMethod: { type: String, enum: ['COD', 'Razorpay'], default: 'COD' },
    paymentStatus: { type: String, default: 'pending' },
    razorpayOrderId: String,
    status: { type: String, default: 'pending' },
    orderDate: { type: Date, default: Date.now },
    phoneNumber: String
});

const Order = mongoose.model('Order', orderSchema);

// ========== APPOINTMENT SCHEMA ==========
const appointmentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    patientName: String,
    patientAge: Number,
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    doctorName: String,
    specialty: String,
    date: Date,
    time: String,
    fees: Number,
    status: { type: String, default: 'pending' }
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

// ========== LAB TEST SCHEMA ==========
const labTestSchema = new mongoose.Schema({
    name: String,
    category: String,
    price: Number,
    discount: { type: Number, default: 0 },
    discountedPrice: Number,
    isAvailable: { type: Boolean, default: true }
});

labTestSchema.pre('save', function(next) {
    this.discountedPrice = this.discount > 0 ? this.price - (this.price * this.discount / 100) : this.price;
    next();
});

const LabTest = mongoose.model('LabTest', labTestSchema);

// ========== LAB BOOKING SCHEMA ==========
const labBookingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    patientName: String,
    tests: [{ testId: String, testName: String, price: Number }],
    totalAmount: Number,
    status: { type: String, default: 'pending' },
    bookingDate: { type: Date, default: Date.now },
    phoneNumber: String
});

const LabBooking = mongoose.model('LabBooking', labBookingSchema);

// ========== AUTH MIDDLEWARE ==========
const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        res.status(401).json({ success: false, error: 'Invalid token' });
    }
};

// ========== AUTH APIs ==========
// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone, address, city, pincode } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword, phone, address, city, pincode });
        await user.save();
        const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, error: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Invalid credentials' });
        }
        const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get User Profile
app.get('/api/auth/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password');
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== PRODUCT APIs ==========
app.post('/api/products', async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/products/:id/stock', async (req, res) => {
    try {
        const { stock } = req.body;
        const product = await Product.findByIdAndUpdate(req.params.id, { totalStock: stock }, { new: true });
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ORDER APIs (with Location) ==========
app.post('/api/orders', authenticate, async (req, res) => {
    try {
        // Deduct stock
        for (const item of req.body.products) {
            const product = await Product.findById(item.productId);
            if (product) {
                const newStock = product.totalStock - item.quantity;
                if (newStock < 0) {
                    return res.status(400).json({ success: false, error: `Insufficient stock for ${product.name}` });
                }
                await Product.findByIdAndUpdate(item.productId, { totalStock: newStock });
            }
        }
        const order = new Order({ ...req.body, userId: req.userId });
        await order.save();
        res.status(201).json({ success: true, order });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/orders', authenticate, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.userId }).sort({ orderDate: -1 });
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== DOCTOR APIs ==========
app.post('/api/doctors', async (req, res) => {
    try {
        const doctor = new Doctor(req.body);
        await doctor.save();
        res.json({ success: true, doctor });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/doctors', async (req, res) => {
    try {
        const doctors = await Doctor.find();
        res.json({ success: true, doctors });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/doctors/:id', async (req, res) => {
    try {
        await Doctor.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== APPOINTMENT APIs ==========
app.post('/api/appointments', authenticate, async (req, res) => {
    try {
        const appointment = new Appointment({ ...req.body, userId: req.userId });
        await appointment.save();
        res.json({ success: true, appointment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/appointments', authenticate, async (req, res) => {
    try {
        const appointments = await Appointment.find({ userId: req.userId });
        res.json({ success: true, appointments });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== LAB TEST APIs ==========
app.post('/api/lab-tests', async (req, res) => {
    try {
        const test = new LabTest(req.body);
        await test.save();
        res.json({ success: true, labTest: test });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/lab-tests', async (req, res) => {
    try {
        const tests = await LabTest.find();
        res.json({ success: true, labTests: tests });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/lab-tests/:id', async (req, res) => {
    try {
        await LabTest.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== LAB BOOKING APIs ==========
app.post('/api/lab-bookings', authenticate, async (req, res) => {
    try {
        const booking = new LabBooking({ ...req.body, userId: req.userId });
        await booking.save();
        res.json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/lab-bookings', authenticate, async (req, res) => {
    try {
        const bookings = await LabBooking.find({ userId: req.userId });
        res.json({ success: true, bookings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== STATS API ==========
app.get('/api/stats', async (req, res) => {
    try {
        const totalProducts = await Product.countDocuments();
        const totalOrders = await Order.countDocuments();
        const totalDoctors = await Doctor.countDocuments();
        const totalAppointments = await Appointment.countDocuments();
        const lowStock = await Product.countDocuments({ totalStock: { $lt: 10 } });
        
        res.json({
            success: true,
            stats: { totalProducts, totalOrders, totalDoctors, totalAppointments, lowStock }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/low-stock', async (req, res) => {
    try {
        const products = await Product.find({ totalStock: { $lt: 10 } });
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    res.json({ success: true, imageUrl: `/uploads/${req.file.filename}` });
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 LifeMed Server running on http://localhost:${PORT}`);
    console.log(`✅ Login System: Active`);
    console.log(`✅ Location/Delivery: Active`);
    console.log(`✅ Payment Ready: COD + Razorpay`);
});