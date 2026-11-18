require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3001;
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'database', 'bapi-farma.db');
const uploadDir = path.join(__dirname, '..', 'uploads');
const fs = require('fs');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadDir));

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price > 0),
  stock INTEGER NOT NULL CHECK(stock >= 0),
  category TEXT NOT NULL DEFAULT 'Umum',
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_number TEXT UNIQUE NOT NULL,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL,
  total INTEGER NOT NULL,
  paid INTEGER NOT NULL,
  change INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  cashier TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS transaction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  FOREIGN KEY(transaction_id) REFERENCES transactions(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  store_name TEXT NOT NULL,
  store_address TEXT NOT NULL,
  store_phone TEXT NOT NULL,
  store_email TEXT DEFAULT '',
  store_owner TEXT DEFAULT '',
  store_logo TEXT DEFAULT '',
  cashier_name TEXT DEFAULT 'Kasir',
  discount_enabled INTEGER DEFAULT 1,
  discount_percentage INTEGER DEFAULT 10,
  minimum_discount_amount INTEGER DEFAULT 50000,
  receipt_footer TEXT DEFAULT 'Pembelian tanpa struk tidak dapat dilayani',
  receipt_note TEXT DEFAULT 'Terima kasih telah berbelanja di Bapi Farma',
  primary_color TEXT DEFAULT '#168b72',
  dark_mode INTEGER DEFAULT 0,
  show_logo INTEGER DEFAULT 1,
  show_address INTEGER DEFAULT 1,
  show_phone INTEGER DEFAULT 1,
  show_cashier INTEGER DEFAULT 1,
  show_date INTEGER DEFAULT 1,
  show_time INTEGER DEFAULT 1,
  show_discount INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY CHECK(id=1),
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  photo TEXT DEFAULT '',
  password_hash TEXT NOT NULL
);
`);

if (!db.prepare('PRAGMA table_info(products)').all().some(column => column.name === 'image')) {
  db.exec("ALTER TABLE products ADD COLUMN image TEXT DEFAULT ''");
}

db.exec("INSERT OR IGNORE INTO settings(id,store_name,store_address,store_phone,store_email,store_owner,cashier_name) VALUES(1,'BAPI FARMA','Jl. Yon Zikon 14, Jagakarsa, Jakarta Selatan','0881011804458','info@bapifarma.id','Pemilik','Kasir')");
const seedCount = db.prepare('SELECT COUNT(*) c FROM products').get().c;
if (!seedCount) {
  const seed = db.prepare('INSERT INTO products(name,price,stock,category,description) VALUES(?,?,?,?,?)');
  [
    ['Paracetamol',10000,10,'Obat Bebas','Pereda nyeri dan demam'],
    ['Vitamin C',15000,10,'Suplement','Membantu menjaga daya tahan tubuh'],
    ['Obat Maag',12000,10,'Obat Bebas','Meredakan gejala maag'],
    ['Minyak Kayu Putih',18000,10,'Herbal','Meredakan pegal dan masuk angin'],
    ['Plester Luka',8000,10,'Alat Kesehatan','Pelindung luka kecil'],
    ['Antiseptik',20000,10,'Alat Kesehatan','Membantu membersihkan luka'],
    ['Masker',5000,10,'Alat Kesehatan','Masker kesehatan sekali pakai']
  ].forEach(p => seed.run(...p));
}
if (!db.prepare('SELECT COUNT(*) c FROM admin').get().c) {
  db.prepare('INSERT INTO admin(id,name,username,password_hash) VALUES(1,?,?,?)')
    .run('Administrator','admin',bcrypt.hashSync('admin123',10));
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req,file,next) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return next(new Error('File harus berupa gambar.'));
    next(null,true);
  }
});

app.get('/api/settings', (req,res) => res.json(db.prepare('SELECT * FROM settings WHERE id=1').get()));
app.put('/api/settings', (req,res) => {
  const b = req.body;
  if (!b.store_name?.trim() || !b.store_address?.trim() || !b.store_phone?.trim()) {
    return res.status(400).json({ error:'Data toko wajib diisi.' });
  }
  db.prepare(`UPDATE settings SET store_name=?,store_address=?,store_phone=?,store_email=?,store_owner=?,store_logo=?,
    cashier_name=?,discount_enabled=?,discount_percentage=?,minimum_discount_amount=?,receipt_footer=?,
    receipt_note=?,primary_color=?,dark_mode=?,show_logo=?,show_address=?,show_phone=?,show_cashier=?,
    show_date=?,show_time=?,show_discount=?,updated_at=datetime('now','localtime') WHERE id=1`)
    .run(b.store_name,b.store_address,b.store_phone,b.store_email||'',b.store_owner||'',b.store_logo||'',b.cashier_name||'Kasir',
      b.discount_enabled?1:0,Number(b.discount_percentage)||0,Number(b.minimum_discount_amount)||0,
      b.receipt_footer||'',b.receipt_note||'',b.primary_color||'#168b72',b.dark_mode?1:0,
      b.show_logo?1:0,b.show_address?1:0,b.show_phone?1:0,b.show_cashier?1:0,b.show_date?1:0,b.show_time?1:0,b.show_discount?1:0);
  res.json(db.prepare('SELECT * FROM settings WHERE id=1').get());
});
app.post('/api/settings/reset', (req,res) => {
  db.prepare(`UPDATE settings SET store_name='BAPI FARMA',store_address='Jl. Yon Zikon 14, Jagakarsa, Jakarta Selatan',
    store_phone='0881011804458',store_email='info@bapifarma.id',store_owner='Pemilik',store_logo='',cashier_name='Kasir',
    discount_enabled=1,discount_percentage=10,minimum_discount_amount=50000,
    receipt_footer='Pembelian tanpa struk tidak dapat dilayani',
    receipt_note='Terima kasih telah berbelanja di Bapi Farma',primary_color='#168b72',dark_mode=0,
    show_logo=1,show_address=1,show_phone=1,show_cashier=1,show_date=1,show_time=1,show_discount=1,
    updated_at=datetime('now','localtime') WHERE id=1`).run();
  res.json(db.prepare('SELECT * FROM settings WHERE id=1').get());
});

app.get('/api/admin', (req,res) => {
  const admin=db.prepare('SELECT id,name,username,photo FROM admin WHERE id=1').get();
  res.json(admin);
});
app.put('/api/admin', (req,res) => {
  const {name,username,photo,password}=req.body;
  if(!name?.trim()||!username?.trim()) return res.status(400).json({error:'Nama dan username wajib diisi.'});
  const existing=db.prepare('SELECT id FROM admin WHERE username=? AND id!=1').get(username.trim());
  if(existing) return res.status(400).json({error:'Username sudah digunakan.'});
  if(password){
    if(password.length<6) return res.status(400).json({error:'Password minimal 6 karakter.'});
    db.prepare('UPDATE admin SET name=?,username=?,photo=?,password_hash=? WHERE id=1')
      .run(name.trim(),username.trim(),photo||'',bcrypt.hashSync(password,10));
  }else{
    db.prepare('UPDATE admin SET name=?,username=?,photo=? WHERE id=1')
      .run(name.trim(),username.trim(),photo||'');
  }
  res.json(db.prepare('SELECT id,name,username,photo FROM admin WHERE id=1').get());
});

app.post('/api/upload', upload.single('file'), (req,res) => {
  if (!req.file) return res.status(400).json({error:'File gambar wajib dipilih.'});
  res.json({ url:'/uploads/'+req.file.filename });
});

app.get('/api/products', (req,res) => res.json(db.prepare('SELECT id,name,price,stock,category,description,created_at,updated_at FROM products ORDER BY id DESC').all()));
app.post('/api/products', (req,res) => {
  const {name,price,stock,category,description}=req.body;
  if (!name?.trim()) return res.status(400).json({error:'Nama produk wajib.'});
  if (!Number.isFinite(Number(price)) || Number(price)<=0) return res.status(400).json({error:'Harga harus lebih dari 0.'});
  if (!Number.isInteger(Number(stock)) || Number(stock)<0) return res.status(400).json({error:'Stok tidak valid.'});
  const info=db.prepare('INSERT INTO products(name,price,stock,category,description) VALUES(?,?,?,?,?)')
    .run(name.trim(),Number(price),Number(stock),category||'Umum',description||'');
  res.status(201).json(db.prepare('SELECT id,name,price,stock,category,description,created_at,updated_at FROM products WHERE id=?').get(info.lastInsertRowid));
});
app.put('/api/products/:id', (req,res) => {
  const p=db.prepare('SELECT id FROM products WHERE id=?').get(req.params.id);
  if(!p) return res.status(404).json({error:'Produk tidak ditemukan.'});
  const b=req.body;
  if(!b.name?.trim()) return res.status(400).json({error:'Nama produk wajib.'});
  if(Number(b.price)<=0) return res.status(400).json({error:'Harga harus lebih dari 0.'});
  if(Number(b.stock)<0) return res.status(400).json({error:'Stok tidak valid.'});
  db.prepare(`UPDATE products SET name=?,price=?,stock=?,category=?,description=?,
    updated_at=datetime('now','localtime') WHERE id=?`).run(b.name.trim(),Number(b.price),Number(b.stock),
    b.category||'Umum',b.description||'',req.params.id);
  res.json(db.prepare('SELECT id,name,price,stock,category,description,created_at,updated_at FROM products WHERE id=?').get(req.params.id));
});
app.delete('/api/products/:id',(req,res)=>{
  const p=db.prepare('SELECT id FROM products WHERE id=?').get(req.params.id);
  if(!p) return res.status(404).json({error:'Produk tidak ditemukan.'});
  db.prepare('UPDATE transaction_items SET product_id=NULL WHERE product_id=?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({message:'Produk berhasil dihapus.'});
});

app.get('/api/transactions',(req,res)=>{
  const rows=db.prepare('SELECT * FROM transactions ORDER BY id DESC').all();
  res.json(rows);
});
app.get('/api/transactions/:id',(req,res)=>{
  const tx=db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id);
  if(!tx) return res.status(404).json({error:'Transaksi tidak ditemukan.'});
  tx.items=db.prepare('SELECT * FROM transaction_items WHERE transaction_id=?').all(req.params.id);
  res.json(tx);
});

app.post('/api/transactions',(req,res)=>{
  const {items,payment_method,paid,request_id}=req.body;
  if(!Array.isArray(items)||!items.length) return res.status(400).json({error:'Keranjang masih kosong.'});
  if(request_id){
    const prior=db.prepare('SELECT * FROM transactions WHERE transaction_number=?').get(request_id);
    if(prior) return res.json({...prior,items:db.prepare('SELECT * FROM transaction_items WHERE transaction_id=?').all(prior.id),duplicate:true});
  }
  const settings=db.prepare('SELECT * FROM settings WHERE id=1').get();
  const cart=[];
  for(const item of items){
    if(!item.product_id||Number(item.quantity)<=0) return res.status(400).json({error:'Jumlah produk tidak valid.'});
    const product=db.prepare('SELECT id,name,price,stock FROM products WHERE id=?').get(item.product_id);
    if(!product) return res.status(404).json({error:'Produk tidak tersedia.'});
    if(Number(item.quantity)>product.stock) return res.status(400).json({error:`Stok ${product.name} tidak mencukupi.`});
    cart.push({product,quantity:Number(item.quantity)});
  }
  let subtotal=cart.reduce((n,x)=>n+x.product.price*x.quantity,0);
  const discount=settings.discount_enabled&&subtotal>=settings.minimum_discount_amount
    ?Math.round(subtotal*settings.discount_percentage/100):0;
  const total=subtotal-discount;
  const method=payment_method==='QRIS'?'QRIS':'Tunai';
  let paidAmount=method==='QRIS'?total:Number(paid);
  if(method==='Tunai'&&(!Number.isFinite(paidAmount)||paidAmount<total))
    return res.status(400).json({error:'Uang pembayaran tidak mencukupi.'});
  const change=method==='Tunai'?paidAmount-total:0;
  const run=db.transaction(()=>{
    const date=new Date();
    const number=`BF-${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}-${String(Date.now()).slice(-6)}`;
    const info=db.prepare(`INSERT INTO transactions(transaction_number,subtotal,discount,total,paid,change,payment_method,payment_status,cashier)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(request_id||number,subtotal,discount,total,paidAmount,change,method,'Pembayaran Berhasil',settings.cashier_name);
    const addItem=db.prepare(`INSERT INTO transaction_items(transaction_id,product_id,product_name,price,quantity,subtotal)
      VALUES(?,?,?,?,?,?)`);
    for(const x of cart){
      addItem.run(info.lastInsertRowid,x.product.id,x.product.name,x.product.price,x.quantity,x.product.price*x.quantity);
      db.prepare('UPDATE products SET stock=stock-?,updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
        .run(x.quantity,x.product.id);
    }
    return db.prepare('SELECT * FROM transactions WHERE id=?').get(info.lastInsertRowid);
  });
  try{
    const tx=run();
    tx.items=db.prepare('SELECT * FROM transaction_items WHERE transaction_id=?').all(tx.id);
    res.status(201).json(tx);
  }catch(e){
    res.status(409).json({error:'Transaksi duplikat atau gagal diproses.'});
  }
});

app.get('/api/dashboard',(req,res)=>{
  const tx=db.prepare('SELECT * FROM transactions').all();
  const products=db.prepare('SELECT id FROM products').all();
  const sales=db.prepare(`SELECT substr(created_at,1,10) date,SUM(total) total,COUNT(*) count
    FROM transactions GROUP BY substr(created_at,1,10) ORDER BY date DESC LIMIT 7`).all();
  const popular=db.prepare(`SELECT product_name name,SUM(quantity) qty,SUM(subtotal) total
    FROM transaction_items GROUP BY product_name ORDER BY qty DESC LIMIT 5`).all();
  res.json({totalTransactions:tx.length,totalRevenue:tx.reduce((n,x)=>n+x.total,0),productCount:products.length,
    customerCount:tx.length,recent:tx.slice(-5).reverse(),sales:sales.reverse(),popular});
});

app.use((err,req,res,next)=>{
  res.status(400).json({error:err.message||'Terjadi kesalahan pada server.'});
});
app.listen(port,()=>console.log(`BAPI FARMA backend berjalan di http://localhost:${port}`));
