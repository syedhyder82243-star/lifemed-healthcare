<!DOCTYPE html>
<html>
<head>
    <title>LifeMed Admin Panel</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; }
        .header { background: linear-gradient(135deg, #1a5d7a, #2e7d64); color: white; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; }
        .logo h2 { font-size: 20px; }
        .logo span { color: #ffd700; }
        .logout-btn { background: #e76f51; padding: 6px 15px; border-radius: 25px; cursor: pointer; border: none; color: white; }
        .container { display: flex; min-height: calc(100vh - 70px); }
        .sidebar { width: 260px; background: #0a2a3a; color: white; padding: 20px 0; }
        .sidebar-item { padding: 14px 25px; cursor: pointer; display: flex; align-items: center; gap: 12px; border-left: 3px solid transparent; }
        .sidebar-item:hover { background: rgba(255,255,255,0.1); }
        .sidebar-item.active { background: rgba(255,215,0,0.15); border-left-color: #ffd700; color: #ffd700; }
        .main-content { flex: 1; padding: 25px; overflow-x: auto; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 16px; text-align: center; border-bottom: 4px solid #2e7d64; }
        .stat-card .number { font-size: 32px; font-weight: 800; color: #1a5d7a; }
        .form-card { background: white; padding: 25px; border-radius: 16px; margin-bottom: 30px; }
        .form-card h2 { color: #1a5d7a; border-left: 4px solid #ffd700; padding-left: 15px; margin-bottom: 20px; }
        .form-group { margin-bottom: 15px; display: inline-block; width: 48%; margin-right: 2%; }
        .form-group-full { width: 100%; }
        label { display: block; margin-bottom: 6px; font-weight: 600; color: #1a5d7a; }
        input, select, textarea { width: 100%; padding: 10px 15px; border: 1px solid #ddd; border-radius: 10px; }
        .btn { background: linear-gradient(135deg, #1a5d7a, #2e7d64); color: white; border: none; padding: 10px 24px; border-radius: 30px; cursor: pointer; font-weight: 600; }
        .btn-small { padding: 5px 15px; font-size: 12px; }
        .btn-danger { background: #e76f51; }
        .data-table { background: white; border-radius: 16px; overflow-x: auto; }
        .data-table h2 { padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1a5d7a; color: white; padding: 12px; text-align: left; }
        td { padding: 12px; border-bottom: 1px solid #eee; }
        .status-pending { background: #e9c46a; padding: 4px 12px; border-radius: 20px; font-size: 11px; }
        .status-confirmed { background: #2e7d64; color: white; padding: 4px 12px; border-radius: 20px; }
        .section { display: none; animation: fadeIn 0.3s; }
        .section.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .product-img { width: 40px; height: 40px; object-fit: cover; border-radius: 8px; }
        .image-preview { margin-top: 10px; }
        .image-preview img { width: 60px; border-radius: 8px; }
        @media (max-width: 768px) { .sidebar { width: 80px; } .sidebar-item span { display: none; } .form-group { width: 100%; margin-right: 0; } }
    </style>
</head>
<body>
<div class="header">
    <div class="logo"><h2>LifeMed <span>Health Care</span></h2></div>
    <div class="user-info"><span>👋 <span id="adminName">Admin</span></span><button class="logout-btn" onclick="logout()">Logout</button></div>
</div>
<div class="container">
    <div class="sidebar">
        <div class="sidebar-item active" onclick="showSection('dashboard')">📊 Dashboard</div>
        <div class="sidebar-item" onclick="showSection('products')">📦 Products</div>
        <div class="sidebar-item" onclick="showSection('doctors')">👨‍⚕️ Doctors</div>
        <div class="sidebar-item" onclick="showSection('labtests')">🔬 Lab Tests</div>
        <div class="sidebar-item" onclick="showSection('orders')">📋 Orders</div>
        <div class="sidebar-item" onclick="showSection('appointments')">📅 Appointments</div>
        <div class="sidebar-item" onclick="showSection('labbookings')">🧪 Lab Bookings</div>
        <div class="sidebar-item" onclick="showSection('profile')">👤 Profile</div>
        <div class="sidebar-item" onclick="showSection('workers')">👥 Staff</div>
        <div class="sidebar-item" onclick="showSection('lowstock')">⚠️ Low Stock</div>
    </div>
    <div class="main-content">
        <div id="dashboard" class="section active">
            <div class="stats-grid">
                <div class="stat-card"><h3>Products</h3><div class="number" id="statProducts">0</div></div>
                <div class="stat-card"><h3>Doctors</h3><div class="number" id="statDoctors">0</div></div>
                <div class="stat-card"><h3>Orders</h3><div class="number" id="statOrders">0</div></div>
                <div class="stat-card"><h3>Appointments</h3><div class="number" id="statAppointments">0</div></div>
                <div class="stat-card"><h3>Lab Bookings</h3><div class="number" id="statLabBookings">0</div></div>
                <div class="stat-card"><h3>Low Stock</h3><div class="number" id="statLowStock">0</div></div>
            </div>
            <div class="form-card"><h2>Welcome to LifeMed Admin Panel</h2><p>Manage your healthcare store from here.</p></div>
        </div>

        <div id="products" class="section">
            <div class="form-card">
                <h2>➕ Add Product</h2>
                <div class="form-group"><label>Product Name</label><input type="text" id="prodName"></div>
                <div class="form-group"><label>Category</label><select id="prodCategory"><option>medicine</option><option>baby</option><option>skincare</option><option>daily</option></select></div>
                <div class="form-group"><label>Price (₹)</label><input type="number" id="prodPrice"></div>
                <div class="form-group"><label>Stock</label><input type="number" id="prodStock"></div>
                <div class="form-group"><label>Unit Type</label><input type="text" id="prodUnit" placeholder="box/strip/piece"></div>
                <div class="form-group-full"><label>Image URL</label><input type="text" id="prodImageUrl" placeholder="https://... or leave empty"></div>
                <div class="form-group-full"><label>Description</label><textarea id="prodDesc" rows="2"></textarea></div>
                <button class="btn" onclick="addProduct()">➕ Add Product</button>
            </div>
            <div class="data-table">
                <h2>📦 All Products</h2>
                <table><thead><tr><th>Image</th><th>Name</th><th>Price</th><th>Stock</th><th>Unit</th><th>Actions</th></tr></thead><tbody id="productsList"></tbody></table>
            </div>
        </div>

        <div id="doctors" class="section">
            <div class="form-card">
                <h2>➕ Add Doctor</h2>
                <div class="form-group"><label>Doctor Name</label><input type="text" id="docName"></div>
                <div class="form-group"><label>Specialty</label><input type="text" id="docSpecialty"></div>
                <div class="form-group"><label>Fees (₹)</label><input type="number" id="docFees"></div>
                <div class="form-group"><label>Available Days</label><input type="text" id="docDays" placeholder="Mon, Wed, Fri"></div>
                <div class="form-group"><label>Available Time</label><input type="text" id="docTime" placeholder="10AM-6PM"></div>
                <div class="form-group-full"><label>Image URL</label><input type="text" id="docImageUrl" placeholder="https://... or leave empty"></div>
                <button class="btn" onclick="addDoctor()">➕ Add Doctor</button>
            </div>
            <div class="data-table">
                <h2>👨‍⚕️ All Doctors</h2>
                <table><thead><tr><th>Image</th><th>Name</th><th>Specialty</th><th>Fees</th><th>Actions</th></tr></thead><tbody id="doctorsList"></tbody></table>
            </div>
        </div>

        <div id="labtests" class="section">
            <div class="form-card">
                <h2>➕ Add Lab Test</h2>
                <div class="form-group"><label>Test Name</label><input type="text" id="testName"></div>
                <div class="form-group"><label>Category</label><select id="testCategory"><option>blood</option><option>urine</option><option>imaging</option></select></div>
                <div class="form-group"><label>Price (₹)</label><input type="number" id="testPrice"></div>
                <div class="form-group"><label>Discount (%)</label><input type="number" id="testDiscount" value="0"></div>
                <button class="btn" onclick="addLabTest()">➕ Add Lab Test</button>
            </div>
            <div class="data-table"><h2>🔬 All Lab Tests</h2><table><thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Discounted</th><th>Actions</th></tr></thead><tbody id="labTestsList"></tbody></table></div>
        </div>

        <div id="orders" class="section"><div class="data-table"><h2>📋 Orders</h2><table><thead><tr><th>Order ID</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody id="ordersList"></tbody></table></div></div>

        <div id="appointments" class="section"><div class="data-table"><h2>📅 Appointments</h2><table><thead><tr><th>Patient</th><th>Doctor</th><th>Date</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody id="appointmentsList"></tbody></table></div></div>

        <div id="labbookings" class="section"><div class="data-table"><h2>🧪 Lab Bookings</h2><table><thead><tr><th>Patient</th><th>Test</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody id="labBookingsList"></tbody></table></div></div>

        <div id="profile" class="section">
            <div class="form-card">
                <h2>👤 My Profile</h2>
                <div class="form-group-full"><label>Full Name</label><input type="text" id="profileName"></div>
                <div class="form-group-full"><label>Email</label><input type="email" id="profileEmail"></div>
                <div class="form-group-full"><label>New Password</label><input type="password" id="profilePassword" placeholder="Leave blank to keep same"></div>
                <button class="btn" onclick="updateProfile()">💾 Update Profile</button>
            </div>
        </div>

        <div id="workers" class="section">
            <div class="form-card">
                <h2>➕ Add Staff</h2>
                <div class="form-group"><label>Name</label><input type="text" id="workerName"></div>
                <div class="form-group"><label>Email</label><input type="email" id="workerEmail"></div>
                <div class="form-group"><label>Password</label><input type="password" id="workerPassword"></div>
                <div class="form-group"><label>Role</label><select id="workerRole"><option>staff</option><option>manager</option></select></div>
                <button class="btn" onclick="addWorker()">Create Staff</button>
            </div>
            <div class="data-table"><h2>👥 Staff Members</h2><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead><tbody id="workersList"></tbody></table></div>
        </div>

        <div id="lowstock" class="section"><div class="data-table"><h2>⚠️ Low Stock Products</h2><table><thead><tr><th>Product</th><th>Current Stock</th><th>Unit</th><th>Action</th></tr></thead><tbody id="lowStockList"></tbody></table></div></div>
    </div>
</div>

<script>
    const API = 'https://lifemed-healthcare.onrender.com/api';
    let token = localStorage.getItem('adminToken');
    if (!token) window.location.href = 'login.html';
    document.getElementById('adminName').innerText = localStorage.getItem('adminName') || 'Admin';

    async function fetchAPI(url, options = {}) {
        const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options.headers } });
        if (res.status === 401) { localStorage.removeItem('adminToken'); window.location.href = 'login.html'; }
        return await res.json();
    }

    function showSection(section) {
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(section).classList.add('active');
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        event.target.classList.add('active');
        if (section === 'dashboard') loadStats();
        if (section === 'products') loadProducts();
        if (section === 'doctors') loadDoctors();
        if (section === 'labtests') loadLabTests();
        if (section === 'orders') loadOrders();
        if (section === 'appointments') loadAppointments();
        if (section === 'labbookings') loadLabBookings();
        if (section === 'profile') loadProfile();
        if (section === 'workers') loadWorkers();
        if (section === 'lowstock') loadLowStock();
    }

    async function loadStats() {
        const res = await fetchAPI(`${API}/stats`);
        if (res.success) {
            document.getElementById('statProducts').innerText = res.stats.totalProducts;
            document.getElementById('statDoctors').innerText = res.stats.totalDoctors;
            document.getElementById('statOrders').innerText = res.stats.totalOrders;
            document.getElementById('statAppointments').innerText = res.stats.totalAppointments;
            document.getElementById('statLabBookings').innerText = res.stats.totalLabBookings;
            document.getElementById('statLowStock').innerText = res.stats.lowStock;
        }
    }

    async function addProduct() {
        const product = {
            name: document.getElementById('prodName').value,
            category: document.getElementById('prodCategory').value,
            pricePerUnit: parseFloat(document.getElementById('prodPrice').value),
            totalStock: parseInt(document.getElementById('prodStock').value),
            unitType: document.getElementById('prodUnit').value,
            description: document.getElementById('prodDesc').value,
            imageUrl: document.getElementById('prodImageUrl').value || `https://placehold.co/200x150?text=${encodeURIComponent(document.getElementById('prodName').value)}`
        };
        if (!product.name || !product.pricePerUnit) { alert('Fill required fields'); return; }
        const res = await fetchAPI(`${API}/admin/products`, { method: 'POST', body: JSON.stringify(product) });
        if (res.success) { alert('Product added!'); loadProducts(); loadStats(); }
    }

    async function loadProducts() {
        const res = await fetchAPI(`${API}/products`);
        if (res.success) {
            let html = '';
            res.products.forEach(p => {
                html += `<tr><td><img src="${p.imageUrl || 'https://placehold.co/40x40'}" class="product-img" onerror="this.src='https://placehold.co/40x40'"></td><td>${p.name}</td><td>₹${p.pricePerUnit}</td><td>${p.totalStock}</td><td>${p.unitType || '-'}</td><td><button class="btn-small" onclick="deleteProduct(${p.id})">Delete</button></td></tr>`;
            });
            document.getElementById('productsList').innerHTML = html;
        }
    }

    async function deleteProduct(id) { if(confirm('Delete?')) { await fetchAPI(`${API}/admin/products/${id}`, { method: 'DELETE' }); loadProducts(); loadStats(); } }

    async function addDoctor() {
        const doctor = {
            name: document.getElementById('docName').value,
            specialty: document.getElementById('docSpecialty').value,
            fees: parseFloat(document.getElementById('docFees').value),
            availableDays: document.getElementById('docDays').value,
            availableTime: document.getElementById('docTime').value,
            imageUrl: document.getElementById('docImageUrl').value || `https://placehold.co/100x100?text=👨‍⚕️`
        };
        if (!doctor.name || !doctor.fees) { alert('Fill required fields'); return; }
        const res = await fetchAPI(`${API}/admin/doctors`, { method: 'POST', body: JSON.stringify(doctor) });
        if (res.success) { alert('Doctor added!'); loadDoctors(); loadStats(); }
    }

    async function loadDoctors() {
        const res = await fetchAPI(`${API}/doctors`);
        if (res.success) {
            let html = '';
            res.doctors.forEach(d => {
                html += `<tr><td><img src="${d.imageUrl || 'https://placehold.co/40x40'}" class="product-img" onerror="this.src='https://placehold.co/40x40'"></td><td>${d.name}</td><td>${d.specialty}</td><td>₹${d.fees}</td><td><button class="btn-small" onclick="deleteDoctor(${d.id})">Delete</button></td></tr>`;
            });
            document.getElementById('doctorsList').innerHTML = html;
        }
    }
    async function deleteDoctor(id) { if(confirm('Delete?')) { await fetchAPI(`${API}/admin/doctors/${id}`, { method: 'DELETE' }); loadDoctors(); loadStats(); } }

    async function addLabTest() {
        const test = { name: document.getElementById('testName').value, category: document.getElementById('testCategory').value, price: parseFloat(document.getElementById('testPrice').value), discount: parseFloat(document.getElementById('testDiscount').value) };
        if (!test.name || !test.price) { alert('Fill required fields'); return; }
        const res = await fetchAPI(`${API}/admin/lab-tests`, { method: 'POST', body: JSON.stringify(test) });
        if (res.success) { alert('Lab test added!'); loadLabTests(); }
    }

    async function loadLabTests() {
        const res = await fetchAPI(`${API}/lab-tests`);
        if (res.success && res.labTests) {
            let html = '';
            res.labTests.forEach(t => { html += `<tr><td>${t.name}</td><td>${t.category}</td><td>₹${t.price}</td><td>₹${t.discountedPrice || t.price}</td><td><button class="btn-small" onclick="deleteLabTest(${t.id})">Delete</button></td></tr>`; });
            document.getElementById('labTestsList').innerHTML = html;
        }
    }
    async function deleteLabTest(id) { if(confirm('Delete?')) { await fetchAPI(`${API}/admin/lab-tests/${id}`, { method: 'DELETE' }); loadLabTests(); } }

    async function loadOrders() { const res = await fetchAPI(`${API}/orders`); if (res.success) { let html = ''; res.orders.slice(0,20).forEach(o => { html += `<tr><td>#${o.id}</td><td>${o.products?.length || 0} items</td><td>₹${o.totalAmount}</td><td><span class="status-confirmed">${o.status}</span></td><td>${new Date(o.orderDate).toLocaleDateString()}</td></tr>`; }); document.getElementById('ordersList').innerHTML = html; } }

    async function loadAppointments() {
        const res = await fetchAPI(`${API}/appointments`);
        if (res.success && res.appointments) {
            let html = '';
            res.appointments.forEach(a => { html += `<tr><td>${a.patientName || 'Guest'}</td><td>${a.doctorName}</td><td>${a.date || '-'}</td><td>${a.time || '-'}</td><td><span class="status-${a.status}">${a.status}</span></td><td>${a.status === 'pending' ? `<button class="btn-small" onclick="confirmAppt(${a.id})">Confirm</button>` : '-'}</td></tr>`; });
            document.getElementById('appointmentsList').innerHTML = html;
        }
    }
    async function confirmAppt(id) { await fetchAPI(`${API}/appointments/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'confirmed' }) }); loadAppointments(); }

    async function loadLabBookings() {
        const res = await fetchAPI(`${API}/lab-bookings`);
        if (res.success && res.bookings) {
            let html = '';
            res.bookings.forEach(b => { html += `<tr><td>${b.patientName}</td><td>${b.testName}</td><td>₹${b.totalAmount || b.price}</td><td><span class="status-pending">${b.status}</span></td><td><button class="btn-small" onclick="updateLabBooking(${b.id})">Process</button></td></tr>`; });
            document.getElementById('labBookingsList').innerHTML = html;
        }
    }
    async function updateLabBooking(id) { await fetchAPI(`${API}/lab-bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'processing' }) }); loadLabBookings(); }

    async function loadProfile() { const res = await fetchAPI(`${API}/auth/profile`); if (res.success && res.user) { document.getElementById('profileName').value = res.user.name || ''; document.getElementById('profileEmail').value = res.user.email || ''; } }
    async function updateProfile() {
        const data = { name: document.getElementById('profileName').value, email: document.getElementById('profileEmail').value };
        const pwd = document.getElementById('profilePassword').value;
        if (pwd) data.password = pwd;
        const res = await fetchAPI(`${API}/auth/profile`, { method: 'PUT', body: JSON.stringify(data) });
        if (res.success) { alert('Profile updated!'); localStorage.setItem('adminName', data.name); document.getElementById('adminName').innerText = data.name; }
    }

    async function addWorker() {
        const worker = { name: document.getElementById('workerName').value, email: document.getElementById('workerEmail').value, password: document.getElementById('workerPassword').value, role: document.getElementById('workerRole').value };
        if (!worker.name || !worker.email || !worker.password) { alert('Fill all fields'); return; }
        const res = await fetchAPI(`${API}/admin/workers`, { method: 'POST', body: JSON.stringify(worker) });
        if (res.success) { alert('Staff added!'); loadWorkers(); }
    }
    async function loadWorkers() { const res = await fetchAPI(`${API}/admin/workers`); if (res.success && res.workers) { let html = ''; res.workers.forEach(w => { html += `<table><td>${w.name}</td><td>${w.email}</td><td><span class="badge">${w.role}</span></td><td><button class="btn-small" onclick="deleteWorker(${w.id})">Delete</button></td></tr>`; }); document.getElementById('workersList').innerHTML = html; } }
    async function deleteWorker(id) { if(confirm('Delete?')) { await fetchAPI(`${API}/admin/workers/${id}`, { method: 'DELETE' }); loadWorkers(); } }

    async function loadLowStock() { const res = await fetchAPI(`${API}/low-stock`); if (res.success && res.products) { let html = ''; res.products.forEach(p => { html += `<tr><td>${p.name}</td><td style="color:red">${p.totalStock}</td><td>${p.unitType}</td><td><button class="btn-small" onclick="updateStock(${p.id}, ${p.totalStock})">Add Stock</button></td></tr>`; }); document.getElementById('lowStockList').innerHTML = html; } }
    async function updateStock(id, current) { const newStock = prompt('Enter new stock:', current); if (newStock) { await fetchAPI(`${API}/admin/products/${id}`, { method: 'PUT', body: JSON.stringify({ totalStock: parseInt(newStock) }) }); loadProducts(); loadLowStock(); loadStats(); } }

    function logout() { localStorage.removeItem('adminToken'); localStorage.removeItem('adminName'); window.location.href = 'login.html'; }

    loadStats(); loadProducts(); loadDoctors(); loadLabTests(); loadOrders(); loadAppointments(); loadLabBookings(); loadWorkers(); loadLowStock();
</script>
</body>
</html>