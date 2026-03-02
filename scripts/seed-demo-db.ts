import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'demo.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Remove existing DB
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Helpers ---

function randomDate(startYear: number, endYear: number): string {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  const d = new Date(start + Math.random() * (end - start));
  return d.toISOString().split('T')[0];
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// --- Create tables ---
db.exec(`
  CREATE TABLE departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    budget REAL NOT NULL,
    headcount_target INTEGER NOT NULL
  );

  CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    hire_date TEXT NOT NULL,
    salary REAL NOT NULL,
    title TEXT NOT NULL,
    level TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE salary_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    effective_date TEXT NOT NULL,
    salary REAL NOT NULL,
    change_reason TEXT NOT NULL
  );

  CREATE TABLE performance_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    review_date TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    reviewer_id INTEGER REFERENCES employees(id),
    comments TEXT
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    price REAL NOT NULL,
    cost REAL NOT NULL,
    stock_quantity INTEGER NOT NULL,
    launch_date TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE product_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    review_date TEXT NOT NULL,
    review_text TEXT
  );

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    region TEXT NOT NULL,
    signup_date TEXT NOT NULL,
    customer_tier TEXT NOT NULL DEFAULT 'standard'
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    order_date TEXT NOT NULL,
    total_amount REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    shipping_cost REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    shipping_method TEXT NOT NULL
  );

  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    discount_pct REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE website_traffic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_date TEXT NOT NULL,
    page TEXT NOT NULL,
    source TEXT NOT NULL,
    sessions INTEGER NOT NULL,
    pageviews INTEGER NOT NULL,
    bounce_rate REAL NOT NULL,
    avg_session_duration_sec REAL NOT NULL
  );

  CREATE TABLE support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    created_date TEXT NOT NULL,
    resolved_date TEXT,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    resolution_time_hours REAL
  );
`);

// --- Seed departments ---

const departments = [
  { name: 'Engineering', location: 'San Francisco', budget: 2500000, target: 25 },
  { name: 'Marketing', location: 'New York', budget: 1200000, target: 12 },
  { name: 'Sales', location: 'Chicago', budget: 1800000, target: 20 },
  { name: 'Human Resources', location: 'San Francisco', budget: 800000, target: 8 },
  { name: 'Finance', location: 'New York', budget: 950000, target: 10 },
  { name: 'Operations', location: 'Austin', budget: 1100000, target: 12 },
  { name: 'Customer Support', location: 'Austin', budget: 750000, target: 15 },
  { name: 'Product', location: 'San Francisco', budget: 1400000, target: 10 },
  { name: 'Data Science', location: 'San Francisco', budget: 1600000, target: 8 },
  { name: 'Legal', location: 'New York', budget: 600000, target: 5 },
];

const insertDept = db.prepare('INSERT INTO departments (name, location, budget, headcount_target) VALUES (?, ?, ?, ?)');
for (const d of departments) {
  insertDept.run(d.name, d.location, d.budget, d.target);
}

// --- Seed employees (150) ---

const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Steven', 'Ashley', 'Paul', 'Dorothy', 'Andrew', 'Kimberly', 'Joshua', 'Emily', 'Kenneth', 'Donna', 'Kevin', 'Michelle', 'Brian', 'Carol', 'George', 'Amanda', 'Timothy', 'Melissa', 'Ronald', 'Deborah', 'Alex', 'Samantha', 'Ryan', 'Nicole', 'Tyler', 'Stephanie', 'Aaron', 'Rachel', 'Justin', 'Laura'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'];

const titlesByDept: Record<string, string[]> = {
  Engineering: ['Software Engineer', 'Senior Engineer', 'Staff Engineer', 'Principal Engineer', 'Engineering Manager', 'DevOps Engineer', 'QA Engineer'],
  Marketing: ['Marketing Analyst', 'Marketing Manager', 'Content Strategist', 'SEO Specialist', 'Brand Manager'],
  Sales: ['Sales Representative', 'Senior Sales Rep', 'Sales Manager', 'Account Executive', 'Sales Director'],
  'Human Resources': ['HR Specialist', 'HR Manager', 'Recruiter', 'Benefits Coordinator'],
  Finance: ['Financial Analyst', 'Senior Analyst', 'Controller', 'Accounting Manager'],
  Operations: ['Operations Manager', 'Operations Analyst', 'Logistics Coordinator', 'Supply Chain Manager'],
  'Customer Support': ['Support Specialist', 'Senior Support', 'Support Manager', 'Technical Support Lead'],
  Product: ['Product Manager', 'Product Designer', 'UX Researcher', 'Product Analyst'],
  'Data Science': ['Data Scientist', 'Senior Data Scientist', 'ML Engineer', 'Data Analyst', 'Analytics Manager'],
  Legal: ['Legal Counsel', 'Paralegal', 'Compliance Officer', 'Contract Specialist'],
};

const levels = ['Junior', 'Mid', 'Senior', 'Lead', 'Principal', 'Director'];
const levelWeights = [15, 30, 25, 15, 10, 5];
const salaryByLevel: Record<string, [number, number]> = {
  Junior: [50000, 75000],
  Mid: [70000, 105000],
  Senior: [95000, 140000],
  Lead: [120000, 170000],
  Principal: [150000, 210000],
  Director: [170000, 250000],
};

const insertEmployee = db.prepare('INSERT INTO employees (first_name, last_name, email, department_id, hire_date, salary, title, level, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const usedEmails = new Set<string>();

for (let i = 0; i < 150; i++) {
  const fn = randomItem(firstNames);
  const ln = randomItem(lastNames);
  let email = `${fn.toLowerCase()}.${ln.toLowerCase()}@company.com`;
  while (usedEmails.has(email)) {
    email = `${fn.toLowerCase()}.${ln.toLowerCase()}${randomInt(1, 999)}@company.com`;
  }
  usedEmails.add(email);
  const deptIdx = randomInt(0, departments.length - 1);
  const deptId = deptIdx + 1;
  const deptName = departments[deptIdx].name;
  const hireDate = randomDate(2016, 2025);
  const level = weightedRandom(levels, levelWeights);
  const [salMin, salMax] = salaryByLevel[level];
  const salary = randomBetween(salMin, salMax);
  const title = randomItem(titlesByDept[deptName] || ['Specialist']);
  const isActive = Math.random() > 0.08 ? 1 : 0; // ~8% have left
  insertEmployee.run(fn, ln, email, deptId, hireDate, salary, title, level, isActive);
}

// --- Seed salary_history ---

const insertSalaryHistory = db.prepare('INSERT INTO salary_history (employee_id, effective_date, salary, change_reason) VALUES (?, ?, ?, ?)');
const changeReasons = ['Initial hire', 'Annual review', 'Promotion', 'Market adjustment', 'Retention bonus'];

for (let empId = 1; empId <= 150; empId++) {
  const emp = db.prepare('SELECT hire_date, salary FROM employees WHERE id = ?').get(empId) as any;
  if (!emp) continue;

  // Initial hire record
  insertSalaryHistory.run(empId, emp.hire_date, emp.salary * randomBetween(0.75, 0.9), 'Initial hire');

  // 1-4 salary changes over time
  const hireYear = parseInt(emp.hire_date.substring(0, 4));
  const changes = randomInt(1, 4);
  let currentSalary = emp.salary * randomBetween(0.75, 0.9);

  for (let j = 0; j < changes; j++) {
    const yearOffset = randomInt(1, 2026 - hireYear);
    const changeDate = randomDate(hireYear + yearOffset, Math.min(hireYear + yearOffset, 2026));
    const raise = randomBetween(1.03, 1.15);
    currentSalary = Math.round(currentSalary * raise * 100) / 100;
    const reason = j === changes - 1 ? 'Annual review' : randomItem(changeReasons.slice(1));
    insertSalaryHistory.run(empId, changeDate, currentSalary, reason);
  }
}

// --- Seed performance_reviews ---

const insertReview = db.prepare('INSERT INTO performance_reviews (employee_id, review_date, rating, reviewer_id, comments) VALUES (?, ?, ?, ?, ?)');
const reviewComments = [
  'Consistently exceeds expectations. Strong technical skills.',
  'Meets expectations. Good team player.',
  'Needs improvement in time management.',
  'Outstanding performance this quarter. Promoted.',
  'Solid contributor with room for growth.',
  'Excellent communication and leadership skills.',
  'Demonstrates strong problem-solving abilities.',
  'Below expectations. PIP recommended.',
  'Great improvement from last review period.',
  'Key contributor to major project delivery.',
];

// Quarterly reviews from 2020-2025
for (let year = 2020; year <= 2025; year++) {
  for (const quarter of ['03-31', '06-30', '09-30', '12-31']) {
    const reviewDate = `${year}-${quarter}`;
    // Review ~60% of employees each quarter
    for (let empId = 1; empId <= 150; empId++) {
      if (Math.random() > 0.6) continue;
      const emp = db.prepare('SELECT hire_date FROM employees WHERE id = ?').get(empId) as any;
      if (!emp || emp.hire_date > reviewDate) continue;

      const rating = weightedRandom([1, 2, 3, 4, 5], [2, 8, 25, 40, 25]);
      const reviewerId = randomInt(1, 150);
      const comment = randomItem(reviewComments);
      insertReview.run(empId, reviewDate, rating, reviewerId === empId ? null : reviewerId, comment);
    }
  }
}

// --- Seed products (50) ---

const products = [
  { name: 'Wireless Keyboard', category: 'Electronics', sub: 'Input Devices', price: 49.99, cost: 22, stock: 150 },
  { name: 'Bluetooth Mouse', category: 'Electronics', sub: 'Input Devices', price: 29.99, cost: 12, stock: 200 },
  { name: 'USB-C Hub 7-Port', category: 'Electronics', sub: 'Adapters', price: 39.99, cost: 18, stock: 120 },
  { name: 'Webcam HD 1080p', category: 'Electronics', sub: 'Cameras', price: 69.99, cost: 30, stock: 90 },
  { name: 'Mechanical Keyboard', category: 'Electronics', sub: 'Input Devices', price: 89.99, cost: 40, stock: 65 },
  { name: '4K Monitor 27"', category: 'Electronics', sub: 'Displays', price: 349.99, cost: 180, stock: 30 },
  { name: 'Ultrawide Monitor 34"', category: 'Electronics', sub: 'Displays', price: 499.99, cost: 260, stock: 20 },
  { name: 'Laptop Stand Adjustable', category: 'Electronics', sub: 'Stands', price: 44.99, cost: 18, stock: 85 },
  { name: 'Noise Cancelling Headphones', category: 'Audio', sub: 'Headphones', price: 149.99, cost: 65, stock: 45 },
  { name: 'Wireless Earbuds', category: 'Audio', sub: 'Earbuds', price: 79.99, cost: 32, stock: 110 },
  { name: 'Portable Speaker', category: 'Audio', sub: 'Speakers', price: 39.99, cost: 16, stock: 75 },
  { name: 'Studio Microphone', category: 'Audio', sub: 'Microphones', price: 129.99, cost: 55, stock: 40 },
  { name: 'Desk Microphone Arm', category: 'Audio', sub: 'Accessories', price: 34.99, cost: 14, stock: 60 },
  { name: 'Monitor Stand Riser', category: 'Accessories', sub: 'Desk Organization', price: 34.99, cost: 14, stock: 80 },
  { name: 'Desk Lamp LED', category: 'Accessories', sub: 'Lighting', price: 24.99, cost: 10, stock: 100 },
  { name: 'Laptop Backpack Pro', category: 'Accessories', sub: 'Bags', price: 59.99, cost: 25, stock: 60 },
  { name: 'Mouse Pad XL', category: 'Accessories', sub: 'Desk Organization', price: 14.99, cost: 4, stock: 250 },
  { name: 'Cable Organizer Kit', category: 'Accessories', sub: 'Desk Organization', price: 9.99, cost: 3, stock: 300 },
  { name: 'Phone Stand Adjustable', category: 'Accessories', sub: 'Stands', price: 19.99, cost: 7, stock: 180 },
  { name: 'Screen Protector 3-Pack', category: 'Accessories', sub: 'Protection', price: 12.99, cost: 3, stock: 400 },
  { name: 'Monitor Light Bar', category: 'Accessories', sub: 'Lighting', price: 44.99, cost: 20, stock: 60 },
  { name: 'Desk Organizer Tray', category: 'Accessories', sub: 'Desk Organization', price: 16.99, cost: 6, stock: 130 },
  { name: 'External SSD 1TB', category: 'Storage', sub: 'External Drives', price: 89.99, cost: 45, stock: 55 },
  { name: 'External SSD 2TB', category: 'Storage', sub: 'External Drives', price: 149.99, cost: 75, stock: 30 },
  { name: 'USB Flash Drive 64GB', category: 'Storage', sub: 'Flash Drives', price: 12.99, cost: 4, stock: 320 },
  { name: 'USB Flash Drive 128GB', category: 'Storage', sub: 'Flash Drives', price: 19.99, cost: 7, stock: 200 },
  { name: 'SD Card 128GB', category: 'Storage', sub: 'Memory Cards', price: 19.99, cost: 8, stock: 200 },
  { name: 'SD Card 256GB', category: 'Storage', sub: 'Memory Cards', price: 34.99, cost: 14, stock: 100 },
  { name: 'Ethernet Cable 10ft', category: 'Networking', sub: 'Cables', price: 7.99, cost: 2, stock: 500 },
  { name: 'Wi-Fi Range Extender', category: 'Networking', sub: 'Routers', price: 29.99, cost: 12, stock: 85 },
  { name: 'Mesh Wi-Fi System', category: 'Networking', sub: 'Routers', price: 199.99, cost: 90, stock: 25 },
  { name: 'HDMI Cable 6ft', category: 'Cables', sub: 'Video Cables', price: 9.99, cost: 3, stock: 350 },
  { name: 'DisplayPort Cable 6ft', category: 'Cables', sub: 'Video Cables', price: 14.99, cost: 5, stock: 180 },
  { name: 'USB-C Cable 3-Pack', category: 'Cables', sub: 'Data Cables', price: 11.99, cost: 4, stock: 280 },
  { name: 'Lightning Cable 3-Pack', category: 'Cables', sub: 'Data Cables', price: 14.99, cost: 5, stock: 220 },
  { name: 'Surge Protector 6-Outlet', category: 'Power', sub: 'Surge Protection', price: 24.99, cost: 10, stock: 120 },
  { name: 'UPS Battery Backup', category: 'Power', sub: 'UPS', price: 89.99, cost: 45, stock: 35 },
  { name: 'Portable Charger 10000mAh', category: 'Power', sub: 'Power Banks', price: 29.99, cost: 12, stock: 150 },
  { name: 'Portable Charger 20000mAh', category: 'Power', sub: 'Power Banks', price: 44.99, cost: 18, stock: 80 },
  { name: 'Wireless Charger Pad', category: 'Power', sub: 'Wireless Chargers', price: 19.99, cost: 7, stock: 170 },
  { name: 'Wireless Charger Stand', category: 'Power', sub: 'Wireless Chargers', price: 29.99, cost: 11, stock: 100 },
  { name: 'Office Chair Cushion', category: 'Furniture', sub: 'Seating', price: 39.99, cost: 16, stock: 40 },
  { name: 'Standing Desk Mat', category: 'Furniture', sub: 'Desk Accessories', price: 49.99, cost: 20, stock: 35 },
  { name: 'Ergonomic Footrest', category: 'Furniture', sub: 'Seating', price: 34.99, cost: 14, stock: 50 },
  { name: 'Desk Shelf Riser', category: 'Furniture', sub: 'Desk Accessories', price: 54.99, cost: 22, stock: 30 },
  { name: 'Webcam Privacy Cover', category: 'Accessories', sub: 'Protection', price: 4.99, cost: 1, stock: 500 },
  { name: 'Blue Light Glasses', category: 'Accessories', sub: 'Wellness', price: 24.99, cost: 8, stock: 120 },
  { name: 'Wrist Rest Keyboard', category: 'Accessories', sub: 'Ergonomics', price: 14.99, cost: 5, stock: 150 },
  { name: 'Wrist Rest Mouse', category: 'Accessories', sub: 'Ergonomics', price: 9.99, cost: 3, stock: 180 },
  { name: 'Docking Station USB-C', category: 'Electronics', sub: 'Adapters', price: 179.99, cost: 85, stock: 40 },
];

const insertProduct = db.prepare('INSERT INTO products (name, category, subcategory, price, cost, stock_quantity, launch_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
for (const p of products) {
  const launchDate = randomDate(2020, 2024);
  insertProduct.run(p.name, p.category, p.sub, p.price, p.cost, p.stock, launchDate, 1);
}

// --- Seed customers (200) ---

const cities = [
  { city: 'New York', state: 'NY', region: 'Northeast' },
  { city: 'Los Angeles', state: 'CA', region: 'West' },
  { city: 'Chicago', state: 'IL', region: 'Midwest' },
  { city: 'Houston', state: 'TX', region: 'South' },
  { city: 'Phoenix', state: 'AZ', region: 'West' },
  { city: 'Philadelphia', state: 'PA', region: 'Northeast' },
  { city: 'San Antonio', state: 'TX', region: 'South' },
  { city: 'San Diego', state: 'CA', region: 'West' },
  { city: 'Dallas', state: 'TX', region: 'South' },
  { city: 'Austin', state: 'TX', region: 'South' },
  { city: 'Jacksonville', state: 'FL', region: 'South' },
  { city: 'San Francisco', state: 'CA', region: 'West' },
  { city: 'Columbus', state: 'OH', region: 'Midwest' },
  { city: 'Indianapolis', state: 'IN', region: 'Midwest' },
  { city: 'Seattle', state: 'WA', region: 'West' },
  { city: 'Denver', state: 'CO', region: 'West' },
  { city: 'Portland', state: 'OR', region: 'West' },
  { city: 'Nashville', state: 'TN', region: 'South' },
  { city: 'Atlanta', state: 'GA', region: 'South' },
  { city: 'Miami', state: 'FL', region: 'South' },
  { city: 'Boston', state: 'MA', region: 'Northeast' },
  { city: 'Detroit', state: 'MI', region: 'Midwest' },
  { city: 'Minneapolis', state: 'MN', region: 'Midwest' },
  { city: 'Charlotte', state: 'NC', region: 'South' },
  { city: 'Raleigh', state: 'NC', region: 'South' },
];

const tiers = ['standard', 'premium', 'enterprise'];
const tierWeights = [60, 30, 10];

const insertCustomer = db.prepare('INSERT INTO customers (first_name, last_name, email, city, state, region, signup_date, customer_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const usedCustomerEmails = new Set<string>();

for (let i = 0; i < 200; i++) {
  const fn = randomItem(firstNames);
  const ln = randomItem(lastNames);
  let email = `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`;
  while (usedCustomerEmails.has(email)) {
    email = `${fn.toLowerCase()}.${ln.toLowerCase()}${randomInt(1, 9999)}@example.com`;
  }
  usedCustomerEmails.add(email);
  const loc = randomItem(cities);
  const signupDate = randomDate(2019, 2025);
  const tier = weightedRandom(tiers, tierWeights);
  insertCustomer.run(fn, ln, email, loc.city, loc.state, loc.region, signupDate, tier);
}

// --- Seed orders (2000) with seasonal patterns ---

const statuses = ['completed', 'shipped', 'processing', 'cancelled', 'refunded', 'pending'];
const statusWeights = [40, 20, 15, 10, 5, 10];
const paymentMethods = ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay'];
const paymentWeights = [40, 20, 20, 12, 8];
const shippingMethods = ['standard', 'express', 'overnight', 'pickup'];
const shippingWeights = [50, 30, 10, 10];
const shippingCosts: Record<string, [number, number]> = {
  standard: [4.99, 7.99],
  express: [9.99, 14.99],
  overnight: [19.99, 29.99],
  pickup: [0, 0],
};

const insertOrder = db.prepare('INSERT INTO orders (customer_id, order_date, total_amount, discount_amount, shipping_cost, status, payment_method, shipping_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_pct) VALUES (?, ?, ?, ?, ?)');

for (let i = 0; i < 2000; i++) {
  const customerId = randomInt(1, 200);
  // Weight toward more recent dates (growth pattern)
  const yearWeights = [10, 15, 25, 50]; // 2023, 2024, 2025, 2026
  const year = weightedRandom([2023, 2024, 2025, 2026], yearWeights);
  const month = randomInt(1, 12);
  const day = randomInt(1, 28);
  const orderDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const status = weightedRandom(statuses, statusWeights);
  const paymentMethod = weightedRandom(paymentMethods, paymentWeights);
  const shippingMethod = weightedRandom(shippingMethods, shippingWeights);
  const [shipMin, shipMax] = shippingCosts[shippingMethod];
  const shippingCost = randomBetween(shipMin, shipMax);

  // Generate 1-6 items per order
  const numItems = weightedRandom([1, 2, 3, 4, 5, 6], [20, 30, 25, 15, 7, 3]);
  let subtotal = 0;

  const orderResult = insertOrder.run(customerId, orderDate, 0, 0, shippingCost, status, paymentMethod, shippingMethod);
  const orderId = orderResult.lastInsertRowid;

  for (let j = 0; j < numItems; j++) {
    const productId = randomInt(1, products.length);
    const quantity = weightedRandom([1, 2, 3, 4, 5], [40, 30, 15, 10, 5]);
    const unitPrice = products[productId - 1].price;
    const discountPct = weightedRandom([0, 5, 10, 15, 20, 25], [50, 15, 15, 10, 7, 3]);
    const lineTotal = quantity * unitPrice * (1 - discountPct / 100);
    subtotal += lineTotal;
    insertItem.run(orderId, productId, quantity, unitPrice, discountPct);
  }

  const discountAmount = Math.round(subtotal * randomBetween(0, 0.05) * 100) / 100;
  const totalAmount = Math.round((subtotal - discountAmount + shippingCost) * 100) / 100;
  db.prepare('UPDATE orders SET total_amount = ?, discount_amount = ? WHERE id = ?').run(totalAmount, discountAmount, orderId);
}

// --- Seed product_reviews (~800) ---

const insertProductReview = db.prepare('INSERT INTO product_reviews (product_id, customer_id, rating, review_date, review_text) VALUES (?, ?, ?, ?, ?)');
const reviewTexts = [
  'Great product, exactly what I needed!',
  'Works well but packaging could be better.',
  'Excellent quality for the price.',
  'Not worth the money. Returned it.',
  'Perfect for my home office setup.',
  'Good product but took forever to ship.',
  'Amazing! Would definitely buy again.',
  'Decent but there are better options out there.',
  'Broke after a week. Very disappointed.',
  'Best purchase I made this year.',
  'Solid build quality and looks great.',
  'Does the job but nothing special.',
  'Five stars! Highly recommend.',
  'Okay for the price point.',
  'Terrible quality control. Avoid.',
];

for (let i = 0; i < 800; i++) {
  const productId = randomInt(1, products.length);
  const customerId = randomInt(1, 200);
  const rating = weightedRandom([1, 2, 3, 4, 5], [5, 10, 20, 35, 30]);
  const reviewDate = randomDate(2022, 2026);
  const reviewText = randomItem(reviewTexts);
  insertProductReview.run(productId, customerId, rating, reviewDate, reviewText);
}

// --- Seed website_traffic (daily data for 2 years) ---

const insertTraffic = db.prepare('INSERT INTO website_traffic (visit_date, page, source, sessions, pageviews, bounce_rate, avg_session_duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?)');
const pages = ['/home', '/products', '/products/detail', '/cart', '/checkout', '/blog', '/about', '/support', '/pricing'];
const sources = ['organic', 'direct', 'social', 'email', 'paid_search', 'referral'];
const sourceWeights = [30, 25, 15, 10, 12, 8];

// Generate daily traffic from 2024-01-01 to 2025-12-31
const trafficStart = new Date(2024, 0, 1);
const trafficEnd = new Date(2025, 11, 31);
const oneDay = 86400000;

for (let d = trafficStart.getTime(); d <= trafficEnd.getTime(); d += oneDay) {
  const date = new Date(d);
  const dateStr = date.toISOString().split('T')[0];
  const dayOfWeek = date.getDay();
  const month = date.getMonth();

  // Weekday/weekend traffic difference
  const weekdayMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1.0;
  // Seasonal pattern: higher in Q4 (holiday shopping)
  const seasonalMultiplier = month >= 9 ? 1.3 : month >= 5 ? 1.1 : 1.0;
  // Growth trend
  const daysSinceStart = (d - trafficStart.getTime()) / oneDay;
  const growthMultiplier = 1 + daysSinceStart * 0.001;

  // Generate 2-4 page/source combos per day
  const combos = randomInt(2, 4);
  for (let c = 0; c < combos; c++) {
    const page = randomItem(pages);
    const source = weightedRandom(sources, sourceWeights);
    const baseSessions = randomInt(50, 500);
    const sessions = Math.round(baseSessions * weekdayMultiplier * seasonalMultiplier * growthMultiplier);
    const pageviews = Math.round(sessions * randomBetween(1.5, 4.0));
    const bounceRate = randomBetween(0.2, 0.7);
    const avgDuration = randomBetween(30, 300);
    insertTraffic.run(dateStr, page, source, sessions, pageviews, bounceRate, avgDuration);
  }
}

// --- Seed support_tickets (600) ---

const insertTicket = db.prepare('INSERT INTO support_tickets (customer_id, created_date, resolved_date, category, priority, status, resolution_time_hours) VALUES (?, ?, ?, ?, ?, ?, ?)');
const ticketCategories = ['billing', 'technical', 'shipping', 'returns', 'account', 'product_inquiry'];
const ticketCategoryWeights = [15, 25, 20, 15, 10, 15];
const priorities = ['low', 'medium', 'high', 'urgent'];
const priorityWeights = [20, 40, 25, 15];
const ticketStatuses = ['open', 'in_progress', 'resolved', 'closed'];
const ticketStatusWeights = [10, 15, 35, 40];

for (let i = 0; i < 600; i++) {
  const customerId = randomInt(1, 200);
  const createdDate = randomDate(2023, 2026);
  const category = weightedRandom(ticketCategories, ticketCategoryWeights);
  const priority = weightedRandom(priorities, priorityWeights);
  const status = weightedRandom(ticketStatuses, ticketStatusWeights);

  let resolvedDate: string | null = null;
  let resolutionTime: number | null = null;

  if (status === 'resolved' || status === 'closed') {
    const hoursToResolve = priority === 'urgent' ? randomBetween(0.5, 8) :
      priority === 'high' ? randomBetween(2, 24) :
      priority === 'medium' ? randomBetween(4, 72) :
      randomBetween(12, 168);
    resolutionTime = Math.round(hoursToResolve * 100) / 100;
    const created = new Date(createdDate);
    created.setHours(created.getHours() + Math.round(hoursToResolve));
    resolvedDate = created.toISOString().split('T')[0];
  }

  insertTicket.run(customerId, createdDate, resolvedDate, category, priority, status, resolutionTime);
}

// Print summary
const tableNames = ['departments', 'employees', 'salary_history', 'performance_reviews', 'products', 'product_reviews', 'customers', 'orders', 'order_items', 'website_traffic', 'support_tickets'];
const counts: Record<string, number> = {};
for (const t of tableNames) {
  counts[t] = (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as any).c;
}

console.log(`Demo database created at: ${DB_PATH}`);
console.log('Table counts:', counts);

db.close();
